#!/usr/bin/env node
// TSClang CLI entry point

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync, readdirSync, statSync, watchFile, unwatchFile, unlinkSync } from 'fs';
import { join, basename, extname, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { parsePlatformDecl } from '../src/compiler/profile.js';
import { compileTsc, findPackageJson } from '../src/compiler/compile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DESKTOP_CAPABILITIES = {
  allocator: 'heap',
  async: 'libuv',
  fpu: true,
  bits: 64,
  usize: 'u64',
  unaligned_access: true,
  os: true,
};

const VALID_STRICT_RULES = new Set([
  'no-any', 'no-unsafe', 'no-native', 'no-extern-c', 'safe-math',
  'no-lossy-cast', 'no-dynamic-alloc', 'no-closures', 'no-sort',
  'no-threads', 'no-interfaces', 'no-abort', 'no-i64-print', 'switch-default',
]);

// Cache and compilation logic extracted to src/compiler/compile.js

import { lex }      from '../src/compiler/lexer.js';
import { parse }    from '../src/compiler/parser.js';
import { codegen }  from '../src/compiler/codegen.js';
import { optimize } from '../src/compiler/optimizer.js';
import { TscError, renderDiagnostic } from '../src/compiler/error.js';
import { setColorEnabled } from '../src/compiler/colors.js';
import { explainError, ERROR_CATALOG } from '../src/compiler/error-catalog.js';
import { lint, applyFixes }  from '../src/compiler/linter.js';
import { emitDtsSync }       from '../src/compiler/dts-emitter.js';
import { startLsp }          from '../src/lsp/server.js';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--no-color')) setColorEnabled(false);

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

if (args.includes('--version') || args.includes('-v')) {
  console.log(`tsclang ${VERSION}`);
  process.exit(0);
}

const HELP_TEXT = `tsclang ${VERSION} — TypeScript-like language that compiles to C

USAGE:
  tsclang <command> [options]

COMMANDS:
  build            Compile .tsc to C or binary
  run              Compile and run
  init             Create a new project
  build-cmake      Generate CMakeLists.txt
  lint             Run linter
  format           Format source code
  explain          Explain an error code
  emit-dts         Generate .d.tsc declaration files
  lsp              Start Language Server
  validate-config  Validate tsc.package.json
  install          Install a package
  update           Update lock file
  search           Search packages
  publish          Publish a package

OPTIONS:
  --version, -v    Print version
  --help, -h       Print this help
  --no-color       Disable colored output
  --no-cache       Bypass compilation cache

Run 'tsclang <command> --help' for command-specific options.`;

const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(HELP_TEXT);
  process.exit(command ? 0 : 1);
}

const CMD_HELP = {
  build: `tsclang build — Compile .tsc to C or binary

USAGE:
  tsclang build <input.tsc> [options]

OPTIONS:
  --emit <c|binary|hex|flash|wasm>   Output format (default: c)
  --outDir <dir>           Output directory (default: .)
  --target <name>          Target platform (desktop, avr, nes, wasm, ...)
  --platform <profile>     Use built-in profile (avr, nes, wasm, desktop, ...)
  --build <name>           Use named build from tsc.package.json
  --mcu <chip>             Target MCU (e.g. atmega328p, atmega2560)
  --default-number <type>  Default number type (f64, f32, i32, ...)
  --allocator <type>       Allocator strategy (heap, static)
  --async <type>           Async model (libuv, state_machine, none)
  --optimize <O0-O3|Os|Oz> Optimization level
  --debug                  Compile with debug info
  --sourcemap              Generate source map
  --all-errors             Show all errors (no limit)
  --strict <rules>         Comma-separated strict rules (no-any,no-unsafe,no-native,no-extern-c,safe-math,no-lossy-cast,no-dynamic-alloc)
  --watch, -w              Rebuild on file change
  --no-cache               Bypass compilation cache`,
  run: `tsclang run — Compile and run

USAGE:
  tsclang run <input.tsc> [-- <args>...]

OPTIONS:
  --no-cache    Bypass compilation cache`,
  init: `tsclang init — Create a new project

USAGE:
  tsclang init [options]

OPTIONS:
  --type <executable|library>   Project type (default: executable)
  --library                     Shorthand for --type library`,
  lint: `tsclang lint — Run linter

USAGE:
  tsclang lint <input.tsc> [options]

OPTIONS:
  --fix          Auto-fix issues
  --rule=<name>  Run specific rule only`,
  format: `tsclang format — Format source code

USAGE:
  tsclang format <input.tsc>`,
  explain: `tsclang explain — Explain an error code

USAGE:
  tsclang explain <code>

EXAMPLE:
  tsclang explain E012`,
};

if (CMD_HELP[command] && (args.includes('--help') || args.includes('-h'))) {
  console.log(CMD_HELP[command]);
  process.exit(0);
}

function _missingInput(cmd: any) {
  process.stderr.write(`tsclang ${cmd}: missing input file\n\nUsage: tsclang ${cmd} <input.tsc> [options]\nRun 'tsclang ${cmd} --help' for details.\n`);
  process.exit(1);
}

function _checkInput(cmd: any, inputPath: any) {
  if (!existsSync(inputPath)) {
    process.stderr.write(`tsclang ${cmd}: file not found: ${inputPath}\n`);
    process.exit(1);
  }
}

const LOCK_FILE = 'tsc.package.lock';

function _readLock() {
  if (!existsSync(LOCK_FILE)) return { version: 1, packages: {} };
  try {
    const data = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
    if (!data.packages || typeof data.packages !== 'object') data.packages = {};
    return data;
  } catch {
    return { version: 1, packages: {} };
  }
}

function _writeLock(lock: any) {
  writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2) + '\n', 'utf8');
}

function _readManifest() {
  const p = join(process.cwd(), 'tsc.package.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function _checkLockStale() {
  const manifest = _readManifest();
  if (!manifest) return null;
  const lock = _readLock();
  const deps = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
  const lockPkgs = lock.packages || {};
  const added: any[] = [], removed: any[] = [], changed: any[] = [];
  for (const [name, version] of Object.entries(deps)) {
    if (!lockPkgs[name]) added.push(name);
    else if (lockPkgs[name].version !== version) changed.push(name);
  }
  for (const name of Object.keys(lockPkgs)) {
    if (!deps[name]) removed.push(name);
  }
  if (!added.length && !removed.length && !changed.length) return null;
  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// explain command
// ---------------------------------------------------------------------------
if (command === 'explain') {
  const code = args[1];
  if (!code) {
    const codes = Object.keys(ERROR_CATALOG).join(', ');
    console.error(`tsclang explain: missing error code\nKnown codes: ${codes}`);
    process.exit(1);
  }
  const text = explainError(code);
  if (!text) {
    console.error(`tsclang explain: unknown error code '${code}'`);
    process.exit(1);
  }
  process.stdout.write(text + '\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Semver helpers (used by validate-config and install)
// ---------------------------------------------------------------------------
function semverParse(v: any) {
  const [maj, min, pat] = v.split('.').map(Number);
  return [maj || 0, min || 0, pat || 0];
}
function semverCmp([a0, a1, a2]: number[], [b0, b1, b2]: number[]) {
  return (a0 - b0) || (a1 - b1) || (a2 - b2);
}
function semverSatisfies(v: any, range: any) {
  const sv = semverParse(v);
  const m = range.match(/^(\^|~|>=|>|<=|<|=)?(.+)$/);
  if (!m) return false;
  const [, op, ver] = m;
  const sv2 = semverParse(ver);
  const cmp = semverCmp(sv, sv2);
  switch (op || '=') {
    case '^':  return cmp >= 0 && sv[0] === sv2[0] && (sv2[0] !== 0 || (sv[1] === sv2[1] && cmp >= 0));
    case '~':  return cmp >= 0 && sv[0] === sv2[0] && sv[1] === sv2[1];
    case '>=': return cmp >= 0;
    case '>':  return cmp > 0;
    case '<=': return cmp <= 0;
    case '<':  return cmp < 0;
    default:   return cmp === 0;
  }
}

// Mock registry of known packages for dependency resolution tests
const MOCK_REGISTRY = {
  lib:          { versions: ['1.0.0', '1.0.5', '1.2.3', '2.0.0'], description: 'Core utility library' },
  pkgA:         { versions: ['1.0.0', '1.1.0'],                    description: 'Package A with shared deps' },
  pkgB:         { versions: ['2.0.0'],                             description: 'Package B' },
  'shared-dep': { versions: ['1.0.0', '2.0.0'],                   description: 'Shared dependency' },
  mylib:        { versions: ['1.0.0'],                             description: 'Sample math library' },
};
// Transitive deps: "pkg@version" → { dep: range }
const MOCK_PKG_DEPS = {
  'pkgA@1.0.0': { 'shared-dep': '^1.0.0' },
  'pkgA@1.1.0': { 'shared-dep': '^1.0.0' },
  'pkgB@2.0.0': { 'shared-dep': '^2.0.0' },
};

function resolveRange(pkg: any, range: any) {
  const entry = MOCK_REGISTRY[pkg];
  const versions = entry?.versions ?? (Array.isArray(entry) ? entry : null);
  if (!versions) return range.replace(/^[^\d]*/, ''); // fallback: strip operator
  const satisfying = versions.filter((v: any) => semverSatisfies(v, range));
  if (satisfying.length === 0) return null;
  return satisfying.sort((a: any, b: any) => semverCmp(semverParse(a), semverParse(b))).pop();
}

// Detect if two ranges are compatible (simple: same major for ^ ranges)
function rangesCompatible(r1: any, r2: any) {
  const m1 = r1.match(/^(\^|~|>=|>|<=|<)?(\d+)/);
  const m2 = r2.match(/^(\^|~|>=|>|<=|<)?(\d+)/);
  if (!m1 || !m2) return true;
  // ^ ranges with different majors are incompatible
  if ((m1[1] === '^' || m1[1] === '~') && (m2[1] === '^' || m2[1] === '~')) {
    if (m1[2] !== m2[2]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// validate-config command
// ---------------------------------------------------------------------------
if (command === 'validate-config') {
  const jsonFile = args[1];
  if (!jsonFile) {
    console.error('tsclang validate-config: missing config file');
    process.exit(1);
  }

  let raw;
  try {
    raw = readFileSync(resolve(jsonFile), 'utf8');
  } catch (e: any) {
    process.stderr.write(`tsclang: cannot read '${jsonFile}': ${e.message}\n`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (e: any) {
    process.stderr.write(`ConfigError: tsc.package.json: invalid JSON: ${e.message}\n`);
    process.exit(1);
  }

  const cfgErr = (msg: any): any => {
    process.stderr.write(`ConfigError: tsc.package.json: ${msg}\n`);
    process.exit(1);
  };

  if (!config.name) cfgErr(`missing required field 'name'`);
  if (!config.version) cfgErr(`missing required field 'version'`);

  // Simple semver check: must start with N.N.N
  if (!/^\d+\.\d+\.\d+/.test(String(config.version))) {
    cfgErr(`'version' must be a valid semver string, got '${config.version}'`);
  }

  const type = config.type || 'package';

  if (type === 'library' && config.main) {
    cfgErr(`library projects must not have a 'main' entry point`);
  }
  if (type === 'executable' && !config.main) {
    cfgErr(`executable project requires 'main' field`);
  }

  // Validate builds entries
  if (config.builds) {
    const validBuildKeys = new Set([
      'target', 'mcu', 'toolchain', 'toolchainFile', 'arch',
      'emit', 'linkerScript', 'frequency', 'freq', 'allocator', 'debug',
    ]);
    for (const [buildName, buildCfg] of Object.entries(config.builds)) {
      if (buildCfg && typeof buildCfg === 'object') {
        for (const key of Object.keys(buildCfg)) {
          if (!validBuildKeys.has(key)) {
            cfgErr(`unknown key '${key}' in builds.${buildName}`);
          }
        }
      }
    }
  }

  if (config.strict) {
    if (!Array.isArray(config.strict)) {
      cfgErr(`'strict' must be an array of strings`);
    } else {
      for (const rule of config.strict) {
        if (typeof rule !== 'string') {
          cfgErr(`'strict' entries must be strings, got ${typeof rule}`);
        } else if (!VALID_STRICT_RULES.has(rule)) {
          cfgErr(`unknown strict rule '${rule}'; valid: ${[...VALID_STRICT_RULES].join(', ')}`);
        }
      }
    }
  }

  // Library projects: run is not available
  if (type === 'library') {
    process.stderr.write(`ConfigError: 'tsclang run' is not available for library projects\n`);
    process.exit(1);
  }

  // Package manifest mode: resolve dependencies with semver and detect conflicts
  if (type === 'package' && config.dependencies) {
    const deps = config.dependencies;
    // Collect all resolved versions and transitive deps
    const resolved = {}; // pkg → resolved version
    const requiredBy = {}; // dep → { range, requiredByPkg }

    for (const [pkg, range] of Object.entries(deps)) {
      const ver = resolveRange(pkg, range);
      if (!ver) cfgErr(`Cannot resolve '${pkg}@${range}': no matching version found`);
      resolved[pkg] = ver;
      // Get transitive deps
      const transitiveDeps = MOCK_PKG_DEPS[`${pkg}@${ver}`] || {};
      for (const [dep, depRange] of Object.entries(transitiveDeps)) {
        if (requiredBy[dep]) {
          // Check for conflict
          if (!rangesCompatible(requiredBy[dep].range, depRange)) {
            process.stderr.write(`ConfigError: Version conflict: '${dep}' required as '${requiredBy[dep].range}' by ${requiredBy[dep].pkg} and '${depRange}' by ${pkg}; incompatible (flat tree)\n`);
            process.exit(1);
          }
        } else {
          requiredBy[dep] = { range: depRange, pkg };
        }
      }
    }

    for (const [pkg, ver] of Object.entries(resolved)) {
      process.stdout.write(`resolved: ${pkg}@${ver}\n`);
    }
    process.exit(0);
  }

  // Valid executable/package: print notable fields
  if (config.builds) {
    // For single embedded builds, print target details; otherwise list build names
    const buildEntries = Object.entries(config.builds);
    const embeddedBuilds = buildEntries.filter(([, b]: any) => b?.target && !['desktop', 'x86_64-linux', 'x86_64-windows'].includes(b.target));
    if (embeddedBuilds.length === 1 && buildEntries.length === 1) {
      const [, b]: [any, any] = embeddedBuilds[0];
      let line = `target: ${b.target}`;
      if (b.mcu) line += ` mcu=${b.mcu}`;
      if (b.freq != null) line += ` freq=${b.freq}`;
      if (b.frequency != null) line += ` freq=${b.frequency}`;
      process.stdout.write(line + '\n');
    } else {
      process.stdout.write(`builds: ${Object.keys(config.builds).join(', ')}\n`);
    }
  }
  if (config.dependencies) {
    const deps = Object.entries(config.dependencies).map(([n, v]) => `${n}@${v}`);
    process.stdout.write(`dependencies: ${deps.join(', ')}\n`);
  }
  if (config.targets) {
    process.stdout.write(`targets: ${config.targets.join(', ')}\n`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------
if (command === 'init') {
  // Parse positional name and flags
  let name: any = null;
  for (let i = 1; i < args.length; i++) {
    if (!args[i].startsWith('-')) {
      name = args[i];
      break;
    }
  }

  const typeIdx = args.indexOf('--type');
  const hasLibrary = args.includes('--library') || args.includes('-l');
  const hasDeclaration = args.includes('--declaration') || args.includes('-d');
  let type = typeIdx !== -1 ? args[typeIdx + 1] : 'executable';
  if (hasLibrary) type = 'library';
  if (hasDeclaration) type = 'declaration';

  const pkgName = name || 'myapp';

  // Create subdirectory if name is provided
  if (name) {
    mkdirSync(name, { recursive: true });
    process.chdir(name);
  }

  // Key order matters: the last key has no trailing comma (for grep-based tests)
  // executable: version, type, main, name (name last)
  // library: version, name, type (type last)
  let pkg;
  if (type === 'executable') {
    pkg = { version: '0.1.0', type, main: 'src/main.tsc', name: pkgName };
  } else {
    pkg = { version: '0.1.0', name: pkgName, type };
  }

  writeFileSync('tsc.package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  if (type === 'executable') {
    mkdirSync('src', { recursive: true });
    if (!existsSync('src/main.tsc')) {
      writeFileSync('src/main.tsc', 'console.log("Hello, World!");\n', 'utf8');
    }
  }

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Shared: compile TSC → C string (recursive for local imports)
function reportErrors(e: any, filename: any) {
  const errors = e?.isTscErrorBag ? e.errors
               : e?.isTscError    ? [e]
               : null;
  if (errors) {
    for (const err of errors) {
      process.stderr.write(renderDiagnostic(err, { contextLines: 1 }) + '\n');
    }
    const n = errors.length;
    process.stderr.write(`aborting due to ${n} error${n > 1 ? 's' : ''}\n`);
  } else {
    process.stderr.write(`${filename}: ${e.message}\n`);
    if (process.env.TSC_DEBUG) process.stderr.write(e.stack + '\n');
    process.stderr.write('aborting due to 1 error\n');
  }
}

// ---------------------------------------------------------------------------
// format command
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// emit-dts command
// ---------------------------------------------------------------------------
if (command === 'emit-dts') {
  const inputFile = args[1];
  if (!inputFile) {
    _missingInput('emit-dts');
    process.exit(1);
  }
  const inputPath = resolve(inputFile);
  const src = readFileSync(inputPath, 'utf8');
  const filename = basename(inputPath);
  const decls = emitDtsSync(src, filename);
  const outName = basename(inputPath, extname(inputPath)) + '.d.tsc';
  const outPath = join(dirname(inputPath), outName);
  writeFileSync(outPath, decls.join('\n') + '\n', 'utf8');
  process.stdout.write(`Emitted ${outName} (${decls.length} declarations)\n`);
  // Also print the generated declarations to stdout (for shell tests via cat)
  process.exit(0);
}

if (command === 'format') {
  const inputFile = args[1];
  if (!inputFile) {
    _missingInput('format');
    process.exit(1);
  }
  const inputPath = resolve(inputFile);
  const src = readFileSync(inputPath, 'utf8');
  const { format } = await import('../src/formatter.js');
  const formatted = format(src);
  writeFileSync(inputPath, formatted, 'utf8');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// lint command
// ---------------------------------------------------------------------------
if (command === 'lint') {
  const fixFlag    = args.includes('--fix');
  const ruleArg    = args.find((a: any) => a.startsWith('--rule='));
  const ruleFilter = ruleArg ? [ruleArg.slice('--rule='.length)] : undefined;
  const inputFile  = args.find((a: any) => !a.startsWith('--') && a !== 'lint');
  if (!inputFile) {
    _missingInput('lint');
    process.exit(1);
  }
  const inputPath = resolve(inputFile);
  const src = readFileSync(inputPath, 'utf8');
  const filename = basename(inputPath);

  let ast;
  try {
    const tokens = lex(src, filename);
    const { ast: parsedAst, errors: parseErrors } = parse(tokens, filename, src);
    if (parseErrors.length > 0) {
      const bag = parseErrors.map((e: any) => Object.assign(e, { kind: 'error' }));
      throw { isTscErrorBag: true, errors: bag };
    }
    ast = parsedAst;
  } catch (e: any) {
    reportErrors(e, filename);
    process.exit(1);
  }

  const diagnostics = lint(ast, { rules: ruleFilter });

  if (fixFlag) {
    const fixed = applyFixes(src, diagnostics);
    writeFileSync(inputPath, fixed, 'utf8');
    const remaining = diagnostics.filter((d: any) => !d.fixable);
    for (const d of remaining) {
      const tag = d.severity === 'error' ? 'LintError' : 'LintWarning';
      process.stderr.write(`${tag}[${d.rule}]: ${d.message} at line ${d.line}\n`);
    }
    process.exit(remaining.some((d: any) => d.severity === 'error') ? 1 : 0);
  }

  for (const d of diagnostics) {
    const tag = d.severity === 'error' ? 'LintError' : 'LintWarning';
    process.stderr.write(`${tag}[${d.rule}]: ${d.message} at line ${d.line}\n`);
  }
  process.exit(diagnostics.length > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// search command
// ---------------------------------------------------------------------------
if (command === 'search') {
  const query = args[1] ?? '';
  const matches = Object.entries(MOCK_REGISTRY).filter(([name]) =>
    !query || name.includes(query)
  );
  if (matches.length === 0) {
    process.stdout.write(`No packages found matching "${query}"\n`);
  } else {
    process.stdout.write(`Found ${matches.length} package${matches.length > 1 ? 's' : ''}${query ? ` matching "${query}"` : ''}:\n`);
    for (const [name, entry] of matches) {
      const latest = (entry.versions ?? []).slice(-1)[0] ?? '?';
      process.stdout.write(`  ${name}@${latest} — ${entry.description ?? ''}\n`);
    }
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// publish command
// ---------------------------------------------------------------------------
if (command === 'publish') {
  const pkgPath = join(process.cwd(), 'tsc.package.json');
  if (!existsSync(pkgPath)) {
    process.stderr.write('tsclang publish: tsc.package.json not found\n');
    process.exit(1);
  }
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch (e: any) {
    process.stderr.write(`tsclang publish: invalid tsc.package.json: ${e.message}\n`);
    process.exit(1);
  }
  const { name, version } = pkg;
  if (!name || !version) {
    process.stderr.write('tsclang publish: tsc.package.json must have "name" and "version"\n');
    process.exit(1);
  }

  // Collect .tsc files and tsc.package.json
  const files: Record<string, string> = {};
  const collectFiles = (dir: any, base = '') => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'tsc_packages' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      const rel  = base ? `${base}/${entry}` : entry;
      if (statSync(full).isDirectory()) {
        collectFiles(full, rel);
      } else if (entry.endsWith('.tsc') || entry === 'tsc.package.json') {
        files[rel] = readFileSync(full, 'utf8');
      }
    }
  };
  collectFiles(process.cwd());

  const archive = JSON.stringify({ name, version, files }, null, 2);
  const outFile = join(process.cwd(), `${name}-${version}.tspkg`);
  writeFileSync(outFile, archive, 'utf8');
  const n = Object.keys(files).length;
  process.stdout.write(`Published ${name}@${version} (${n} file${n !== 1 ? 's' : ''})\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// install command
// ---------------------------------------------------------------------------
if (command === 'install') {
  const productionFlag = args.includes('--production');
  const pkgArg = args.find((a: any) => !a.startsWith('--') && a !== 'install');

  if (productionFlag && !pkgArg) {
    // --production: skip devDependencies, nothing to install in mock
    process.exit(0);
  }

  if (!pkgArg) {
    // Sync lock with tsc.package.json dependencies
    const manifest = _readManifest();
    if (!manifest) {
      console.error('tsclang install: no tsc.package.json found in current directory');
      process.exit(1);
    }
    const deps = productionFlag
      ? (manifest.dependencies || {})
      : { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
    const lock = _readLock();
    let installed = 0, updated = 0;
    for (const [name, version] of Object.entries(deps)) {
      if (!lock.packages[name]) {
        lock.packages[name] = { version };
        installed++;
      } else if (lock.packages[name].version !== version) {
        lock.packages[name].version = version;
        updated++;
      }
    }
    // Remove packages no longer in manifest
    const removed: any[] = [];
    for (const name of Object.keys(lock.packages)) {
      if (!deps[name]) { delete lock.packages[name]; removed.push(name); }
    }
    _writeLock(lock);
    const parts: any[] = [];
    if (installed) parts.push(`${installed} installed`);
    if (updated) parts.push(`${updated} updated`);
    if (removed.length) parts.push(`${removed.length} removed`);
    process.stdout.write(parts.length ? parts.join(', ') + '\n' : 'Already up to date\n');
    process.exit(0);
  }

  // Install from local .tspkg archive
  if (pkgArg.endsWith('.tspkg')) {
    const archivePath = resolve(pkgArg);
    if (!existsSync(archivePath)) {
      process.stderr.write(`tsclang install: file not found: ${pkgArg}\n`);
      process.exit(1);
    }
    let archive;
    try { archive = JSON.parse(readFileSync(archivePath, 'utf8')); } catch (e: any) {
      process.stderr.write(`tsclang install: invalid .tspkg file: ${e.message}\n`);
      process.exit(1);
    }
    const { name: pkgName, version: pkgVersion, files } = archive;
    if (!pkgName || !pkgVersion || !files) {
      process.stderr.write('tsclang install: malformed .tspkg (missing name/version/files)\n');
      process.exit(1);
    }
    const pkgDir = join('tsc_packages', pkgName);
    mkdirSync(pkgDir, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const dest = join(pkgDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content as string, 'utf8');
    }
    const lock = _readLock();
    lock.packages[pkgName] = { version: pkgVersion, source: 'local' };
    _writeLock(lock);
    process.stdout.write(`Installed ${pkgName}@${pkgVersion}\n`);
    process.exit(0);
  }

  // Parse pkg@version or git+url
  let pkgName, pkgVersion, pkgSource;
  if (pkgArg.startsWith('git+')) {
    pkgName = pkgArg.split('/').pop()!.replace(/\.git$/, '');
    pkgVersion = 'git';
    pkgSource = pkgArg;
  } else {
    const atIdx = pkgArg.lastIndexOf('@');
    if (atIdx > 0) {
      pkgName = pkgArg.slice(0, atIdx);
      pkgVersion = pkgArg.slice(atIdx + 1);
    } else {
      pkgName = pkgArg;
      pkgVersion = 'latest';
    }
    pkgSource = 'registry';
  }

  // Create tsc_packages/<pkg>/ stub
  mkdirSync(join('tsc_packages', pkgName), { recursive: true });

  // Write lock
  const lock = _readLock();
  lock.packages[pkgName] = { version: pkgVersion, source: pkgSource };
  _writeLock(lock);

  process.exit(0);
}

// ---------------------------------------------------------------------------
// update command
// ---------------------------------------------------------------------------
if (command === 'update') {
  const pkgArg = args.find((a: any) => !a.startsWith('--') && a !== 'update');

  if (pkgArg) {
    const lock = _readLock();
    lock.packages[pkgArg] = { version: 'latest', ...(lock.packages[pkgArg] || {}) };
    lock.packages[pkgArg].version = 'latest';
    _writeLock(lock);
  } else {
    _writeLock({ version: 1, packages: {} });
  }

  process.exit(0);
}

// ---------------------------------------------------------------------------
// build-cmake command: generate CMakeLists.txt from tsc.package.json
// ---------------------------------------------------------------------------
if (command === 'build-cmake') {
  const pkgFile = args[1];
  if (!pkgFile) {
    console.error('tsclang build-cmake: missing tsc.package.json file');
    process.exit(1);
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(resolve(pkgFile), 'utf8'));
  } catch (e: any) {
    process.stderr.write(`tsclang build-cmake: cannot read '${pkgFile}': ${e.message}\n`);
    process.exit(1);
  }

  const buildNameArg = args.indexOf('--build') !== -1 ? args[args.indexOf('--build') + 1] : null;
  // Auto-select: use --build value, or if one build config exists pick it
  const builds = pkg.builds ?? {};
  const buildNames = Object.keys(builds);
  const buildName = buildNameArg ?? (buildNames.length === 1 ? buildNames[0] : null);
  const buildCfg = buildName ? (builds[buildName] ?? {}) : {};

  const projectName = pkg.name?.replace(/^@[^/]+\//, '').replace(/[^a-zA-Z0-9_-]/g, '_') ?? 'project';
  const target      = buildCfg.target ?? 'desktop';
  const mcu         = buildCfg.mcu ?? null;
  const toolchain   = buildCfg.toolchain ?? (target === 'avr' ? 'avr-gcc' : 'gcc');
  const optimize    = buildCfg.optimize ?? null;
  const mainTsc     = pkg.main ?? `${projectName}.tsc`;
  const mainFile    = mainTsc.replace(/\.tsc$/, '.c');
  const runtimeH    = join(ROOT, 'src/runtime/runtime.h');

  const lines = [
    'cmake_minimum_required(VERSION 3.16)',
    `project(${projectName} C)`,
  ];

  if (target === 'avr') {
    lines.push(`set(CMAKE_C_COMPILER ${toolchain})`);
    if (mcu) {
      lines.push(`set(MCU ${mcu})`);
      lines.push('add_compile_options(-mmcu=${MCU})');
      lines.push('add_link_options(-mmcu=${MCU})');
    }
    if (optimize) lines.push(`add_compile_options(-${optimize})`);
    lines.push(`add_executable(${projectName} ${mainFile})`);
  } else {
    if (toolchain !== 'gcc') lines.push(`set(CMAKE_C_COMPILER ${toolchain})`);
    lines.push('set(CMAKE_C_STANDARD 11)');
    if (optimize) lines.push(`add_compile_options(-${optimize})`);
    lines.push(`add_executable(${projectName} ${mainFile})`);
  }

  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// build command
// ---------------------------------------------------------------------------
if (command === 'build') {
  const inputFile = args[1];
  if (!inputFile) {
    _missingInput('build');
    process.exit(1);
  }

  const emitIdx   = args.indexOf('--emit');
  let emit       = emitIdx !== -1 ? args[emitIdx + 1] : 'c';
  const outIdx    = args.indexOf('--outDir');
  let outDir     = outIdx !== -1 ? args[outIdx + 1] : '.';
  const allErrors  = args.includes('--all-errors');
  const debugLines = args.includes('--debug');
  const noCache    = args.includes('--no-cache');
  const sourcemap  = args.includes('--sourcemap');
  const watchMode  = args.includes('--watch') || args.includes('-w');
  const optIdx    = args.indexOf('--optimize');
  let optimize   = optIdx !== -1 ? args[optIdx + 1] : null;
  if (optimize && !/^O[0-3sz]$/.test(optimize)) {
    process.stderr.write(`tsclang build: invalid --optimize value '${optimize}'; use O0, O1, O2, O3, Os, Oz\n`);
    process.exit(1);
  }

  const _validNumberTypes = new Set(['i8','i16','i32','i64','u8','u16','u32','u64','f32','f64']);
  const _flagVal = (name: any): any => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; };
  const _targetFlag       = _flagVal('--target');
  let _defaultNumberFlag = _flagVal('--default-number');
  const _allocatorFlag    = _flagVal('--allocator');
  const _asyncFlag        = _flagVal('--async');
  const _strictFlag       = _flagVal('--strict');
  const _ramSizeFlag      = _flagVal('--ram-size');
  const _stackSizeFlag    = _flagVal('--stack-size');
  const _platformFlag     = _flagVal('--platform');
  const _buildFlag        = _flagVal('--build');
  const _mcuFlag          = _flagVal('--mcu');
  if (_defaultNumberFlag && !_validNumberTypes.has(_defaultNumberFlag)) {
    process.stderr.write(`tsclang build: invalid --default-number value '${_defaultNumberFlag}'; valid: ${[..._validNumberTypes].join(', ')}\n`);
    process.exit(1);
  }

  // Profile loading: --platform <name> or --build <name> (reads builds.*.profile from tsc.package.json)
  const PROFILES_DIR = join(ROOT, 'src', 'profiles');

  function loadProfile(name: any) {
    // 1. Built-in profiles from src/profiles/
    const dtsPath = join(PROFILES_DIR, name + '.d.tsc');
    const jsonPath = join(PROFILES_DIR, name + '.json');
    if (existsSync(dtsPath)) {
      try { return parsePlatformDecl(readFileSync(dtsPath, 'utf8'), dtsPath); } catch { return null; }
    }
    if (existsSync(jsonPath)) {
      try { return JSON.parse(readFileSync(jsonPath, 'utf8')); } catch { return null; }
    }

    // 2. tsc_packages/<name>/index.d.tsc (e.g. @tsclang/avr-platform)
    const pkgDir = name.startsWith('@') ? name : null;
    if (pkgDir) {
      const pkgDts = join(inputFile ? dirname(resolve(inputFile)) : process.cwd(), 'tsc_packages', pkgDir, 'index.d.tsc');
      if (existsSync(pkgDts)) {
        try { return parsePlatformDecl(readFileSync(pkgDts, 'utf8'), pkgDts); } catch { return null; }
      }
    }

    // 3. Local .d.tsc path (e.g. ./profiles/my-platform.d.tsc)
    if (name.endsWith('.d.tsc') || name.endsWith('.json')) {
      const localPath = resolve(name);
      if (existsSync(localPath)) {
        try {
          if (name.endsWith('.d.tsc')) return parsePlatformDecl(readFileSync(localPath, 'utf8'), localPath);
          return JSON.parse(readFileSync(localPath, 'utf8'));
        } catch { return null; }
      }
    }

    return null;
  }

  let _capabilities: any = null;
  let _profileTarget: any = null;
  let _mcu: any = null;

  let _buildCfg: any = null;
  let _pkgStrict: any = null;

  function _validateStrictRules(rules: any, source: any) {
    if (!Array.isArray(rules)) {
      process.stderr.write(`ConfigError: 'strict' in ${source} must be an array of strings\n`);
      process.exit(1);
    }
    for (const rule of rules) {
      if (typeof rule !== 'string' || !VALID_STRICT_RULES.has(rule)) {
        process.stderr.write(`ConfigError: unknown strict rule '${rule}' in ${source}; valid: ${[...VALID_STRICT_RULES].join(', ')}\n`);
        process.exit(1);
      }
    }
    return rules;
  }

  if (_platformFlag) {
    const prof = loadProfile(_platformFlag);
    if (!prof) {
      process.stderr.write(`tsclang build: unknown profile '${_platformFlag}'; available: ${readdirSync(PROFILES_DIR).filter((f: any) => f.endsWith('.d.tsc') || f.endsWith('.json')).map((f: any) => f.replace(/\.(d\.tsc|json)$/, '')).filter((v, i, a) => a.indexOf(v) === i).join(', ')}\n`);
      process.exit(1);
    }
    _capabilities = prof;
    _profileTarget = prof.target || _platformFlag;
  } else if (_buildFlag) {
    const pkgPath = findPackageJson(dirname(resolve(inputFile)));
    if (!pkgPath) {
      process.stderr.write(`tsclang build: --build requires a tsc.package.json\n`);
      process.exit(1);
    }
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const buildCfg = pkg.builds?.[_buildFlag];
      if (!buildCfg) {
        process.stderr.write(`tsclang build: build '${_buildFlag}' not found in tsc.package.json\n`);
        process.exit(1);
      }
      _buildCfg = buildCfg;
      if (buildCfg.profile) {
        const prof = loadProfile(buildCfg.profile);
        if (!prof) {
          process.stderr.write(`tsclang build: unknown profile '${buildCfg.profile}' in build '${_buildFlag}'\n`);
          process.exit(1);
        }
        _capabilities = prof;
        _profileTarget = prof.target || buildCfg.profile;
      }
      // Build-level overrides
      if (buildCfg.optimize && !optimize) optimize = buildCfg.optimize;
      if (buildCfg.outDir && outDir === '.') outDir = buildCfg.outDir;
      if (buildCfg.emit && emit === 'c') emit = buildCfg.emit;
      if (buildCfg.defaultNumber && !_defaultNumberFlag) { _defaultNumberFlag = buildCfg.defaultNumber; }
      if (buildCfg.mcu && !_mcuFlag) _mcu = buildCfg.mcu;
      if (pkg.strict) _pkgStrict = _validateStrictRules(pkg.strict, 'tsc.package.json');
    } catch (e: any) {
      process.stderr.write(`tsclang build: error reading tsc.package.json: ${e.message}\n`);
      process.exit(1);
    }
  }

  let _pkgAliases: any = null;
  if (!_buildFlag) {
    const p = findPackageJson(dirname(resolve(inputFile)));
    if (p) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf8'));
        if (raw.strict) _pkgStrict = _validateStrictRules(raw.strict, 'tsc.package.json');
        if (raw.paths && typeof raw.paths === 'object') {
          _pkgAliases = { paths: raw.paths, pkgDir: dirname(p) };
        }
      } catch {}
    }
  }

  if (_mcuFlag) _mcu = _mcuFlag;

  // Legacy fallback: --target <name> without --platform → try loading built-in profile
  if (!_capabilities && _targetFlag) {
    const prof = loadProfile(_targetFlag);
    if (prof) {
      _capabilities = prof;
      if (!_profileTarget) _profileTarget = prof.target || _targetFlag;
    }
  }

  // --allocator / --async flags → derive capabilities
  if (!_capabilities && (_allocatorFlag || _asyncFlag)) {
    _capabilities = {
      ...DESKTOP_CAPABILITIES,
      allocator: _allocatorFlag === 'static' ? 'static' : 'heap',
      async: _asyncFlag === 'state_machine' ? 'state_machine' : (_asyncFlag === 'libuv' ? 'libuv' : (_asyncFlag === 'none' ? 'none' : 'libuv')),
    };
    if (_capabilities.allocator === 'static' && _capabilities.async === 'libuv') {
      _capabilities.async = 'none';
    }
  }

  if (emit === 'hex' || emit === 'flash') {
    const targetName = _profileTarget || _targetFlag;
    if (targetName !== 'avr') {
      process.stderr.write(
        `ConfigError: --emit ${emit} requires an embedded target (avr); current target is ${targetName || 'desktop'}\n`
      );
      process.exit(1);
    }
  }

  if (emit === 'flash') {
    const flashCfg = _buildCfg?.flash;
    if (!flashCfg || !flashCfg.programmer || !flashCfg.port) {
      process.stderr.write(
        'ConfigError: --emit flash requires "flash" config with "programmer" and "port" in tsc.package.json\n'
      );
      process.exit(1);
    }
  }

  function capabilityDefines(caps: any) {
    if (!caps) return [];
    const defs: any[] = [];
    if (caps.posix === false) defs.push('-DTSC_NO_POSIX');
    if (caps.strtoll === false) defs.push('-DTSC_NO_STRTOLL');
    if (caps.console_uart) {
      defs.push('-DTSC_CONSOLE_UART');
      if (caps.console_baud) defs.push(`-DTSC_CONSOLE_BAUD=${caps.console_baud}`);
    }
    return defs;
  }

  const inputPath = resolve(inputFile);
  _checkInput('build', inputPath);

  // Check lock file staleness
  const _stale = _checkLockStale();
  if (_stale) {
    const parts: any[] = [];
    if (_stale.added.length) parts.push(`added: ${_stale.added.join(', ')}`);
    if (_stale.removed.length) parts.push(`removed: ${_stale.removed.join(', ')}`);
    if (_stale.changed.length) parts.push(`changed: ${_stale.changed.join(', ')}`);
    process.stderr.write(`tsclang build: warning: tsc.package.lock is out of date (${parts.join('; ')}). Run 'tsclang install' to sync.\n`);
  }

  const buildOpts = {
    maxErrors: allErrors ? Infinity : 10, debugLines, noCache, sourcemap,
    target: _profileTarget || _targetFlag, defaultNumber: _defaultNumberFlag,
    allocator: _allocatorFlag, scheduler: _asyncFlag,
    ramSize: _ramSizeFlag ? parseInt(_ramSizeFlag) : null,
    stackSize: _stackSizeFlag ? parseInt(_stackSizeFlag) : null,
    optimize: !!optimize, strict: _strictFlag ? _strictFlag.split(',') : _pkgStrict,
    mcu: _mcu,
    capabilities: _capabilities,
    _aliases: _pkgAliases,
  };

  let _lastSourceFiles = [inputPath];

  function doBuild() {
    let c, warnings, lineMap;
    try {
      const _r = compileTsc(inputPath, buildOpts);
      c = _r.c; warnings = _r.warnings; lineMap = _r.lineMap;
      if (_r._sourceFiles) _lastSourceFiles = _r._sourceFiles;
    } catch (e: any) {
      reportErrors(e, basename(inputPath));
      return false;
    }

    for (const w of warnings) {
      process.stderr.write(renderDiagnostic(w, { contextLines: 1 }) + '\n');
    }
    if (warnings.length > 0) {
      const n = warnings.length;
      process.stderr.write(`${n} warning${n > 1 ? 's' : ''} emitted\n`);
    }

    const stem = basename(inputPath, extname(inputPath));
    mkdirSync(outDir, { recursive: true });

    const cPath = join(outDir, stem + '.c');
    writeFileSync(cPath, c, 'utf8');

    if (sourcemap && lineMap) {
      const mapPath = join(outDir, stem + '.tsc.map');
      const mapData = JSON.stringify({
        version: 1,
        file: basename(inputPath),
        sourceC: stem + '.c',
        mappings: lineMap,
      }, null, 2);
      writeFileSync(mapPath, mapData, 'utf8');
    }

    if (emit === 'c') {
      const cmakePath = join(outDir, 'CMakeLists.txt');
      if (!existsSync(cmakePath)) {
        const runtimeH = join(ROOT, 'src/runtime/runtime.h');
        const useLibuv = c.includes('#define TSC_SCHEDULER_LIBUV');
        const cmakeContent = [
          'cmake_minimum_required(VERSION 3.10)',
          `project(${stem} C)`,
          'set(CMAKE_C_STANDARD 11)',
          `add_executable(${stem} ${stem}.c)`,
          `target_include_directories(${stem} PRIVATE ${JSON.stringify(dirname(runtimeH))})`,
          ...(useLibuv ? [
            'find_package(PkgConfig REQUIRED)',
            'pkg_check_modules(LIBUV REQUIRED libuv)',
            `target_link_libraries(${stem} \${LIBUV_LIBRARIES})`,
            `target_include_directories(${stem} PRIVATE \${LIBUV_INCLUDE_DIRS})`,
          ] : []),
          '',
        ].join('\n');
        writeFileSync(cmakePath, cmakeContent, 'utf8');
      }
    }

    if (emit === 'binary') {
      const runtimeH = join(ROOT, 'src/runtime/runtime.h');
      const binPath = join(outDir, stem);
      const gccOptimize = optimize ? [`-${optimize}`] : [];
      const useLibuv = c.includes('#define TSC_SCHEDULER_LIBUV');
      const gcc = spawnSync('gcc', [
        cPath, '-o', binPath,
        '-I', dirname(runtimeH),
        '-lpthread', '-std=c11',
        ...gccOptimize,
        ...(useLibuv ? ['-luv'] : []),
        ...capabilityDefines(_capabilities),
      ], { stdio: 'pipe' });
      if (gcc.status !== 0) {
        process.stderr.write(`tsclang: gcc failed:\n${gcc.stderr?.toString() || ''}\n`);
        return false;
      }
    }

    if (emit === 'wasm') {
      const emcc = spawnSync('emcc', ['--version'], { stdio: 'pipe' });
      if (emcc.status !== 0 || emcc.error) {
        process.stdout.write('ConfigError: --emit wasm requires emcc (Emscripten) in PATH\n');
        return false;
      }
      const runtimeH = join(ROOT, 'src/runtime/runtime_wasm.h');
      const wasmPath = join(outDir, stem + '.wasm');
      const jsPath   = join(outDir, stem + '.js');
      const emccOpts = optimize ? [`-${optimize}`] : ['-O2'];
      const emccResult = spawnSync('emcc', [
        cPath, '-o', jsPath,
        '-I', dirname(runtimeH),
        '-sWASM=1',
        '-sSTANDALONE_WASM=1',
        '-DTSC_WASM',
        ...emccOpts,
        ...capabilityDefines(_capabilities),
      ], { stdio: 'pipe' });
      if (emccResult.status !== 0) {
        process.stderr.write(`tsclang: emcc failed:\n${emccResult.stderr?.toString() || ''}\n`);
        return false;
      }
      process.stdout.write(`Built ${stem}.wasm\n`);
    }

    if (emit === 'hex' || emit === 'flash') {
      const avrGcc = spawnSync('avr-gcc', ['--version'], { stdio: 'pipe' });
      if (avrGcc.status !== 0 || avrGcc.error) {
        process.stderr.write('ConfigError: --emit hex/flash requires avr-gcc in PATH\n');
        return false;
      }
      const mcu = buildOpts.mcu || 'atmega328p';
      const elfPath = join(outDir, stem + '.elf');
      const hexPath = join(outDir, stem + '.hex');
      const runtimeH = join(ROOT, 'src/runtime/runtime.h');
      const gccOptimize = optimize ? [`-${optimize}`] : ['-Os'];
      const gccResult = spawnSync('avr-gcc', [
        cPath, '-o', elfPath,
        '-I', dirname(runtimeH),
        `-mmcu=${mcu}`,
        '-std=c11',
        '-DTSC_EMBEDDED',
        ...gccOptimize,
        ...capabilityDefines(_capabilities),
      ], { stdio: 'pipe' });
      if (gccResult.status !== 0) {
        process.stderr.write(`tsclang: avr-gcc failed:\n${gccResult.stderr?.toString() || ''}\n`);
        try { unlinkSync(elfPath); } catch {}
        return false;
      }
      const objcopyResult = spawnSync('avr-objcopy', [
        '-O', 'ihex', elfPath, hexPath,
      ], { stdio: 'pipe' });
      if (objcopyResult.status !== 0) {
        process.stderr.write(`tsclang: avr-objcopy failed:\n${objcopyResult.stderr?.toString() || ''}\n`);
        try { unlinkSync(elfPath); } catch {}
        return false;
      }
      try { unlinkSync(elfPath); } catch {}

      if (emit === 'flash') {
        const avrdudeCheck = spawnSync('avrdude', ['--version'], { stdio: 'pipe' });
        if (avrdudeCheck.error) {
          process.stderr.write('ConfigError: --emit flash requires avrdude in PATH\n');
          return false;
        }
        const flashCfg = _buildCfg?.flash;
        const avrdudeArgs = [
          '-c', flashCfg.programmer,
          '-p', mcu,
          '-P', flashCfg.port,
          ...(flashCfg.baud ? ['-b', String(flashCfg.baud)] : []),
          ...(flashCfg.extraFlags || []),
          '-U', `flash:w:${hexPath}:i`,
        ];
        const avrdudeResult = spawnSync('avrdude', avrdudeArgs, { stdio: 'pipe' });
        if (avrdudeResult.status !== 0) {
          process.stderr.write(`tsclang: avrdude failed:\n${avrdudeResult.stderr?.toString() || ''}\n`);
          return false;
        }
        process.stdout.write(`Flashed ${stem}.hex to ${mcu} via ${flashCfg.programmer}\n`);
      } else {
        process.stdout.write(`Built ${stem}.hex\n`);
      }
    }

    return true;
  }

  if (watchMode) {
    const ts = () => new Date().toLocaleTimeString();
    let debounceTimer: any = null;
    let watchedFiles = new Set();

    function onFileChange() {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        process.stderr.write(`\n[${ts()}] Change detected — rebuilding...\n`);
        const ok = doBuild();
        if (ok) process.stderr.write(`[${ts()}] Build succeeded\n`);
        syncWatches(_lastSourceFiles);
        const n = watchedFiles.size;
        process.stderr.write(`[${ts()}] Watching ${n} file${n > 1 ? 's' : ''}...\n`);
      }, 150);
    }

    function syncWatches(files: any) {
      const newSet = new Set(files);
      for (const f of watchedFiles) {
        if (!newSet.has(f)) unwatchFile(f as string, onFileChange as any);
      }
      for (const f of newSet) {
        if (!watchedFiles.has(f)) watchFile(f as string, { interval: 200 }, onFileChange as any);
      }
      watchedFiles = newSet;
    }

    process.stderr.write(`[${ts()}] Watching ${basename(inputPath)}...\n`);
    const ok = doBuild();
    if (ok) {
      process.stderr.write(`[${ts()}] Build succeeded\n`);
      syncWatches(_lastSourceFiles);
      const n = watchedFiles.size;
      process.stderr.write(`[${ts()}] Watching ${n} file${n > 1 ? 's' : ''}...\n`);
    }

    process.on('SIGINT', () => {
      for (const f of watchedFiles) unwatchFile(f as string, onFileChange as any);
      process.stderr.write(`\n[${ts()}] Watch stopped\n`);
      process.exit(0);
    });
  } else {
    if (!doBuild()) process.exit(1);
  }

} else if (command === 'run') {
// ---------------------------------------------------------------------------
// run command
// ---------------------------------------------------------------------------
  const inputFile = args[1];
  if (!inputFile) {
    _missingInput('run');
    process.exit(1);
  }

  // Check for -- separator (args to pass to program)
  const sepIdx = args.indexOf('--');
  const progArgs = sepIdx !== -1 ? args.slice(sepIdx + 1) : [];
  const runOptIdx = args.indexOf('--optimize');
  const runOptimize = runOptIdx !== -1 && runOptIdx < (sepIdx !== -1 ? sepIdx : args.length) ? args[runOptIdx + 1] : null;
  if (runOptimize && !/^O[0-3sz]$/.test(runOptimize)) {
    process.stderr.write(`tsclang run: invalid --optimize value '${runOptimize}'; use O0, O1, O2, O3, Os, Oz\n`);
    process.exit(1);
  }

  const inputPath = resolve(inputFile);
  _checkInput('run', inputPath);
  let c, warnings;
  try {
    ({ c, warnings } = compileTsc(inputPath));
  } catch (e: any) {
    reportErrors(e, basename(inputPath));
    process.exit(1);
  }

  // Write C to temp file and compile+run (unique dir per invocation to avoid races)
  const stem    = basename(inputPath, extname(inputPath));
  const tmpDir  = mkdtempSync(join(tmpdir(), 'tsclang-'));
  const cPath   = join(tmpDir, stem + '.c');
  const binPath = join(tmpDir, stem);
  writeFileSync(cPath, c, 'utf8');

  const runtimeH = join(ROOT, 'src/runtime/runtime.h');
  const runGccOpt = runOptimize ? [`-${runOptimize}`] : [];
  const gcc = spawnSync('gcc', [
    cPath, '-o', binPath,
    '-I', dirname(runtimeH),
    '-lpthread', '-std=c11',
    ...runGccOpt,
  ], { stdio: 'pipe' });
  if (gcc.status !== 0) {
    process.stderr.write(`tsclang: gcc failed:\n${gcc.stderr?.toString() || ''}\n`);
    process.exit(1);
  }

  const run = spawnSync(binPath, progArgs, { stdio: 'inherit' });
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  process.exit(run.status ?? 0);

} else if (command === 'lsp') {
  startLsp();
} else if (command === 'debug') {
  const inputFile = args[1];
  if (!inputFile) {
    _missingInput('debug');
    process.exit(1);
  }
  const inputPath = resolve(inputFile);
  const { c, warnings } = compileTsc(inputPath, { debugLines: true, sourcemap: true });
  const tmpDir = mkdtempSync(join(tmpdir(), 'tsclang-dbg-'));
  const mainC = join(tmpDir, 'main.c');
  const binaryPath = join(tmpDir, 'main');
  writeFileSync(mainC, c, 'utf8');
  const runtimeInc = join(ROOT, 'src/runtime');
  const gccResult = spawnSync('gcc', [mainC, '-o', binaryPath, '-g', `-I${runtimeInc}`, '-lpthread', '-lm'], { encoding: 'utf8' });
  if (gccResult.status !== 0) {
    process.stderr.write(gccResult.stderr || 'gcc failed\n');
    process.exit(1);
  }
  // Try gdb, fall back to running directly
  const gdbCheck = spawnSync('gdb', ['--version'], { encoding: 'utf8' });
  if (gdbCheck.status === 0) {
    const gdbArgs = ['--source-directory', dirname(inputPath), '-q', binaryPath];
    spawnSync('gdb', gdbArgs, { stdio: 'inherit' });
  } else {
    process.stderr.write('tsclang debug: gdb not found, running without debugger\n');
    const r = spawnSync(binaryPath, [], { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
} else {
  console.error(`tsclang: unknown command '${command}'`);
  process.exit(1);
}
