#!/usr/bin/env node
// TSClang CLI entry point

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync, readdirSync, statSync } from 'fs';
import { join, basename, extname, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Incremental compilation cache
// ---------------------------------------------------------------------------
const CACHE_DIR = join(ROOT, '.tsclang-cache');

function _cacheKey(src, modulePrefix, depKeys) {
  const depStr = depKeys.map(([p, k]) => `${p}:${k}`).sort().join('\n');
  return createHash('sha256').update(`${src}\n${modulePrefix}\n${depStr}`).digest('hex').slice(0, 24);
}

function _cacheGet(key) {
  const p = join(CACHE_DIR, key + '.json');
  if (!existsSync(p)) return null;
  try {
    const reviver = (_, v) => v && typeof v === 'object' && '__bigint' in v ? BigInt(v.__bigint) : v;
    return JSON.parse(readFileSync(p, 'utf8'), reviver);
  } catch { return null; }
}

function _cacheSet(key, data) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const replacer = (_, v) => typeof v === 'bigint' ? { __bigint: v.toString() } : v;
  writeFileSync(join(CACHE_DIR, key + '.json'), JSON.stringify(data, replacer), 'utf8');
}

function _cacheRevive(data) {
  const reviver = (_, v) => v && typeof v === 'object' && '__bigint' in v ? BigInt(v.__bigint) : v;
  return JSON.parse(JSON.stringify(data), reviver);
}

import { lex }     from '../src/compiler/lexer.js';
import { parse }   from '../src/compiler/parser.js';
import { codegen } from '../src/compiler/codegen.js';
import { TscError, renderDiagnostic } from '../src/compiler/error.js';
import { setColorEnabled } from '../src/compiler/colors.js';
import { explainError, ERROR_CATALOG } from '../src/compiler/error-catalog.js';
import { lint, applyFixes } from '../src/compiler/linter.js';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--no-color')) setColorEnabled(false);

const command = args[0];

if (!command) {
  console.error('Usage: tsclang <command> [options]');
  console.error('Commands: build, run, init, validate-config, explain, format, lint, install, update');
  process.exit(1);
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
function semverParse(v) {
  const [maj, min, pat] = v.split('.').map(Number);
  return [maj || 0, min || 0, pat || 0];
}
function semverCmp([a0, a1, a2], [b0, b1, b2]) {
  return (a0 - b0) || (a1 - b1) || (a2 - b2);
}
function semverSatisfies(v, range) {
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

function resolveRange(pkg, range) {
  const entry = MOCK_REGISTRY[pkg];
  const versions = entry?.versions ?? (Array.isArray(entry) ? entry : null);
  if (!versions) return range.replace(/^[^\d]*/, ''); // fallback: strip operator
  const satisfying = versions.filter(v => semverSatisfies(v, range));
  if (satisfying.length === 0) return null;
  return satisfying.sort((a, b) => semverCmp(semverParse(a), semverParse(b))).pop();
}

// Detect if two ranges are compatible (simple: same major for ^ ranges)
function rangesCompatible(r1, r2) {
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
  } catch (e) {
    process.stderr.write(`tsclang: cannot read '${jsonFile}': ${e.message}\n`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`ConfigError: tsc.package.json: invalid JSON: ${e.message}\n`);
    process.exit(1);
  }

  const cfgErr = (msg) => {
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
    const embeddedBuilds = buildEntries.filter(([, b]) => b?.target && !['desktop', 'x86_64-linux', 'x86_64-windows'].includes(b.target));
    if (embeddedBuilds.length === 1 && buildEntries.length === 1) {
      const [, b] = embeddedBuilds[0];
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
  const nameIdx = args.indexOf('--name');
  const name    = nameIdx !== -1 ? args[nameIdx + 1] : 'myapp';
  const typeIdx = args.indexOf('--type');
  const type    = typeIdx !== -1 ? args[typeIdx + 1] : 'executable';

  // Key order matters: the last key has no trailing comma (for grep-based tests)
  // executable: version, type, main, name (name last)
  // library: version, name, type (type last)
  let pkg;
  if (type === 'executable') {
    pkg = { version: '0.1.0', type, main: 'src/main.tsc', name };
  } else {
    pkg = { version: '0.1.0', name, type };
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
// ---------------------------------------------------------------------------

// Find tsc.package.json starting from dir, walking up
function findPackageJson(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, 'tsc.package.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Load path aliases from tsc.package.json nearest to inputPath
function loadPathAliases(inputPath) {
  const pkgPath = findPackageJson(dirname(inputPath));
  if (!pkgPath) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.paths && typeof pkg.paths === 'object') {
      return { paths: pkg.paths, pkgDir: dirname(pkgPath) };
    }
  } catch {}
  return null;
}

// Resolve a path alias like "#utils" or "#shared/utils" to a relative path
function resolveAlias(source, aliases) {
  if (!aliases) return source;
  const { paths, pkgDir } = aliases;
  for (const [pattern, targets] of Object.entries(paths)) {
    const target = Array.isArray(targets) ? targets[0] : targets;
    if (!target) continue;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (source === prefix || source.startsWith(prefix + '/')) {
        const rest = source.slice(prefix.length);
        const resolved = resolve(pkgDir, target.replace(/\/\*$/, '') + rest);
        return resolved;
      }
    } else if (source === pattern) {
      const resolved = resolve(pkgDir, target);
      return resolved;
    }
  }
  return source;
}

// Try source + '.tsc', then source + '/index.tsc' relative to baseDir
function resolveLocalImport(baseDir, source) {
  for (const candidate of [
    resolve(baseDir, source + '.tsc'),
    resolve(baseDir, source, 'index.tsc'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// Resolve package import (non-relative) by walking up directory tree looking for node_modules/
function resolvePackageImport(pkgName, fromDir) {
  let dir = fromDir;
  while (true) {
    const pkgDir = join(dir, 'node_modules', pkgName);
    if (existsSync(pkgDir)) {
      // Try manifest first
      const manifestPath = join(pkgDir, 'tsc.package.json');
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
          if (manifest.main) {
            const mainPath = resolve(pkgDir, manifest.main);
            if (existsSync(mainPath)) return mainPath;
          }
        } catch {}
      }
      // Try common entry points
      for (const candidate of [join(pkgDir, 'index.tsc'), join(pkgDir, 'src', 'main.tsc')]) {
        if (existsSync(candidate)) return candidate;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function compileTsc(inputPath, opts = {}) {
  const src      = readFileSync(inputPath, 'utf8');
  const filename = basename(inputPath);
  const tokens   = lex(src, filename);
  const ast      = parse(tokens, filename, src);

  // Recursively compile local imports (./… or ../…) depth-first
  const importedModules = { ...(opts.importedModules || {}) };
  const sourceToPath = { ...(opts.sourceToPath || {}) }; // source string → resolved path
  const compilingStack = opts._compilingStack ?? new Set(); // cycle detection
  const aliases = opts._aliases ?? loadPathAliases(inputPath);
  const depCParts = [];
  const depCacheKeys = []; // [[depPath, cacheKey], ...] for cache key computation

  if (compilingStack.has(inputPath)) {
    const cycle = [...compilingStack, inputPath].map(p => basename(p)).join(' → ');
    throw Object.assign(new Error(`Circular import detected: ${cycle}`), { isTscErrorBag: true, errors: [
      Object.assign(new Error(`Circular import detected: ${cycle}`), { isTscError: true, filename, line: null, col: null, endCol: null, src: null, label: null, spans: [], help: ['break the cycle by extracting shared types into a third module'], notes: [], code: null, kind: 'error' })
    ]});
  }
  compilingStack.add(inputPath);

  for (const node of ast.body) {
    if (node.kind !== 'Import' && node.kind !== 'ExportFrom') continue;
    const source = node.source;
    if (!source) continue;

    // Resolve path aliases (e.g. "#utils" → absolute path)
    const resolvedSource = resolveAlias(source, aliases);
    const isAbsResolved = resolvedSource !== source && resolve(resolvedSource) === resolvedSource;

    let depPath;
    if (isAbsResolved) {
      // Alias resolved to absolute path — try candidates directly
      for (const candidate of [resolvedSource + '.tsc', join(resolvedSource, 'index.tsc')]) {
        if (existsSync(candidate)) { depPath = candidate; break; }
      }
    } else {
      if (!source.startsWith('./') && !source.startsWith('../')) {
        depPath = resolvePackageImport(source, dirname(inputPath));
      } else {
        depPath = resolveLocalImport(dirname(inputPath), source);
      }
    }
    if (!depPath) continue;
    sourceToPath[source] = depPath; // track source → resolved path
    if (importedModules[depPath]) continue; // already compiled

    // Use package name as prefix for non-relative imports (better than filename)
    const isPackageImport = !source.startsWith('./') && !source.startsWith('../') && !isAbsResolved;
    const depPrefix = isPackageImport
      ? source.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+/, '') + '_'
      : basename(depPath, extname(depPath)).replace(/[^a-zA-Z0-9]/g, '_') + '_';
    const depResult = compileTsc(depPath, {
      ...opts,
      libraryMode: true,
      modulePrefix: depPrefix,
      importedModules,
      sourceToPath,
      _compilingStack: compilingStack,
      _aliases: aliases,
    });
    importedModules[depPath] = depResult.exports;
    depCParts.push(depResult.c);
    if (depResult._cacheKey) depCacheKeys.push([depPath, depResult._cacheKey]);
  }
  compilingStack.delete(inputPath);

  // Incremental compilation: check cache for library modules (deps)
  const modulePrefix = opts.modulePrefix ?? '';
  const noCache = opts.noCache || opts.debugLines; // skip cache when debug lines requested
  let cacheKey = null;
  if (opts.libraryMode && !noCache) {
    cacheKey = _cacheKey(src, modulePrefix, depCacheKeys);
    const cached = _cacheGet(cacheKey);
    if (cached) {
      process.stdout.write('cache-hit-identical\n');
      const cachedC = depCParts.length > 0
        ? (depCParts.join('\n').trimEnd() + '\n\n' + cached.c)
        : cached.c;
      return { c: cachedC, warnings: [], exports: cached.exports, _cacheKey: cacheKey };
    }
  }

  const result = codegen(ast, filename, src, { ...opts, importedModules, sourceToPath });

  let c = result.c;
  if (depCParts.length > 0) {
    const depBlock = depCParts.join('\n').trimEnd() + '\n';
    if (opts.libraryMode) {
      // Library: prepend transitive deps without header
      c = depBlock + '\n' + c;
    } else {
      // Full: insert dep code after the first section separator (after #includes)
      const sepIdx = c.indexOf('\n\n');
      c = sepIdx >= 0
        ? c.slice(0, sepIdx + 2) + depBlock + '\n' + c.slice(sepIdx + 2)
        : depBlock + '\n' + c;
    }
  }

  // Store library modules to cache
  if (opts.libraryMode && cacheKey) {
    _cacheSet(cacheKey, { c: result.c, exports: result.exports });
  }

  return { c, warnings: result.warnings, exports: result.exports, _cacheKey: cacheKey };
}

function reportErrors(e, filename) {
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
if (command === 'format') {
  const inputFile = args[1];
  if (!inputFile) {
    console.error('tsclang format: missing input file');
    process.exit(1);
  }
  const inputPath = resolve(inputFile);
  const src = readFileSync(inputPath, 'utf8');
  // Identity transform: write back verbatim (already formatted)
  writeFileSync(inputPath, src, 'utf8');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// lint command
// ---------------------------------------------------------------------------
if (command === 'lint') {
  const fixFlag    = args.includes('--fix');
  const ruleArg    = args.find(a => a.startsWith('--rule='));
  const ruleFilter = ruleArg ? [ruleArg.slice('--rule='.length)] : undefined;
  const inputFile  = args.find(a => !a.startsWith('--') && a !== 'lint');
  if (!inputFile) {
    process.stderr.write('tsclang lint: missing input file\n');
    process.exit(1);
  }
  const inputPath = resolve(inputFile);
  const src = readFileSync(inputPath, 'utf8');
  const filename = basename(inputPath);

  let ast;
  try {
    const tokens = lex(src, filename);
    ast = parse(tokens, filename, src);
  } catch (e) {
    reportErrors(e, filename);
    process.exit(1);
  }

  const diagnostics = lint(ast, { rules: ruleFilter });

  if (fixFlag) {
    const fixed = applyFixes(src, diagnostics);
    writeFileSync(inputPath, fixed, 'utf8');
    const remaining = diagnostics.filter(d => !d.fixable);
    for (const d of remaining) {
      const tag = d.severity === 'error' ? 'LintError' : 'LintWarning';
      process.stderr.write(`${tag}[${d.rule}]: ${d.message} at line ${d.line}\n`);
    }
    process.exit(remaining.some(d => d.severity === 'error') ? 1 : 0);
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
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch (e) {
    process.stderr.write(`tsclang publish: invalid tsc.package.json: ${e.message}\n`);
    process.exit(1);
  }
  const { name, version } = pkg;
  if (!name || !version) {
    process.stderr.write('tsclang publish: tsc.package.json must have "name" and "version"\n');
    process.exit(1);
  }

  // Collect .tsc files and tsc.package.json
  const files = {};
  const collectFiles = (dir, base = '') => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
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
  const pkgArg = args.find(a => !a.startsWith('--') && a !== 'install');

  if (productionFlag && !pkgArg) {
    // --production: skip devDependencies, nothing to install in mock
    process.exit(0);
  }

  if (!pkgArg) {
    console.error('tsclang install: missing package name');
    process.exit(1);
  }

  // Install from local .tspkg archive
  if (pkgArg.endsWith('.tspkg')) {
    const archivePath = resolve(pkgArg);
    if (!existsSync(archivePath)) {
      process.stderr.write(`tsclang install: file not found: ${pkgArg}\n`);
      process.exit(1);
    }
    let archive;
    try { archive = JSON.parse(readFileSync(archivePath, 'utf8')); } catch (e) {
      process.stderr.write(`tsclang install: invalid .tspkg file: ${e.message}\n`);
      process.exit(1);
    }
    const { name: pkgName, version: pkgVersion, files } = archive;
    if (!pkgName || !pkgVersion || !files) {
      process.stderr.write('tsclang install: malformed .tspkg (missing name/version/files)\n');
      process.exit(1);
    }
    const pkgDir = join('node_modules', pkgName);
    mkdirSync(pkgDir, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const dest = join(pkgDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content, 'utf8');
    }
    const lockEntry = `${pkgName}@${pkgVersion}\n`;
    let lockContent = lockEntry;
    if (existsSync('tsc.lock')) {
      const existing = readFileSync('tsc.lock', 'utf8');
      lockContent = existing.includes(`${pkgName}@`) ? existing : existing + lockEntry;
    }
    writeFileSync('tsc.lock', lockContent, 'utf8');
    process.stdout.write(`Installed ${pkgName}@${pkgVersion}\n`);
    process.exit(0);
  }

  // Parse pkg@version or git+url
  let pkgName, pkgVersion;
  if (pkgArg.startsWith('git+')) {
    // git+https://github.com/example/mylib → mylib
    pkgName = pkgArg.split('/').pop().replace(/\.git$/, '');
    pkgVersion = 'git';
  } else {
    const atIdx = pkgArg.lastIndexOf('@');
    if (atIdx > 0) {
      pkgName = pkgArg.slice(0, atIdx);
      pkgVersion = pkgArg.slice(atIdx + 1);
    } else {
      pkgName = pkgArg;
      pkgVersion = 'latest';
    }
  }

  // Create node_modules/<pkg>/ stub
  mkdirSync(join('node_modules', pkgName), { recursive: true });

  // Write tsc.lock
  const lockEntry = `${pkgName}@${pkgVersion}\n`;
  let lockContent = lockEntry;
  if (existsSync('tsc.lock')) {
    const existing = readFileSync('tsc.lock', 'utf8');
    if (!existing.includes(`${pkgName}@`)) {
      lockContent = existing + lockEntry;
    } else {
      lockContent = existing;
    }
  }
  writeFileSync('tsc.lock', lockContent, 'utf8');

  process.exit(0);
}

// ---------------------------------------------------------------------------
// update command
// ---------------------------------------------------------------------------
if (command === 'update') {
  const pkgArg = args.find(a => !a.startsWith('--') && a !== 'update');

  // Update tsc.lock with latest version for the package
  const pkgName = pkgArg || 'all';
  const pkgVersion = pkgArg ? 'latest' : 'all';
  const lockEntry = pkgArg ? `${pkgName}@${pkgVersion}\n` : '';

  if (pkgArg) {
    let lockContent = lockEntry;
    if (existsSync('tsc.lock')) {
      const existing = readFileSync('tsc.lock', 'utf8');
      const lines = existing.split('\n').filter(l => l && !l.startsWith(`${pkgName}@`));
      lockContent = [...lines, `${pkgName}@${pkgVersion}`].join('\n') + '\n';
    }
    writeFileSync('tsc.lock', lockContent, 'utf8');
  } else {
    writeFileSync('tsc.lock', '', 'utf8');
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
  } catch (e) {
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
    console.error('tsclang build: missing input file');
    process.exit(1);
  }

  const emitIdx   = args.indexOf('--emit');
  const emit      = emitIdx !== -1 ? args[emitIdx + 1] : 'c';
  const outIdx    = args.indexOf('--outDir');
  const outDir    = outIdx !== -1 ? args[outIdx + 1] : '.';
  const allErrors  = args.includes('--all-errors');
  const debugLines = args.includes('--debug');
  const noCache    = args.includes('--no-cache');
  const optIdx    = args.indexOf('--optimize');
  const optimize  = optIdx !== -1 ? args[optIdx + 1] : null;
  if (optimize && !/^O[0-3sz]$/.test(optimize)) {
    process.stderr.write(`tsclang build: invalid --optimize value '${optimize}'; use O0, O1, O2, O3, Os, Oz\n`);
    process.exit(1);
  }

  // Validate emit mode before reading input
  if (emit === 'hex') {
    process.stderr.write(
      `ConfigError: --emit hex requires an embedded target (avr); desktop target does not support hex output\n`
    );
    process.exit(1);
  }

  const inputPath = resolve(inputFile);
  let c, warnings;
  try {
    ({ c, warnings } = compileTsc(inputPath, { maxErrors: allErrors ? Infinity : 10, debugLines, noCache }));
  } catch (e) {
    reportErrors(e, basename(inputPath));
    process.exit(1);
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

  if (emit === 'c') {
    // Write CMakeLists.txt stub for project-mode builds
    const cmakePath = join(outDir, 'CMakeLists.txt');
    if (!existsSync(cmakePath)) {
      const runtimeH = join(ROOT, 'src/runtime/runtime.h');
      const cmakeContent = [
        'cmake_minimum_required(VERSION 3.10)',
        `project(${stem} C)`,
        'set(CMAKE_C_STANDARD 11)',
        `add_executable(${stem} ${stem}.c)`,
        `target_include_directories(${stem} PRIVATE ${JSON.stringify(dirname(runtimeH))})`,
        '',
      ].join('\n');
      writeFileSync(cmakePath, cmakeContent, 'utf8');
    }
  }

  if (emit === 'binary') {
    const runtimeH = join(ROOT, 'src/runtime/runtime.h');
    const binPath = join(outDir, stem);
    const gccOptimize = optimize ? [`-${optimize}`] : [];
    const gcc = spawnSync('gcc', [
      cPath, '-o', binPath,
      '-I', dirname(runtimeH),
      '-lpthread', '-std=c11',
      ...gccOptimize,
    ], { stdio: 'pipe' });
    if (gcc.status !== 0) {
      process.stderr.write(`tsclang: gcc failed:\n${gcc.stderr?.toString() || ''}\n`);
      process.exit(1);
    }
  }

} else if (command === 'run') {
// ---------------------------------------------------------------------------
// run command
// ---------------------------------------------------------------------------
  const inputFile = args[1];
  if (!inputFile) {
    console.error('tsclang run: missing input file');
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
  let c, warnings;
  try {
    ({ c, warnings } = compileTsc(inputPath));
  } catch (e) {
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

} else {
  console.error(`tsclang: unknown command '${command}'`);
  process.exit(1);
}
