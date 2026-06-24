#!/usr/bin/env node
// TSClang CLI entry point

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync, readdirSync, statSync, watchFile, unwatchFile, unlinkSync } from 'fs';
import { join, basename, extname, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { compileTsc, findPackageJson } from '../src/compiler/compile.js';
import { flagValue, hasFlag, hasFlagAny, getPositional, getPositionalAfter, isValidOptimizeLevel, isValidNumberType, NUMBER_TYPES } from '../src/cli/args.js';
import { getVersion, getHelpText, CMD_HELP } from '../src/cli/help.js';
import { semverParse, semverCmp, semverSatisfies, rangesCompatible } from '../src/semver.js';
import { MOCK_REGISTRY, MOCK_PKG_DEPS, resolveRange, readLock, writeLock, readManifest, checkLockStale } from '../src/cli/registry.js';
import type { LockFile, Manifest, LockPackage } from '../src/cli/registry.js';
import { VALID_STRICT_RULES, VALID_BUILD_KEYS, validateStrictRules, validateBuildKeys } from '../src/cli/config-validator.js';
import { DESKTOP_CAPABILITIES, loadProfile, listAvailableProfiles, capabilityDefines } from '../src/cli/profile-loader.js';
import type { Capabilities } from '../src/cli/profile-loader.js';
import { generateProjectCmake, generateBuildCmake } from '../src/cli/cmake.js';
import { missingInput, checkInput, reportErrors } from '../src/cli/helpers.js';
import { runBuildCommand } from '../src/cli/commands/build.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// DESKTOP_CAPABILITIES — extracted to src/cli/profile-loader.ts

// VALID_STRICT_RULES — extracted to src/cli/config-validator.ts

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

if (hasFlag(args, '--no-color')) setColorEnabled(false);

const VERSION = getVersion(ROOT);

if (hasFlagAny(args, '--version', '-v')) {
  console.log(`tsclang ${VERSION}`);
  process.exit(0);
}

const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(getHelpText(VERSION));
  process.exit(command ? 0 : 1);
}

if (CMD_HELP[command] && hasFlagAny(args, '--help', '-h')) {
  console.log(CMD_HELP[command]);
  process.exit(0);
}

// CLI helpers — extracted to src/cli/helpers.ts

// Lock file helpers — extracted to src/cli/registry.ts

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
// Semver helpers — extracted to src/semver.ts
// ---------------------------------------------------------------------------

// Mock registry + resolveRange + lock helpers — extracted to src/cli/registry.ts

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
    for (const [buildName, buildCfg] of Object.entries(config.builds)) {
      if (buildCfg && typeof buildCfg === 'object') {
        const err = validateBuildKeys(buildCfg as Record<string, unknown>, buildName);
        if (err) cfgErr(err);
      }
    }
  }

  if (config.strict) {
    const err = validateStrictRules(config.strict, 'tsc.package.json');
    if (err) cfgErr(err);
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
    const resolved: Record<string, any> = {}; // pkg → resolved version
    const requiredBy: Record<string, any> = {}; // dep → { range, requiredByPkg }

    for (const [pkg, range] of Object.entries(deps as Record<string, string>)) {
      const ver = resolveRange(pkg, range);
      if (!ver) cfgErr(`Cannot resolve '${pkg}@${range}': no matching version found`);
      resolved[pkg] = ver;
      // Get transitive deps
      const transitiveDeps = MOCK_PKG_DEPS[`${pkg}@${ver}`] || {};
      for (const [dep, depRange] of Object.entries(transitiveDeps as Record<string, string>)) {
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

  const hasLibrary = hasFlagAny(args, '--library', '-l');
  const hasDeclaration = hasFlagAny(args, '--declaration', '-d');
  let type = flagValue(args, '--type') ?? 'executable';
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
// reportErrors — extracted to src/cli/helpers.ts

// ---------------------------------------------------------------------------
// format command
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// emit-dts command
// ---------------------------------------------------------------------------
if (command === 'emit-dts') {
  const inputFile = args[1];
  if (!inputFile) {
    missingInput('emit-dts');
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
    missingInput('format');
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
  const fixFlag    = hasFlag(args, '--fix');
  const ruleArg    = args.find((a: string) => a.startsWith('--rule='));
  const ruleFilter = ruleArg ? [ruleArg.slice('--rule='.length)] : undefined;
  const inputFile  = getPositional(args, 'lint');
  if (!inputFile) {
    missingInput('lint');
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
  const productionFlag = hasFlag(args, '--production');
  const pkgArg = getPositional(args, 'install');

  if (productionFlag && !pkgArg) {
    // --production: skip devDependencies, nothing to install in mock
    process.exit(0);
  }

  if (!pkgArg) {
    // Sync lock with tsc.package.json dependencies
    const manifest = readManifest();
    if (!manifest) {
      console.error('tsclang install: no tsc.package.json found in current directory');
      process.exit(1);
    }
    const deps = productionFlag
      ? (manifest.dependencies || {})
      : { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
    const lock = readLock();
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
    writeLock(lock);
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
    const lock = readLock();
    lock.packages[pkgName] = { version: pkgVersion, source: 'local' };
    writeLock(lock);
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
  const lock = readLock();
  lock.packages[pkgName] = { version: pkgVersion, source: pkgSource };
  writeLock(lock);

  process.exit(0);
}

// ---------------------------------------------------------------------------
// update command
// ---------------------------------------------------------------------------
if (command === 'update') {
  const pkgArg = getPositional(args, 'update');

  if (pkgArg) {
    const lock = readLock();
    lock.packages[pkgArg] = { ...(lock.packages[pkgArg] || {}) };
    lock.packages[pkgArg].version = 'latest';
    writeLock(lock);
  } else {
    writeLock({ version: 1, packages: {} });
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

  const buildNameArg = flagValue(args, '--build') ?? null;
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

  process.stdout.write(generateProjectCmake({ projectName, target, mcu, toolchain, optimize, mainFile }));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// build command
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// build command — extracted to src/cli/commands/build.ts
// ---------------------------------------------------------------------------
if (command === 'build') {
  runBuildCommand(args, ROOT);

} else if (command === 'run') {
// ---------------------------------------------------------------------------
// run command
// ---------------------------------------------------------------------------
  const inputFile = args[1];
  if (!inputFile) {
    missingInput('run');
    process.exit(1);
  }

  // Check for -- separator (args to pass to program)
  const progArgs = getPositionalAfter(args, '--');
  const sepIdx = args.indexOf('--');
  const runOptIdx = args.indexOf('--optimize');
  const runOptimize = runOptIdx !== -1 && runOptIdx < (sepIdx !== -1 ? sepIdx : args.length) ? args[runOptIdx + 1] : null;
  if (runOptimize && !isValidOptimizeLevel(runOptimize)) {
    process.stderr.write(`tsclang run: invalid --optimize value '${runOptimize}'; use O0, O1, O2, O3, Os, Oz\n`);
    process.exit(1);
  }

  const inputPath = resolve(inputFile);
  checkInput('run', inputPath);
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
    missingInput('debug');
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
