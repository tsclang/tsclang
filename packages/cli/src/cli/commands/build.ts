import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, watchFile, unwatchFile } from 'fs';
import { join, basename, extname, resolve, dirname, delimiter } from 'path';
import { spawn, spawnSync } from 'child_process';
import { compileTsc, findPackageJson, renderDiagnostic, DESKTOP_CAPABILITIES, capabilityDefines, emitDtsSync } from '@tsclang/compiler';
import { flagValue, hasFlag, isValidOptimizeLevel, isValidNumberType, firstPositional } from '../args.js';
import { loadProfile, listAvailableProfiles, findPackageProfile } from '../profile-loader.js';
import type { Capabilities } from '../profile-loader.js';
import { generateBuildCmake, generateProjectCmake } from '../cmake.js';
import { checkLockStale, findIsolatedToolchain, parseToolchainSpec, resolveProfileExtras, resolveToolchain, toolchainInstructions } from '@tsclang/pm';
import { OPTIMIZE_LEVELS, PACKAGE_FILE, NUMBER_TYPES, C_STANDARD_FLAG, GCC_LINK_FLAGS, RUNTIME_HEADER, RUNTIME_WASM_HEADER, DEFAULT_AVR_MCU, TSC_DEFINES, DEFAULT_TARGET, RUNTIME_DIR, PROFILES_DIR, DEFAULT_OPTIMIZE_FLAG, SIZE_OPTIMIZE_FLAG, LIBUV_LINK_FLAG, EMIT_VALUES } from '@tsclang/shared';
import { validateStrictRules } from '../config-validator.js';
import { missingInput, checkInput, reportErrors } from '../helpers.js';
import { buildAvrdudeArgs, type FlashConfig } from '../flash.js';

interface BuildConfig {
  [key: string]: unknown;
}

export function runBuildCommand(args: string[], rootDir: string): void {
  const ROOT = rootDir;
  // #240: the positional input is the first non-flag token (flag values skipped),
  // so `tsclang build --build uno` resolves input from the manifest, not from '--build'
  let inputFile = firstPositional(args, 'build') ?? null;
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

  // An explicit positional .tsc file always wins over manifest entry points
  const _positionalFile = inputFile && inputFile.endsWith('.tsc') && !_buildName ? inputFile : null;

  // If no inputFile, read main from tsc.package.json
  if (!inputFile && _pkg?.main) {
    inputFile = _pkg.main;
  }

  let emit: string       = flagValue(args, '--emit') ?? 'c';
  let outDir: string     = flagValue(args, '--out-dir') ?? '.';
  const allErrors        = hasFlag(args, '--all-errors');
  const debugLines       = hasFlag(args, '--debug');
  const noCache          = hasFlag(args, '--no-cache');
  const sourcemap        = hasFlag(args, '--sourcemap');
  const watchMode        = hasFlag(args, '--watch');
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
  const _commandFlag      = flagValue(args, '--command') ?? null;
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
  // The name the profile was loaded under — used to locate the profile's
  // source dir (platform package vs built-in) for toolchainFile/include (#271)
  let _profileName: string | null = null;

  let _buildCfg: BuildConfig | null = null;
  let _pkgStrict: string[] | null = null;
  let _commandCfg: string | null = null;

  function _validateStrictRulesCli(rules: unknown, source: string): string[] {
    const err = validateStrictRules(rules, source);
    if (err) {
      process.stderr.write(`ConfigError: ${err}\n`);
      process.exit(1);
    }
    return rules as string[];
  }

  // --platform does not load a build config, so the entry point must already
  // be resolved (builds.<n>.main is not in play on this path)
  if (_platformFlag && !inputFile) missingInput('build');

  if (_platformFlag) {
    const prof = loadProfile(_platformFlag, PROFILES_PATH, inputFile ?? undefined);
    if (!prof) {
      process.stderr.write(`tsclang build: unknown profile '${_platformFlag}'; available: ${listAvailableProfiles(PROFILES_PATH).join(', ')}\n`);
      process.exit(1);
    }
    _capabilities = prof;
    _profileTarget = prof.target || _platformFlag;
    _profileName = _platformFlag;
  } else if (_effectiveBuild) {
    const pkgPath = findPackageJson(inputFile ? dirname(resolve(inputFile)) : process.cwd());
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
      // builds.<n>.main overrides the top-level manifest main (spec 13-build);
      // an explicit positional .tsc file still wins
      if (typeof buildCfg.main === 'string' && buildCfg.main && !_positionalFile) {
        inputFile = buildCfg.main;
      }
      if (buildCfg.profile) {
        const prof = loadProfile(buildCfg.profile, PROFILES_PATH, inputFile ?? undefined);
        if (!prof) {
          process.stderr.write(`tsclang build: unknown profile '${buildCfg.profile}' in build '${_buildFlag}'\n`);
          process.exit(1);
        }
        _capabilities = prof;
        _profileTarget = prof.target || buildCfg.profile;
        _profileName = buildCfg.profile;
      }
      if (buildCfg.optimize && !optimize) optimize = buildCfg.optimize;
      if (buildCfg.outDir && outDir === '.') outDir = buildCfg.outDir;
      if (buildCfg.emit && emit === 'c') emit = buildCfg.emit;
      if (buildCfg.defaultNumber && !_defaultNumberFlag) { _defaultNumberFlag = buildCfg.defaultNumber; }
      if (buildCfg.mcu && !_mcuFlag) _mcu = buildCfg.mcu;
      if (typeof buildCfg.command === 'string' && buildCfg.command) _commandCfg = buildCfg.command;
      if (pkg.strict) _pkgStrict = _validateStrictRulesCli(pkg.strict, 'tsc.package.json');
    } catch (e) {
      if (e instanceof Error) {
        process.stderr.write(`tsclang build: error reading tsc.package.json: ${e.message}\n`);
        process.exit(1);
      }
      throw e;
    }
  }

  // Entry chain complete: positional .tsc > builds.<n>.main > pkg.main.
  // Libraries have no top-level main — their entry comes from builds.<n>.main.
  if (!inputFile) {
    missingInput('build');
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

  // --command: post-build hook. The CLI flag overrides builds.<name>.command from
  // the ROOT tsc.package.json (dependency manifests are never read for builds).
  // Runs only after a successful build; never changes the emit value.
  const _command = _commandFlag ?? _commandCfg;
  let _cmdChild: ReturnType<typeof spawn> | null = null;

  function _killCommandChild(): void {
    if (!_cmdChild || _cmdChild.pid === undefined) { _cmdChild = null; return; }
    const pid = _cmdChild.pid;
    if (process.platform === 'win32') {
      // kill the whole process tree: the command may spawn children (pipelines)
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'pipe' });
    } else {
      try {
        process.kill(-pid, 'SIGTERM'); // negative pid = process group (detached spawn)
      } catch {
        try { _cmdChild!.kill('SIGTERM'); } catch {}
      }
    }
    _cmdChild = null;
  }

  function _runCommand(): void {
    // #272: platform scripts reach their inputs and toolchains cross-platform:
    // the generated .c (TSC_C_FILE), the isolated toolchain bin dirs
    // (TSC_TOOLS, delimiter-joined and prepended to PATH so tools are callable
    // by name) and the platform name (TSC_PLATFORM)
    const env: NodeJS.ProcessEnv = { ...process.env, TSC_OUT_DIR: resolve(outDir) };
    env.TSC_PLATFORM = String(_profileName ?? _profileTarget ?? DEFAULT_TARGET);
    if (_lastCPath) env.TSC_C_FILE = _lastCPath;
    const toolDirs = [..._toolBinDirs];
    if (toolDirs.length) {
      env.TSC_TOOLS = toolDirs.join(delimiter);
      _withToolsOnPath(env, toolDirs);
    }
    if (emit === 'exec') {
      // exec = the binary rung + the last-mile action: launch the artifact by
      // direct spawn on its absolute path, no shell (the host-shell "./x" vs
      // "x\" quirk never applies). One-shot propagates the program's exit code.
      const binPath = join(outDir, basename(inputFile!, extname(inputFile!)));
      const exePath = process.platform === 'win32' && existsSync(`${binPath}.exe`) ? `${binPath}.exe` : binPath;
      if (!watchMode) {
        const r = spawnSync(exePath, { stdio: 'inherit', env });
        if (r.error) {
          process.stderr.write(`tsclang build: --emit exec failed to start ${exePath}: ${r.error.message}\n`);
          process.exit(1);
        }
        process.exit(r.status ?? 0);
      }
      _killCommandChild();
      _cmdChild = spawn(exePath, {
        stdio: 'inherit', env,
        detached: process.platform !== 'win32',
      });
      _cmdChild.on('error', (e) => {
        process.stderr.write(`tsclang build: --emit exec failed to start: ${e.message}\n`);
      });
      return;
    }
    if (!_command) return;
    if (!watchMode) {
      const r = spawnSync(_command, { shell: true, stdio: 'inherit', env });
      process.exit(r.status ?? 0);
    }
    _killCommandChild();
    _cmdChild = spawn(_command, {
      shell: true, stdio: 'inherit', env,
      detached: process.platform !== 'win32',
    });
    _cmdChild.on('error', (e) => {
      process.stderr.write(`tsclang build: --command failed to start: ${e.message}\n`);
    });
  }

  if (!_capabilities && _targetFlag) {
    const prof = loadProfile(_targetFlag, PROFILES_PATH, inputFile);
    if (prof) {
      _capabilities = prof;
      if (!_profileTarget) _profileTarget = prof.target || _targetFlag;
      _profileName = _targetFlag;
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

  // ── isolated toolchains + profile extras (#271) ──
  // toolchainFile/include capability paths resolve against the profile's
  // source dir: a platform package ships them next to index.d.tsc.
  let _profileExtras: { includeDirs: string[]; toolchainFile?: string } = { includeDirs: [] };
  if (_capabilities && _profileName) {
    const baseDir = inputFile ? dirname(resolve(inputFile)) : process.cwd();
    const pkgProfile = findPackageProfile(_profileName, baseDir);
    let sourceDir: string | null = null;
    if (pkgProfile) sourceDir = dirname(pkgProfile);
    else if (existsSync(join(PROFILES_PATH, _profileName, 'index.d.tsc'))) sourceDir = join(PROFILES_PATH, _profileName);
    else if (existsSync(join(PROFILES_PATH, _profileName + '.d.tsc'))) sourceDir = PROFILES_PATH;
    if (sourceDir) {
      _profileExtras = resolveProfileExtras(
        { toolchainFile: _capabilities.toolchainFile, include: _capabilities.include },
        sourceDir,
      );
    }
  }

  // Toolchain resolution order (spec 13-build): the isolated platform cache
  // (~/.tsclang/platforms) first, then PATH. A pinned builds.<n>.toolchain
  // 'name@version' accepts PATH only with a matching --version; otherwise a
  // config error with the platform-install hint.
  const _toolchainPin = parseToolchainSpec(
    typeof _buildCfg?.toolchain === 'string' && _buildCfg.toolchain ? String(_buildCfg.toolchain) : '',
  );

  // #272: collected across the build so --command/scripts get the toolchain
  // bin dirs and the generated .c through env
  const _toolBinDirs = new Set<string>();
  let _lastCPath: string | null = null;

  interface ResolvedTool { command: string; env?: NodeJS.ProcessEnv }

  function _resolveTool(name: string, configError: string): ResolvedTool | null {
    const version = _toolchainPin.name === name ? _toolchainPin.version : undefined;
    const r = resolveToolchain(name, { version });
    if (!r) {
      if (version) {
        process.stderr.write(`error: toolchain '${name}@${version}' not found\n`);
        process.stderr.write('hint: tsclang platform install <platform>  (the toolchain ships with the platform package)\n');
      } else {
        process.stderr.write(configError + '\n');
        process.stderr.write(toolchainInstructions(name) + '\n');
      }
      return null;
    }
    if (r.kind === 'path') return { command: name };
    _toolBinDirs.add(r.binDir);
    // absolute path + PATH prepend: toolchain drivers call their own
    // assemblers/linkers by name (avr-gcc → avr-as), so the bin dir must
    // stay reachable even when the binary is spawned by absolute path
    return { command: join(r.binDir, name), env: _withToolsOnPath({ ...process.env }, [r.binDir]) };
  }

  // The toolchain reference a build uses: builds.<n>.toolchain → the profile
  // `toolchain` capability → the platform default.
  function _toolchainSpecName(): string {
    const target = String(_profileTarget || _targetFlag || _buildCfg?.target || DEFAULT_TARGET);
    return String(_buildCfg?.toolchain ?? _capabilities?.toolchain ?? (target === 'avr' ? 'avr-gcc' : 'gcc'));
  }

  // Prepend tool bin dirs to PATH. The variable may arrive as either `PATH`
  // or `Path` (MSYS/Git-Bash parents send `PATH`, native Windows sends `Path`)
  // — set BOTH keys to the same value so a stale duplicate can't shadow it.
  function _withToolsOnPath(env: NodeJS.ProcessEnv, dirs: string[]): NodeJS.ProcessEnv {
    const value = `${dirs.join(delimiter)}${delimiter}${process.env.Path ?? process.env.PATH ?? ''}`;
    env.PATH = value;
    env.Path = value;
    return env;
  }

  // --emit is validated after all sources are resolved (flag + builds.<name>.emit):
  // an unknown value must not silently fall back to emit=c
  if (!(EMIT_VALUES as readonly string[]).includes(emit)) {
    process.stderr.write(`ConfigError: unknown emit value '${emit}' (valid: ${EMIT_VALUES.join(', ')})\n`);
    process.exit(1);
  }

  // --emit exec is itself a launcher; an effective --command (flag or
  // builds.<name>.command) would be a second, competing one
  if (emit === 'exec' && _command) {
    process.stderr.write(
      'ConfigError: --emit exec already launches the built artifact; for a custom command use --emit binary --command "<cmd>"\n'
    );
    process.exit(1);
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

  // --emit dts: generate .d.tsc declarations only — the library entry for
  // consumers (same emitter as the emit-dts command, but with outDir support).
  // No codegen, no toolchain. Input existence is guaranteed by checkInput above.
  if (emit === 'dts') {
    const decls = emitDtsSync(readFileSync(inputPath, 'utf8'), basename(inputPath));
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, basename(inputPath, extname(inputPath)) + '.d.tsc');
    writeFileSync(outPath, decls.join('\n') + '\n', 'utf8');
    process.stdout.write(`Emitted ${outPath} (${decls.length} declarations)\n`);
    _runCommand();
    return;
  }

  // --emit cmake: generate CMakeLists.txt only, no .c compilation (replaces the old build-cmake command)
  if (emit === 'cmake') {
    const stem = basename(inputFile, extname(inputFile));
    const target = String(_profileTarget || _targetFlag || _buildCfg?.target || DEFAULT_TARGET);
    const toolchainSpec = _toolchainSpecName();
    // #271: the isolated platform cache resolves to an absolute compiler
    // path (forward slashes for cmake); a pinned version matching nothing —
    // neither cache nor PATH — is a config error with the install hint
    const spec = parseToolchainSpec(toolchainSpec);
    let toolchain = toolchainSpec;
    const isolated = findIsolatedToolchain(spec.name, { version: spec.version });
    if (isolated) {
      toolchain = join(isolated.binDir, spec.name).replace(/\\/g, '/');
      _toolBinDirs.add(isolated.binDir);
    } else if (spec.version && !resolveToolchain(spec.name, { version: spec.version })) {
      process.stderr.write(`error: toolchain '${spec.name}@${spec.version}' not found\n`);
      process.stderr.write('hint: tsclang platform install <platform>  (the toolchain ships with the platform package)\n');
      process.exit(1);
    }
    const projectName = (typeof _pkg?.name === 'string' && _pkg.name ? _pkg.name : stem)
      .replace(/^@[^/]+\//, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'CMakeLists.txt'), generateProjectCmake({
      projectName, target, mcu: _mcu, toolchain, optimize, mainFile: `${stem}.c`,
      toolchainFile: _profileExtras.toolchainFile,
      includeDirs: _profileExtras.includeDirs,
    }), 'utf8');
    process.stdout.write(`Built ${join(outDir, 'CMakeLists.txt')}\n`);
    _runCommand();
    return;
  }

  // --emit c spawns nothing, but platform scripts (#272) still need their
  // toolchain reachable through TSC_TOOLS
  if (emit === 'c') {
    const spec = parseToolchainSpec(_toolchainSpecName());
    const iso = findIsolatedToolchain(spec.name, { version: spec.version });
    if (iso) _toolBinDirs.add(iso.binDir);
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
    _lastCPath = resolve(cPath);

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

    if (emit === 'binary' || emit === 'exec') {
      // #241 + #271: a missing/mismatched toolchain is a config error, not a
      // "gcc failed:" with empty diagnostics. The compiler resolves from the
      // isolated platform cache first, then PATH; a profile `toolchain`
      // capability (clang, zcc, …) overrides the compiler name.
      const ccName = (typeof _capabilities?.toolchain === 'string' && _capabilities.toolchain
        ? parseToolchainSpec(_capabilities.toolchain).name
        : 'gcc');
      const ccTool = _resolveTool(ccName, `ConfigError: --emit binary requires ${ccName} in PATH`);
      if (!ccTool) return false;
      const runtimeH = join(ROOT, RUNTIME_DIR, RUNTIME_HEADER);
      const binPath = join(outDir, stem);
      const gccOptimize = optimize ? [`-${optimize}`] : [];
      const useLibuv = c.includes(`#define ${TSC_DEFINES.SCHEDULER_LIBUV}`);
      const gcc = spawnSync(ccTool.command, [
        cPath, '-o', binPath,
        '-I', dirname(runtimeH),
        ...GCC_LINK_FLAGS, C_STANDARD_FLAG,
        ...gccOptimize,
        ...(useLibuv ? [LIBUV_LINK_FLAG] : []),
        ..._profileExtras.includeDirs.flatMap((d) => ['-I', d]),
        ...capabilityDefines(_capabilities),
      ], { stdio: 'pipe', env: ccTool.env });
      if (gcc.status !== 0) {
        const gccStderr = gcc.stderr?.toString() || '';
        process.stderr.write(`tsclang: ${ccName} failed:\n${gccStderr}\n`);
        if (!gccStderr.trim()) {
          // a Windows gcc copied out of its MSYS2 environment dies before printing
          // anything — point the user at the likely cause instead of an empty log
          process.stderr.write('(gcc exited without diagnostics; on Windows use gcc from an MSYS2/MinGW environment — see book 00.2.1)\n');
        }
        return false;
      }
    }

    if (emit === 'wasm') {
      const emccTool = _resolveTool('emcc', 'ConfigError: --emit wasm requires emcc (Emscripten) in PATH');
      if (!emccTool) return false;
      const runtimeH = join(ROOT, RUNTIME_DIR, RUNTIME_WASM_HEADER);
      const wasmPath = join(outDir, stem + '.wasm');
      const jsPath   = join(outDir, stem + '.js');
      const emccOpts = optimize ? [`-${optimize}`] : [DEFAULT_OPTIMIZE_FLAG];
      const emccResult = spawnSync(emccTool.command, [
        cPath, '-o', jsPath,
        '-I', dirname(runtimeH),
        '-sWASM=1',
        '-sSTANDALONE_WASM=1',
        `-D${TSC_DEFINES.WASM}`,
        ...emccOpts,
        ..._profileExtras.includeDirs.flatMap((d) => ['-I', d]),
        ...capabilityDefines(_capabilities),
      ], { stdio: 'pipe', env: emccTool.env });
      if (emccResult.status !== 0) {
        process.stderr.write(`tsclang: emcc failed:\n${emccResult.stderr?.toString() || ''}\n`);
        return false;
      }
      process.stdout.write(`Built ${stem}.wasm\n`);
    }

    if (emit === 'hex' || emit === 'flash') {
      const avrGccTool = _resolveTool('avr-gcc', 'ConfigError: --emit hex/flash requires avr-gcc in PATH');
      if (!avrGccTool) return false;
      const mcu = buildOpts.mcu || DEFAULT_AVR_MCU;
      const elfPath = join(outDir, stem + '.elf');
      const hexPath = join(outDir, stem + '.hex');
      const runtimeH = join(ROOT, RUNTIME_DIR, RUNTIME_HEADER);
      const gccOptimize = optimize ? [`-${optimize}`] : [SIZE_OPTIMIZE_FLAG];
      const gccResult = spawnSync(avrGccTool.command, [
        cPath, '-o', elfPath,
        '-I', dirname(runtimeH),
        `-mmcu=${mcu}`,
        C_STANDARD_FLAG,
        `-D${TSC_DEFINES.EMBEDDED}`,
        ...gccOptimize,
        ..._profileExtras.includeDirs.flatMap((d) => ['-I', d]),
        ...capabilityDefines(_capabilities),
      ], { stdio: 'pipe', env: avrGccTool.env });
      if (gccResult.status !== 0) {
        process.stderr.write(`tsclang: avr-gcc failed:\n${gccResult.stderr?.toString() || ''}\n`);
        try { unlinkSync(elfPath); } catch {}
        return false;
      }
      // like avr-gcc above: a missing avr-objcopy is a config error, not an
      // empty "avr-objcopy failed:" log (toolchains often ship them separately)
      const objcopyTool = _resolveTool('avr-objcopy', 'ConfigError: --emit hex/flash requires avr-objcopy in PATH');
      if (!objcopyTool) {
        try { unlinkSync(elfPath); } catch {}
        return false;
      }
      const objcopyResult = spawnSync(objcopyTool.command, [
        '-O', 'ihex', elfPath, hexPath,
      ], { stdio: 'pipe', env: objcopyTool.env });
      if (objcopyResult.status !== 0) {
        process.stderr.write(`tsclang: avr-objcopy failed:\n${objcopyResult.stderr?.toString() || ''}\n`);
        try { unlinkSync(elfPath); } catch {}
        return false;
      }
      try { unlinkSync(elfPath); } catch {}

      if (emit === 'flash') {
        const avrdudeTool = _resolveTool('avrdude', 'ConfigError: --emit flash requires avrdude in PATH');
        if (!avrdudeTool) {
          try { unlinkSync(elfPath); } catch {}
          return false;
        }
        const flashCfg = _buildCfg?.flash as FlashConfig | undefined;
        const avrdudeArgs = buildAvrdudeArgs(flashCfg!, mcu, hexPath);
        const avrdudeResult = spawnSync(avrdudeTool.command, avrdudeArgs, { stdio: 'pipe', env: avrdudeTool.env });
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
        process.stderr.write(`\n[${ts()}] Change detected — rebuilding...\n`);
        const ok = doBuild();
        if (ok) {
          process.stderr.write(`[${ts()}] Build succeeded\n`);
          _runCommand();
        }
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
      _runCommand();
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
    _runCommand();
  }
}
