// Compilation pipeline: TSC source → C string
// Extracted from src/index.ts for reuse by test runner and other tools.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, extname, dirname, join, resolve } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { lex } from './lexer.js';
import { parse } from './parser.js';
import { codegen } from './codegen.js';
import { optimize } from './optimizer.js';

const CACHE_DIR = process.env.TSCLANG_CACHE_DIR || join(homedir(), '.tsclang', 'cache');

// ---------------------------------------------------------------------------
// Incremental compilation cache
// ---------------------------------------------------------------------------

export function _cacheKey(src: any, modulePrefix: any, depKeys: any) {
  const depStr = depKeys.map(([p, k]: [string, string]) => `${p}:${k}`).sort().join('\n');
  return createHash('sha256').update(`${src}\n${modulePrefix}\n${depStr}`).digest('hex').slice(0, 24);
}

export function _cacheGet(key: any) {
  const p = join(CACHE_DIR, key + '.json');
  if (!existsSync(p)) return null;
  try {
    const reviver = (_: any, v: any) => v && typeof v === 'object' && '__bigint' in v ? BigInt(v.__bigint) : v;
    return JSON.parse(readFileSync(p, 'utf8'), reviver);
  } catch { return null; }
}

export function _cacheSet(key: any, data: any) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const replacer = (_: any, v: any) => typeof v === 'bigint' ? { __bigint: v.toString() } : v;
  writeFileSync(join(CACHE_DIR, key + '.json'), JSON.stringify(data, replacer), 'utf8');
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export function findPackageJson(startDir: any) {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, 'tsc.package.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadPathAliases(inputPath: any) {
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

export function resolveAlias(source: any, aliases: any) {
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

export function resolveLocalImport(baseDir: any, source: any) {
  for (const candidate of [
    resolve(baseDir, source + '.tsc'),
    resolve(baseDir, source, 'index.tsc'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolvePackageImport(pkgName: any, fromDir: any) {
  let dir = fromDir;
  while (true) {
    const pkgDir = join(dir, 'tsc_packages', pkgName);
    if (existsSync(pkgDir)) {
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

// ---------------------------------------------------------------------------
// Compile TSC → C string (recursive for local imports)
// ---------------------------------------------------------------------------

export function compileTsc(inputPath: string, opts: any = {}) {
  const src      = readFileSync(inputPath, 'utf8');
  const filename = basename(inputPath);
  const tokens   = lex(src, filename);
  const { ast: parsedAst, errors: parseErrors } = parse(tokens, filename, src);

  if (parseErrors.length > 0) {
    const bag = parseErrors.map(e => Object.assign(e, { kind: 'error' }));
    throw { isTscErrorBag: true, errors: bag };
  }

  let   ast      = parsedAst;

  if (opts.optimize) ast = optimize(ast);

  // Recursively compile local imports (./… or ../…) depth-first
  const importedModules = { ...(opts.importedModules || {}) };
  const sourceToPath = { ...(opts.sourceToPath || {}) };
  const compilingStack = opts._compilingStack ?? new Set();
  const aliases = opts._aliases ?? loadPathAliases(inputPath);
  const depCParts: any[] = [];
  const depCacheKeys: any[] = [];
  const depInitFns: any[] = [];

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

    const resolvedSource = resolveAlias(source, aliases);
    const isAbsResolved = resolvedSource !== source && resolve(resolvedSource) === resolvedSource;

    let depPath;
    if (isAbsResolved) {
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
    sourceToPath[source] = depPath;
    if (importedModules[depPath]) continue;

    const isPackageImport = !source.startsWith('./') && !source.startsWith('../') && !isAbsResolved;
    const depPrefix = isPackageImport
      ? source.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+/, '') + '_'
      : basename(depPath, extname(depPath)).replace(/[^a-zA-Z0-9]/g, '_') + '_';
    const depResult: any = compileTsc(depPath, {
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
    if (depResult._initFn) depInitFns.push(depResult._initFn);
  }
  compilingStack.delete(inputPath);

  const modulePrefix = opts.modulePrefix ?? '';
  const noCache = opts.noCache || opts.debugLines;
  let cacheKey: any = null;
  if (opts.libraryMode && !noCache) {
    cacheKey = _cacheKey(src, modulePrefix, depCacheKeys);
    const cached = _cacheGet(cacheKey);
    if (cached) {
      process.stdout.write('cache-hit-identical\n');
      const cachedC: any = depCParts.length > 0
        ? (depCParts.join('\n').trimEnd() + '\n\n' + cached.c)
        : cached.c;
      return { c: cachedC, warnings: [] as any[], exports: cached.exports, _cacheKey: cacheKey, _initFn: cached._initFn ?? null };
    }
  }

  const result = codegen(ast, filename, src, { ...opts, importedModules, sourceToPath, depInitFns });

  const lineMap = opts.sourcemap ? _buildLineMap(src, result.c) : null;

  let c = result.c;
  if (depCParts.length > 0) {
    const depBlock = depCParts.join('\n').trimEnd() + '\n';
    if (opts.libraryMode) {
      c = depBlock + '\n' + c;
    } else {
      const sepIdx = c.indexOf('\n\n');
      c = sepIdx >= 0
        ? c.slice(0, sepIdx + 2) + depBlock + '\n' + c.slice(sepIdx + 2)
        : depBlock + '\n' + c;
    }
  }

  if (opts.libraryMode && cacheKey) {
    _cacheSet(cacheKey, { c: result.c, exports: result.exports, _initFn: result._initFn ?? null });
  }

  return { c, warnings: result.warnings, exports: result.exports, _cacheKey: cacheKey, _initFn: result._initFn ?? null, lineMap, _sourceFiles: [inputPath, ...Object.keys(importedModules)] };
}

// ---------------------------------------------------------------------------
// Source map helper
// ---------------------------------------------------------------------------

export function _buildLineMap(tscSrc: any, cSrc: any) {
  const tscLines = tscSrc.split('\n');
  const cLines   = cSrc.split('\n');

  const tscStmtLines: any[] = [];
  for (let i = 0; i < tscLines.length; i++) {
    const t = tscLines[i].trim();
    if (t && !t.startsWith('//') && t !== '{' && t !== '}') {
      tscStmtLines.push(i + 1);
    }
  }

  const cStmtLines: any[] = [];
  for (let i = 0; i < cLines.length; i++) {
    const t = cLines[i].trim();
    if (t && !t.startsWith('#') && !t.startsWith('//') && t !== '{' && t !== '}') {
      cStmtLines.push(i + 1);
    }
  }

  const mappings: any[] = [];
  const len = Math.min(tscStmtLines.length, cStmtLines.length);
  for (let i = 0; i < len; i++) {
    mappings.push([tscStmtLines[i], cStmtLines[i]]);
  }
  return mappings;
}
