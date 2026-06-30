import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, watchFile, unwatchFile } from 'fs';
import { join, basename, extname, resolve, dirname } from 'path';
import { spawnSync } from 'child_process';
import { compileTsc, findPackageJson, renderDiagnostic, DESKTOP_CAPABILITIES, capabilityDefines } from '@tsclang/compiler';
import { flagValue, hasFlag, hasFlagAny, isValidOptimizeLevel, isValidNumberType } from '../args.js';
import { loadProfile, listAvailableProfiles } from '../profile-loader.js';
import type { Capabilities } from '../profile-loader.js';
import { generateBuildCmake } from '../cmake.js';
import { checkLockStale } from '@tsclang/pm';
import { OPTIMIZE_LEVELS, PACKAGE_FILE, NUMBER_TYPES, C_STANDARD_FLAG, GCC_LINK_FLAGS, RUNTIME_HEADER, RUNTIME_WASM_HEADER, DEFAULT_AVR_MCU, TSC_DEFINES, DEFAULT_TARGET, RUNTIME_DIR, PROFILES_DIR, DEFAULT_OPTIMIZE_FLAG, SIZE_OPTIMIZE_FLAG, LIBUV_LINK_FLAG } from '@tsclang/shared';
import { validateStrictRules } from '../config-validator.js';
import { missingInput, checkInput, reportErrors } from '../helpers.js';

interface BuildConfig {
  [key: string]: unknown;
}

interface FlashConfig {
  programmer: string;
  port: string;
  baud?: number;
  extraFlags?: string[];
}

export function runBuildCommand(args: string[], rootDir: string): void {
  const ROOT = rootDir;
  let inputFile = args[1];
  let _buildName: string | null = null;
  const _pkgPath = findPackageJson(process.cwd());
  let _pkg: any = null;
  if (_pkgPath) {
    try { _pkg = JSON.parse(readFileSync(_pkgPath, 'utf8')); } catch {}
  }

  // If inputFile is not a .tsc file, check if it's a build name
  if (inputFile && !inputFile.endsWith('.tsc') && _pkg?.builds?.[inputFile]) {
    _buildName = inputFile;
    inputFile = _pkg.main ?? null;
  }

  // If no inputFile, read main from tsc.package.json
  if (!inputFile && _pkg?.main) {
    inputFile = _pkg.main;
  }
  if (!inputFile) {
    missingInput('build');
  }

  let emit: string       = flagValue(args, '--emit') ?? 'c';
  let outDir: string     = flagValue(args, '--outDir') ?? '.';
  const allErrors        = hasFlag(args, '--all-errors');
  const debugLines       = hasFlag(args, '--debug');
  const noCache          = hasFlag(args, '--no-cache');
  const sourcemap        = hasFlag(args, '--sourcemap');
  const watchMode        = hasFlagAny(args, '--watch', '-w');
  let optimize: string | null = flagValue(args, '--optimize') ?? null;
  if (optimize && !isValidOptimizeLevel(optimize)) {
    process.stderr.write(`tsclang build: invalid --optimize value '${optimize}'; use ${OPTIMIZE_LEVELS.join(', ')}\n`);
    process.exit(1);
  }

  const _targetFlag       = flagValue(args, '--target');
  let _defaultNumberFlag: string | undefined = flagValue(args, '--default-number');
  const _allocatorFlag    = flagValue(args, '--allocator');
  const _asyncFlag        = flagValue(args, '--async');
  const _strictFlag       = flagValue(args, '--strict');
  const _ramSizeFlag      = flagValue(args, '--ram-size');
  const _stackSizeFlag    = flagValue(args, '--stack-size');
  const _platformFlag     = flagValue(args, '--platform');
  const _buildFlag        = flagValue(args, '--build');
  const _effectiveBuild = _buildFlag ?? _buildName;
  const _mcuFlag          = flagValue(args, '--mcu');
  if (_defaultNumberFlag && !isValidNumberType(_defaultNumberFlag)) {
    process.stderr.write(`tsclang build: invalid --default-number value '${_defaultNumberFlag}'; valid: ${NUMBER_TYPES.join(', ')}\n`);
    process.exit(1);
  }

  const PROFILES_PATH = join(ROOT, PROFILES_DIR);

  let _capabilities: Capabilities | null = null;
  let _profileTarget: string | null = null;
  let _mcu: string | null = null;

  let _buildCfg: BuildConfig | null = null;
  let _pkgStrict: string[] | null = null;

  function _validateStrictRulesCli(rules: unknown, source: string): string[] {
    const err = validateStrictRules(rules, source);
    if (err) {
      process.stderr.write(`ConfigError: ${err}\n`);
      process.exit(1);
    }
    return rules as string[];
  }

  if (_platformFlag) {
    const prof = loadProfile(_platformFlag, PROFILES_PATH, inputFile);
    if (!prof) {
      process.stderr.write(`tsclang build: unknown profile '${_platformFlag}'; available: ${listAvailableProfiles(PROFILES_PATH).join(', ')}\n`);
      process.exit(1);
    }
    _capabilities = prof;
    _profileTarget = prof.target || _platformFlag;
  } else if (_effectiveBuild) {
    const pkgPath = findPackageJson(dirname(resolve(inputFile)));
    if (!pkgPath) {
      process.stderr.write(`tsclang build: --build requires a tsc.package.json\n`);
      process.exit(1);
    }
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const buildCfg = pkg.builds?.[_effectiveBuild];
      if (!buildCfg) {
        process.stderr.write(`tsclang build: build '${_buildFlag}' not found in tsc.package.json\n`);
        process.exit(1);
      }
      _buildCfg = buildCfg;
      if (buildCfg.profile) {
        const prof = loadProfile(buildCfg.profile, PROFILES_PATH, inputFile);
        if (!prof) {
          process.stderr.write(`tsclang build: unknown profile '${buildCfg.profile}' in build '${_buildFlag}'\n`);
          process.exit(1);
        }
        _capabilities = prof;
        _profileTarget = prof.target || buildCfg.profile;
      }
      if (buildCfg.optimize && !optimize) optimize = buildCfg.optimize;
      if (buildCfg.outDir && outDir === '.') outDir = buildCfg.outDir;
      if (buildCfg.emit && emit === 'c') emit = buildCfg.emit;
      if (buildCfg.defaultNumber && !_defaultNumberFlag) { _defaultNumberFlag = buildCfg.defaultNumber; }
      if (buildCfg.mcu && !_mcuFlag) _mcu = buildCfg.mcu;
      if (pkg.strict) _pkgStrict = _validateStrictRulesCli(pkg.strict, 'tsc.package.json');
    } catch (e) {
      if (e instanceof Error) {
        process.stderr.write(`tsclang build: error reading tsc.package.json: ${e.message}\n`);
        process.exit(1);
      }
      throw e;
    }
  }

  let _pkgAliases: { paths: Record<string, string>; pkgDir: string } | null = null;
  if (!_buildFlag) {
    const p = findPackageJson(dirname(resolve(inputFile)));
    if (p) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf8'));
        if (raw.strict) _pkgStrict = _validateStrictRulesCli(raw.strict, 'tsc.package.json');
        if (raw.paths && typeof raw.paths === 'object') {
          _pkgAliases = { paths: raw.paths, pkgDir: dirname(p) };
        }
      } catch {}
    }
  }

  if (_mcuFlag) _mcu = _mcuFlag;

  if (!_capabilities && _targetFlag) {
    const prof = loadProfile(_targetFlag, PROFILES_PATH, inputFile);
    if (prof) {
      _capabilities = prof;
      if (!_profileTarget) _profileTarget = prof.target || _targetFlag;
    }
  }

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
        `ConfigError: --emit ${emit} requires an embedded target (avr); current target is ${targetName || DEFAULT_TARGET}\n`
      );
      process.exit(1);
    }
  }

  if (emit === 'flash') {
    const flashCfg = _buildCfg?.flash as FlashConfig | undefined;
    if (!flashCfg || !flashCfg.programmer || !flashCfg.port) {
      process.stderr.write(
        'ConfigError: --emit flash requires "flash" config with "programmer" and "port" in tsc.package.json\n'
      );
      process.exit(1);
    }
  }

  const inputPath = resolve(inputFile);
  checkInput('build', inputPath);

  const _stale = checkLockStale();
  if (_stale) {
    const parts: string[] = [];
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

  let _lastSourceFiles: string[] = [inputPath];

  function doBuild(): boolean {
    let c: string, warnings: unknown[], lineMap: unknown;
    try {
      const _r = compileTsc(inputPath, buildOpts);
      c = _r.c; warnings = _r.warnings; lineMap = _r.lineMap;
      if (_r._sourceFiles) _lastSourceFiles = _r._sourceFiles;
    } catch (e) {
      reportErrors(e, basename(inputPath));
      return false;
    }

    for (const w of warnings) {
      process.stderr.write(renderDiagnostic(w as Parameters<typeof renderDiagnostic>[0], { contextLines: 1 }) + '\n');
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
        const runtimeH = join(ROOT, RUNTIME_DIR, RUNTIME_HEADER);
        const useLibuv = c.includes(`#define ${TSC_DEFINES.SCHEDULER_LIBUV}`);
        const cmakeContent = generateBuildCmake({
          stem,
          runtimeDir: dirname(runtimeH),
          useLibuv,
        });
        writeFileSync(cmakePath, cmakeContent, 'utf8');
      }
    }

    if (emit === 'binary') {
      const runtimeH = join(ROOT, RUNTIME_DIR, RUNTIME_HEADER);
      const binPath = join(outDir, stem);
      const gccOptimize = optimize ? [`-${optimize}`] : [];
      const useLibuv = c.includes(`#define ${TSC_DEFINES.SCHEDULER_LIBUV}`);
      const gcc = spawnSync('gcc', [
        cPath, '-o', binPath,
        '-I', dirname(runtimeH),
        ...GCC_LINK_FLAGS, C_STANDARD_FLAG,
        ...gccOptimize,
        ...(useLibuv ? [LIBUV_LINK_FLAG] : []),
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
      const runtimeH = join(ROOT, RUNTIME_DIR, RUNTIME_WASM_HEADER);
      const wasmPath = join(outDir, stem + '.wasm');
      const jsPath   = join(outDir, stem + '.js');
      const emccOpts = optimize ? [`-${optimize}`] : [DEFAULT_OPTIMIZE_FLAG];
      const emccResult = spawnSync('emcc', [
        cPath, '-o', jsPath,
        '-I', dirname(runtimeH),
        '-sWASM=1',
        '-sSTANDALONE_WASM=1',
        `-D${TSC_DEFINES.WASM}`,
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
      const mcu = buildOpts.mcu || DEFAULT_AVR_MCU;
      const elfPath = join(outDir, stem + '.elf');
      const hexPath = join(outDir, stem + '.hex');
      const runtimeH = join(ROOT, RUNTIME_DIR, RUNTIME_HEADER);
      const gccOptimize = optimize ? [`-${optimize}`] : [SIZE_OPTIMIZE_FLAG];
      const gccResult = spawnSync('avr-gcc', [
        cPath, '-o', elfPath,
        '-I', dirname(runtimeH),
        `-mmcu=${mcu}`,
        C_STANDARD_FLAG,
        `-D${TSC_DEFINES.EMBEDDED}`,
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
        const flashCfg = _buildCfg?.flash as FlashConfig | undefined;
        const avrdudeArgs = [
          '-c', flashCfg!.programmer,
          '-p', mcu,
          '-P', flashCfg!.port,
          ...(flashCfg!.baud ? ['-b', String(flashCfg!.baud)] : []),
          ...(flashCfg!.extraFlags || []),
          '-U', `flash:w:${hexPath}:i`,
        ];
        const avrdudeResult = spawnSync('avrdude', avrdudeArgs, { stdio: 'pipe' });
        if (avrdudeResult.status !== 0) {
          process.stderr.write(`tsclang: avrdude failed:\n${avrdudeResult.stderr?.toString() || ''}\n`);
          return false;
        }
        process.stdout.write(`Flashed ${stem}.hex to ${mcu} via ${flashCfg!.programmer}\n`);
      } else {
        process.stdout.write(`Built ${stem}.hex\n`);
      }
    }

    return true;
  }

  if (watchMode) {
    const ts = () => new Date().toLocaleTimeString();
    let debounceTimer: NodeJS.Timeout | null = null;
    let watchedFiles = new Set<string>();

    function onFileChange() {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        process.stderr.write(`\n[${ts()}] Change detected вЂ” rebuilding...\n`);
        const ok = doBuild();
        if (ok) process.stderr.write(`[${ts()}] Build succeeded\n`);
        syncWatches(_lastSourceFiles);
        const n = watchedFiles.size;
        process.stderr.write(`[${ts()}] Watching ${n} file${n > 1 ? 's' : ''}...\n`);
      }, 150);
    }

    function syncWatches(files: string[]) {
      const newSet = new Set(files);
      for (const f of watchedFiles) {
        if (!newSet.has(f)) unwatchFile(f, onFileChange);
      }
      for (const f of newSet) {
        if (!watchedFiles.has(f)) watchFile(f, { interval: 200 }, onFileChange);
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
      for (const f of watchedFiles) unwatchFile(f, onFileChange);
      process.stderr.write(`\n[${ts()}] Watch stopped\n`);
      process.exit(0);
    });
  } else {
    if (!doBuild()) process.exit(1);
  }
}
