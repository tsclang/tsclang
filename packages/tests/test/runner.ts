#!/usr/bin/env node
// TSClang test runner
// Supports three input types: .tsc, .json (config), .sh (CLI)
// Three test kinds: [R] run, [F] fragment (C-compare only), [E] compiler error

import { readdir, readFile, mkdir, rm, copyFile } from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawn, spawnSync } from 'child_process';
import { join, resolve, dirname, basename, extname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { parsePlatformDecl, compileTsc, renderDiagnostic } from '@tsclang/compiler';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');
const DOC_DIR = join(ROOT, 'packages', 'tests', 'test', 'cases');
const TSCLANG_BIN_JS = join(ROOT, 'packages', 'compiler', 'dist', 'index.js');
const TSCLANG_BIN_TS = join(ROOT, 'packages', 'compiler', 'src', 'index.ts');
const TSCLANG_BIN = existsSync(TSCLANG_BIN_JS) ? TSCLANG_BIN_JS : TSCLANG_BIN_TS;
const USE_TSX = !existsSync(TSCLANG_BIN_JS);
const TSX_LOADER = pathToFileURL(join(ROOT, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs')).href;
const RUNTIME_INC = join(ROOT, 'packages', 'compiler', 'src', 'runtime');

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------
const tty = process.stdout.isTTY;
const c = (code, s) => tty ? `\x1b[${code}m${s}\x1b[0m` : s;
const green  = s => c('32', s);
const red    = s => c('31', s);
const yellow = s => c('33', s);
const dim    = s => c('2',  s);
const bold   = s => c('1',  s);
const cyan   = s => c('36', s);

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const filterArgs  = args.filter(a => !a.startsWith('--'));
const filterArg   = filterArgs.length > 0 ? filterArgs.join(' ') : null;
const flagVerbose = args.includes('--verbose') || args.includes('-v');
const flagHelp    = args.includes('--help')    || args.includes('-h');
const flagFail    = args.includes('--fail-fast');
const flagNoGcc   = args.includes('--no-gcc');

if (flagHelp) {
  console.log(`Usage: node test/runner.js [filter] [options]

  filter        substring match against test path (e.g. "03-types", "let/bool")
  --verbose     print full diff on failure
  --fail-fast   stop after first failure
  --no-gcc      skip gcc compile/run steps (C-compare only)
  --help        show this message

Examples:
  node test/runner.js 03-types
  node test/runner.js let/bool-false --verbose
  node test/runner.js 13-build --no-gcc
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Subprocess helper
// ---------------------------------------------------------------------------
// On Windows, MSYS2 gcc requires its own bash environment to work (cc1.exe needs
// the MSYS2 runtime). We detect the MSYS2 bash and use it for gcc and shell tests.
const MSYS2_BASH = process.platform === 'win32'
  ? (() => { try { return existsSync('C:\\msys64\\usr\\bin\\bash.exe') ? 'C:\\msys64\\usr\\bin\\bash.exe' : null; } catch { return null; } })()
  : null;

// Convert Windows path → MSYS2 path (C:\foo\bar → /c/foo/bar)
function toMsysPath(p) {
  if (process.platform !== 'win32') return p;
  return p.replace(/^([A-Za-z]):\\/, (_, d) => '/' + d.toLowerCase() + '/').replace(/\\/g, '/');
}

function run(cmd, args, opts = {}) {
  return new Promise(resolve => {
    const proc = spawn(cmd, args, { ...opts, shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', d => { stdout += d; });
    proc.stderr?.on('data', d => { stderr += d; });
    proc.on('error', err => resolve({ code: 1, stdout, stderr: err.message }));
    proc.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function runShell(script, opts = {}) {
  // Use MSYS2 bash on Windows so Unix shell scripts work
  const sh     = MSYS2_BASH ?? (process.platform === 'win32' ? 'cmd' : 'sh');
  const shArgs = MSYS2_BASH ? ['--login', '-c', `export PATH="/mingw64/bin:$PATH" && ${script}`]
    : process.platform === 'win32' ? ['/c', script]
    : ['-c', script];
  return new Promise(resolve => {
    const proc = spawn(sh, shArgs, { ...opts, shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', d => { stdout += d; });
    proc.stderr?.on('data', d => { stderr += d; });
    proc.on('error', err => resolve({ code: 1, stdout, stderr: err.message }));
    proc.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

// ---------------------------------------------------------------------------
// C normalization (trailing whitespace + extra blank lines)
// ---------------------------------------------------------------------------
function normalizeC(src) {
  return src
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeOut(s) {
  return s.replace(/\r\n/g, '\n').trimEnd();
}

function normalizeAvrOut(s) {
  const lines = s.replace(/\r\n/g, '\n').split('\n');
  const filtered = lines.filter(l => {
    const clean = l.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (clean.startsWith('Loaded ') || clean.startsWith('Load HEX ') || clean.startsWith('signal caught')) return false;
    return true;
  });
  const uart = filtered.map(l => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/\.\.+$/, '').trimEnd()).filter(l => l.length > 0);
  return uart.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------
// Test discovery
// ---------------------------------------------------------------------------

// Detect which input file a test dir has
function detectInput(testDir) {
  if (existsSync(join(testDir, 'input.tsc')))  return 'tsc';
  if (existsSync(join(testDir, 'input.json'))) return 'json';
  if (existsSync(join(testDir, 'input.sh')))   return 'sh';
  return null;
}

async function walkDir(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = join(dir, e.name);
    if (detectInput(full)) {
      results.push(full);
    } else {
      results.push(...await walkDir(full));
    }
  }
  return results;
}

// Classify test by input type + present expected files
async function classifyTest(testDir) {
  const inputType = detectInput(testDir);
  if (!inputType) return null;

  const hasC          = existsSync(join(testDir, 'expected.c'));
  const hasOut        = existsSync(join(testDir, 'expected.out'));
  const hasErr        = existsSync(join(testDir, 'expected.error'));
  const hasRuntimeErr = existsSync(join(testDir, 'expected.runtime-error'));
  const hasWarning    = existsSync(join(testDir, 'expected.warning'));

  if (hasErr) return { kind: 'E', inputType };

  if (inputType === 'tsc') {
    if (hasC && hasOut) return { kind: 'R', inputType, hasWarning };
    if (hasC && hasRuntimeErr) return { kind: 'RE', inputType, hasWarning };
    if (hasC)           return { kind: 'F', inputType, hasWarning };
    return null; // tsc test with no expected files — skip
  }

  // json / sh tests: only need expected.out or expected.error
  if (hasOut) return { kind: 'R', inputType };
  return null;
}

function relPath(p) {
  return p.replace(ROOT + '/', '').replace(ROOT + '\\', '').replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// gcc helper
// ---------------------------------------------------------------------------
let gccAvailable = null;
async function checkGcc() {
  if (gccAvailable !== null) return gccAvailable;
  // On Windows with MSYS2 bash: test that gcc can actually compile, not just --version
  if (MSYS2_BASH) {
    const r = await runShell('gcc --version');
    gccAvailable = r.code === 0;
  } else {
    const r = await run('gcc', ['--version']);
    gccAvailable = r.code === 0;
  }
  return gccAvailable;
}

async function gccCompile(cFile, outBin) {
  const extraLibs = process.platform === 'win32' ? '-lws2_32' : '';
  if (MSYS2_BASH) {
    // On Windows: run gcc via MSYS2 bash so cc1.exe has the correct runtime environment
    const inc  = existsSync(RUNTIME_INC) ? `-I${toMsysPath(RUNTIME_INC)}` : '';
    const src  = toMsysPath(cFile);
    const out  = toMsysPath(outBin);
    const cmd  = `gcc ${src} -o ${out} ${inc} -Wall -Wextra -std=c11 -lm ${extraLibs}`;
    return runShell(cmd);
  }
  const compileArgs = [cFile, '-o', outBin];
  if (existsSync(RUNTIME_INC)) compileArgs.push(`-I${RUNTIME_INC}`);
  compileArgs.push('-Wall', '-Wextra', '-std=c11', '-lm');
  if (extraLibs) compileArgs.push(extraLibs);
  return run('gcc', compileArgs);
}

// ---------------------------------------------------------------------------
// AVR toolchain helpers (via WSL on Windows)
// ---------------------------------------------------------------------------
const HAS_WSL = process.platform === 'win32'
  ? (() => { try { const r = spawnSync('wsl', ['--list'], { timeout: 5000 }); return r.status === 0; } catch { return false; } })()
  : false;

function toWslPath(p) {
  return p.replace(/^([A-Za-z]):\\/, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');
}

let avrGccAvailable = null;
async function checkAvrGcc() {
  if (avrGccAvailable !== null) return avrGccAvailable;
  if (HAS_WSL) {
    const r = await runWsl('avr-gcc --version');
    avrGccAvailable = r.code === 0;
  } else {
    const r = await run('avr-gcc', ['--version']);
    avrGccAvailable = r.code === 0;
  }
  return avrGccAvailable;
}

let simavrAvailable = null;
async function checkSimavr() {
  if (simavrAvailable !== null) return simavrAvailable;
  if (HAS_WSL) {
    const r = await runWsl('which simavr 2>/dev/null');
    simavrAvailable = r.code === 0;
  } else {
    const r = await run('simavr', ['--help']);
    simavrAvailable = r.code === 0;
  }
  return simavrAvailable;
}

function runWsl(cmd, opts = {}) {
  return new Promise(resolve => {
    const proc = spawn('wsl', ['bash', '-c', cmd], { ...opts, shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', d => { stdout += d; });
    proc.stderr?.on('data', d => { stderr += d; });
    proc.on('error', err => resolve({ code: 1, stdout, stderr: err.message }));
    proc.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function avrGccCompile(cFile, elfFile, defines = []) {
  const incDir = RUNTIME_INC;
  const args = [
    cFile, '-o', elfFile,
    '-I', incDir,
    '-mmcu=atmega328p', '-std=c11', '-Os',
    '-DTSC_EMBEDDED',
    ...defines,
    '-Wl,-u,vfprintf', '-lprintf_flt',
  ];
  if (HAS_WSL) {
    const wSrc = toWslPath(cFile);
    const wOut = toWslPath(elfFile);
    const wInc = toWslPath(incDir);
    const tmpSrc = `/tmp/tsclang_${Date.now()}.c`;
    const tmpOut = `/tmp/tsclang_${Date.now()}.elf`;
    const cpResult = await runWsl(`cp ${wSrc} ${tmpSrc}`);
    if (cpResult.code !== 0) return cpResult;
    const result = await runWsl(`avr-gcc ${tmpSrc} -o ${tmpOut} -I ${wInc} -mmcu=atmega328p -std=c11 -Os -DTSC_EMBEDDED ${defines.join(' ')} -Wl,-u,vfprintf -lprintf_flt`);
    if (result.code === 0) {
      await runWsl(`cp ${tmpOut} ${wOut}`);
    }
    await runWsl(`rm -f ${tmpSrc} ${tmpOut}`);
    return result;
  }
  return run('avr-gcc', args);
}

async function avrObjcopy(elfFile, hexFile) {
  if (HAS_WSL) {
    const wElf = toWslPath(elfFile);
    const wHex = toWslPath(hexFile);
    const tmpElf = `/tmp/tsclang_${Date.now()}.elf`;
    const tmpHex = `/tmp/tsclang_${Date.now()}.hex`;
    const cpResult = await runWsl(`cp ${wElf} ${tmpElf}`);
    if (cpResult.code !== 0) return cpResult;
    const result = await runWsl(`avr-objcopy -O ihex ${tmpElf} ${tmpHex}`);
    if (result.code === 0) {
      await runWsl(`cp ${tmpHex} ${wHex}`);
    }
    await runWsl(`rm -f ${tmpElf} ${tmpHex}`);
    return result;
  }
  return run('avr-objcopy', ['-O', 'ihex', elfFile, hexFile]);
}

async function runSimavr(hexFile, mcu = 'atmega328p', freq = 16000000, timeoutMs = 5000) {
  if (HAS_WSL) {
    const wHex = toWslPath(hexFile);
    const tmpHex = `/tmp/tsclang_${Date.now()}.hex`;
    const cpResult = await runWsl(`cp ${wHex} ${tmpHex}`);
    if (cpResult.code !== 0) return cpResult;
    const result = await runWsl(`timeout ${Math.ceil(timeoutMs / 1000)} simavr -m ${mcu} -f ${freq} -uart0:stdio ${tmpHex} 2>&1 || true`);
    await runWsl(`rm -f ${tmpHex}`);
    return result;
  }
  return run('simavr', ['-m', mcu, '-f', String(freq), '-uart0:stdio', hexFile]);
}

// ---------------------------------------------------------------------------
// Check tsclang binary exists
// ---------------------------------------------------------------------------
let tsclangAvailable = null;
function checkTsclang() {
  if (tsclangAvailable !== null) return tsclangAvailable;
  tsclangAvailable = existsSync(TSCLANG_BIN);
  return tsclangAvailable;
}

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------
async function runTest(testDir) {
  const cls = await classifyTest(testDir);
  if (!cls) return { status: 'skip', testDir, reason: 'no expected files' };

  const tmpBase = join(tmpdir(), `tsclang-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpBase, { recursive: true });

  try {
    return await executeTest(testDir, cls, tmpBase);
  } finally {
    await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
  }
}

async function executeTest(testDir, { kind, inputType, hasWarning }, tmpBase) {
  switch (inputType) {
    case 'tsc':  return executeTscTest(testDir, kind, tmpBase, { hasWarning });
    case 'json': return executeJsonTest(testDir, kind, tmpBase);
    case 'sh':   return executeShTest(testDir, kind, tmpBase);
    default:     return { status: 'skip', testDir, reason: `unknown input type: ${inputType}` };
  }
}

// ---------------------------------------------------------------------------
// Test metadata (meta.json)
// ---------------------------------------------------------------------------
const PROFILES_DIR = join(ROOT, "packages", "compiler", "src", "profiles");

function loadProfile(name) {
  const newDtsPath = join(PROFILES_DIR, name, "index.d.tsc");
  const dtsPath = join(PROFILES_DIR, name + ".d.tsc");
  const jsonPath = join(PROFILES_DIR, name + ".json");
  if (existsSync(newDtsPath)) {
    try { return parsePlatformDecl(readFileSync(newDtsPath, "utf8"), newDtsPath); } catch { return null; }
  }
  if (existsSync(dtsPath)) {
    try { return parsePlatformDecl(readFileSync(dtsPath, "utf8"), dtsPath); } catch { return null; }
  }
  if (existsSync(jsonPath)) {
    try { return JSON.parse(readFileSync(jsonPath, "utf8")); } catch { return null; }
  }
  return null;
}

function readMeta(testDir) {
  const p = join(testDir, 'meta.json');
  if (!existsSync(p)) return { flags: [], profile: null };
  try {
    const meta = JSON.parse(readFileSync(p, 'utf8'));
    const flags = [];

    // Profile-based: pass --platform to CLI for capability resolution
    if (meta.profile) {
      flags.push('--platform', meta.profile);
      const prof = loadProfile(meta.profile);
      const profTarget = prof?.target || null;
      if (prof) {
        const targetName = prof.target || meta.profile;
        flags.push('--target', targetName);
        if (prof.allocator)     flags.push('--allocator', prof.allocator);
        if (prof.async === 'libuv')       flags.push('--async', 'libuv');
        else if (prof.async === 'state_machine') flags.push('--async', 'state_machine');
        else if (prof.async === 'none')   flags.push('--async', 'none');
        if (prof.defaultNumber) flags.push('--default-number', prof.defaultNumber);
      }
      // Meta overrides on top of profile
      if (meta.defaultNumber)  flags.push('--default-number', meta.defaultNumber);
      if (meta.ramSize)        flags.push('--ram-size', String(meta.ramSize));
      if (meta.stackSize)      flags.push('--stack-size', String(meta.stackSize));
      if (meta.optimize)       flags.push('--optimize', 'O2');
      if (meta.debug)          flags.push('--debug');
      if (meta.strict) {
        if (Array.isArray(meta.strict)) flags.push('--strict', meta.strict.join(','));
        else flags.push('--strict', String(meta.strict));
      }
      return { flags, profile: meta.profile, profTarget };
    }

    // Legacy: direct flags (backward compat)
    if (meta.target)         flags.push('--target', meta.target);
    if (meta.defaultNumber)  flags.push('--default-number', meta.defaultNumber);
    if (meta.allocator)      flags.push('--allocator', meta.allocator);
    if (meta.scheduler)      flags.push('--async', meta.scheduler);
    if (meta.ramSize)        flags.push('--ram-size', String(meta.ramSize));
    if (meta.stackSize)      flags.push('--stack-size', String(meta.stackSize));
    if (meta.optimize)       flags.push('--optimize', 'O2');
    if (meta.debug)          flags.push('--debug');
    if (meta.strict) {
      if (Array.isArray(meta.strict)) flags.push('--strict', meta.strict.join(','));
      else flags.push('--strict', String(meta.strict));
    }
    return { flags, profile: null };
  } catch { return { flags: [], profile: null }; }
}

// Convert meta.json + flags.txt to codegen opts (bypasses CLI flag parsing)
function metaToOpts(testDir) {
  const opts = {};
  const metaPath = join(testDir, 'meta.json');
  let meta = {};
  if (existsSync(metaPath)) {
    try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch {}
  }

  // Also read tsc.package.json (some tests specify config here)
  const pkgPath = join(testDir, 'tsc.package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.strict && !meta.strict) meta.strict = Array.isArray(pkg.strict) ? pkg.strict : [pkg.strict];
    } catch {}
  }

  // Profile-based capabilities
  if (meta.profile) {
    const prof = loadProfile(meta.profile);
    if (prof) {
      opts.target = prof.target || meta.profile;
      if (prof.allocator) opts.allocator = prof.allocator;
      if (prof.async) opts.scheduler = prof.async;
      if (prof.defaultNumber) opts.defaultNumber = prof.defaultNumber;
      opts.capabilities = prof;
    }
  }

  // Direct meta overrides
  if (meta.target) opts.target = meta.target;
  if (meta.defaultNumber) opts.defaultNumber = meta.defaultNumber;
  if (meta.allocator) opts.allocator = meta.allocator;
  if (meta.scheduler) opts.scheduler = meta.scheduler;
  if (meta.ramSize) opts.ramSize = meta.ramSize;
  if (meta.stackSize) opts.stackSize = meta.stackSize;
  if (meta.optimize) opts.optimize = true;
  if (meta.debug) opts.debugLines = true;
  if (meta.strict) opts.strict = Array.isArray(meta.strict) ? meta.strict : [meta.strict];

  return opts;
}

// ---------------------------------------------------------------------------
// .tsc tests — full compiler pipeline
// ---------------------------------------------------------------------------
async function executeTscTest(testDir, kind, tmpBase, { hasWarning } = {}) {
  const inputSrc = join(testDir, 'input.tsc');
  const opts = metaToOpts(testDir);
  const profTarget = opts.target || null;

  // Step 1: Compile directly (no subprocess)
  let result, stderr = '';
  try {
    result = compileTsc(inputSrc, opts);
  } catch (e) {
    if (e?.isTscErrorBag) {
      stderr = e.errors.map(err => renderDiagnostic(err, { contextLines: 1 })).join('\n');
      stderr += '\naborting due to ' + e.errors.length + ' error' + (e.errors.length > 1 ? 's' : '') + '\n';
    } else {
      stderr = e?.message || String(e);
    }
    if (kind === 'E') {
      return checkErrorOutput(testDir, stderr);
    }
    return fail(testDir, 'tsclang', `Compiler error: ${stderr}`, stderr);
  }

  if (kind === 'E') {
    return fail(testDir, 'compiler-exit', 'Expected compiler error but compilation succeeded', '');
  }

  // Write C output
  const stem = basename(inputSrc, extname(inputSrc));
  const generatedC = join(tmpBase, stem + '.c');
  writeFileSync(generatedC, result.c);

  const cCompareResult = await compareCOutput(testDir, generatedC);
  if (cCompareResult) return cCompareResult;

  // Warning verification (for tests with expected.warning)
  if (hasWarning) {
    const warningText = (result.warnings || []).map(w => renderDiagnostic(w, { contextLines: 1 })).join('\n');
    const warningResult = await checkErrorOutput(testDir, warningText, 'expected.warning');
    if (warningResult.status !== 'pass') return warningResult;
  }

  if (kind === 'F' || flagNoGcc) {
    if (flagNoGcc) return pass(testDir);
    // [F]: verify C compiles (skip if external libs required)
    const cSrc = await readFile(generatedC, 'utf8');
    if (cSrc.includes('#define TSC_SCHEDULER_LIBUV')) return pass(testDir);
    if (!await checkGcc()) return { status: 'skip', testDir, reason: 'gcc not found' };
    const gccCheck = await gccCompile(generatedC, join(tmpBase, 'frag_bin'));
    if (gccCheck.code !== 0) return fail(testDir, 'gcc', 'C does not compile', gccCheck.stderr);
    return pass(testDir);
  }

  // Step 3+4: Compile and run [R]
  if (profTarget === 'avr') {
    if (!await checkAvrGcc()) return { status: 'skip', testDir, reason: 'avr-gcc not found (install avr-libc)' };
    const elfFile = join(tmpBase, 'test_avr.elf');
    const hexFile = join(tmpBase, 'test_avr.hex');
    const flagsFromFile = existsSync(join(testDir, 'flags.txt'))
      ? (readFileSync(join(testDir, 'flags.txt'), 'utf8').trim().split(/\s+/).filter(Boolean))
      : [];
    const dFlags = flagsFromFile.filter((f: string) => f.startsWith('-D'));
    const defines = dFlags.length > 0 ? dFlags : ['-DTSC_NO_POSIX', '-DTSC_NO_STRTOLL', '-DTSC_CONSOLE_UART', '-DTSC_CONSOLE_BAUD=9600'];
    const avrResult = await avrGccCompile(generatedC, elfFile, defines);
    if (avrResult.code !== 0) return fail(testDir, 'avr-gcc', 'C does not compile with avr-gcc', avrResult.stderr);
    const objcopyResult = await avrObjcopy(elfFile, hexFile);
    if (objcopyResult.code !== 0) return fail(testDir, 'avr-objcopy', 'objcopy failed', objcopyResult.stderr);
    if (!await checkSimavr()) return { status: 'skip', testDir, reason: 'simavr not found' };
    const simResult = await runSimavr(hexFile);
    if (simResult.code !== 0 && !simResult.stdout) return fail(testDir, 'simavr', `simavr exited ${simResult.code}`, simResult.stderr);
    const expectedOut = await readFile(join(testDir, 'expected.out'), 'utf8');
    const actual   = normalizeAvrOut(simResult.stdout);
    const expected = normalizeOut(expectedOut);
    if (actual !== expected) {
      return fail(testDir, 'run', 'stdout mismatch (AVR/simavr)', diffSummary(expected, actual));
    }
    return pass(testDir);
  }

  if (!await checkGcc()) return { status: 'skip', testDir, reason: 'gcc not found' };
  const binary = join(tmpBase, 'test_bin');
  const gccResult = await gccCompile(generatedC, binary);
  if (gccResult.code !== 0) return fail(testDir, 'gcc', 'C does not compile', gccResult.stderr);

  if (kind === 'RE') return runAndCheckRuntimeError(testDir, binary);

  return runAndCompare(testDir, binary, []);
}

// ---------------------------------------------------------------------------
// .json tests — config validation
// ---------------------------------------------------------------------------
async function executeJsonTest(testDir, kind) {
  if (!checkTsclang()) {
    return { status: 'skip', testDir, reason: 'tsclang not built (src/index.ts missing)' };
  }

  const inputJson = join(testDir, 'input.json');

  const tscArgs = USE_TSX
    ? ['--import', TSX_LOADER, TSCLANG_BIN, 'validate-config', inputJson]
    : [TSCLANG_BIN, 'validate-config', inputJson];

  const tscResult = await run(
    process.execPath,
    tscArgs,
  );

  if (kind === 'E') {
    if (tscResult.code === 0) {
      return fail(testDir, 'config-exit', 'Expected config error but exited 0', tscResult.stdout);
    }
    return checkErrorOutput(testDir, tscResult.stderr + tscResult.stdout);
  }

  if (tscResult.code !== 0) {
    return fail(testDir, 'config-validate', `validate-config exited ${tscResult.code}`, tscResult.stderr);
  }

  const expectedOut = await readFile(join(testDir, 'expected.out'), 'utf8');
  const actual = normalizeOut(tscResult.stdout);
  const expected = normalizeOut(expectedOut);
  if (actual !== expected) {
    return fail(testDir, 'output', 'stdout mismatch', diffSummary(expected, actual));
  }
  return pass(testDir);
}

// ---------------------------------------------------------------------------
// .sh tests — CLI commands
// ---------------------------------------------------------------------------
async function executeShTest(testDir, kind, tmpBase) {
  if (!checkTsclang()) {
    return { status: 'skip', testDir, reason: 'tsclang not built (src/index.ts missing)' };
  }

  const script = await readFile(join(testDir, 'input.sh'), 'utf8');

  // Copy fixture files (non-special) from test dir to tmpBase
  const specialFiles = new Set(['input.sh', 'input.json', 'input.tsc', 'expected.out', 'expected.error', 'expected.c']);
  const testFiles = await readdir(testDir);
  for (const f of testFiles) {
    if (!specialFiles.has(f)) {
      await copyFile(join(testDir, f), join(tmpBase, f));
    }
  }

  // Substitute TSCLANG_BIN in the script so `tsclang` calls work.
  // Use the full node executable path (MSYS2-compatible) so bash can find it.
  const nodeExec = MSYS2_BASH ? `"${toMsysPath(process.execPath)}"` : 'node';
  const tscBin   = MSYS2_BASH ? toMsysPath(TSCLANG_BIN) : TSCLANG_BIN;
  const tsclangCmd = USE_TSX
    ? `${nodeExec} --import ${TSX_LOADER} ${JSON.stringify(tscBin)}`
    : `${nodeExec} ${JSON.stringify(tscBin)}`;
  const patchedScript = script
    .replace(/\bnode\b/g, nodeExec)
    .replace(/\btsclang\b/g, tsclangCmd);

  const finalScript = MSYS2_BASH
    ? `cd "${toMsysPath(tmpBase)}" && ${patchedScript}`
    : patchedScript;

  const env = { ...process.env };
  if (USE_TSX) env.NODE_OPTIONS = `--import ${TSX_LOADER}`;

  const result = await runShell(finalScript, { cwd: tmpBase, env });

  if (kind === 'E') {
    if (result.code === 0) {
      return fail(testDir, 'sh-exit', 'Expected failure but shell exited 0', result.stdout);
    }
    return checkErrorOutput(testDir, result.stderr + result.stdout);
  }

  if (result.code !== 0) {
    return fail(testDir, 'sh-run', `shell exited ${result.code}`, result.stderr || result.stdout);
  }

  const expectedOut = await readFile(join(testDir, 'expected.out'), 'utf8');
  const actual = normalizeOut(result.stdout);
  const expected = normalizeOut(expectedOut);
  if (actual !== expected) {
    return fail(testDir, 'output', 'stdout mismatch', diffSummary(expected, actual));
  }
  return pass(testDir);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
async function checkErrorOutput(testDir, combined, errFile = 'expected.error') {
  const expected = await readFile(join(testDir, errFile), 'utf8');
  const expectedLines = expected.split('\n').map(l => l.trim()).filter(Boolean);
  const missing = expectedLines.filter(line => !combined.includes(line));
  if (missing.length > 0) {
    return fail(
      testDir,
      'error-check',
      `Missing in output:\n${missing.map(l => '  ' + l).join('\n')}`,
      `actual output:\n${combined.slice(0, 500)}`
    );
  }
  return pass(testDir);
}

async function compareCOutput(testDir, generatedCPath) {
  const [actualRaw, expectedRaw] = await Promise.all([
    readFile(generatedCPath, 'utf8'),
    readFile(join(testDir, 'expected.c'), 'utf8'),
  ]);
  const actual   = normalizeC(actualRaw);
  const expected = normalizeC(expectedRaw);
  if (actual !== expected) {
    return fail(testDir, 'c-compare', 'C output mismatch', diffSummary(expected, actual));
  }
  return null; // no error
}

async function runAndCompare(testDir, binary, runArgs) {
  const runResult = MSYS2_BASH
    ? await runShell(`"${toMsysPath(binary)}"`)
    : await run(binary, runArgs);
  const expectedOut = await readFile(join(testDir, 'expected.out'), 'utf8');
  const actual   = normalizeOut(runResult.stdout);
  const expected = normalizeOut(expectedOut);
  if (actual !== expected) {
    return fail(testDir, 'run', 'stdout mismatch', diffSummary(expected, actual));
  }
  return pass(testDir);
}

async function runAndCheckRuntimeError(testDir, binary) {
  const runResult = MSYS2_BASH
    ? await runShell(`"${toMsysPath(binary)}"`)
    : await run(binary, []);
  if (runResult.code === 0) {
    return fail(testDir, 'runtime-error', 'Expected non-zero exit code but exited 0', runResult.stdout || runResult.stderr);
  }
  return checkErrorOutput(testDir, runResult.stderr + runResult.stdout, 'expected.runtime-error');
}

function pass(testDir) {
  return { status: 'pass', testDir };
}

function fail(testDir, step, message, detail = '') {
  return { status: 'fail', testDir, step, message, detail };
}

// ---------------------------------------------------------------------------
// Minimal diff: show first 8 differing lines
// ---------------------------------------------------------------------------
function diffSummary(expected, actual) {
  const expLines = expected.split('\n');
  const actLines = actual.split('\n');
  const maxLen = Math.max(expLines.length, actLines.length);
  const diffs = [];
  for (let i = 0; i < maxLen && diffs.length < 24; i++) {
    const e = expLines[i] ?? '<missing>';
    const a = actLines[i] ?? '<missing>';
    if (e !== a) {
      diffs.push(`  line ${i + 1}:`);
      diffs.push(`    ${red('-')} ${e}`);
      diffs.push(`    ${green('+')} ${a}`);
    }
  }
  if (diffs.length === 0 && expected !== actual) {
    diffs.push('  (trailing whitespace or line-ending difference)');
  }
  const extra = maxLen > 8 ? `  ${dim('... and more')}` : '';
  return diffs.join('\n') + (extra ? '\n' + extra : '');
}

// ---------------------------------------------------------------------------
// Result printer
// ---------------------------------------------------------------------------
function printResult(r) {
  const label = relPath(r.testDir).padEnd(62);
  if (r.status === 'pass') {
    console.log(`  ${green('✓')} ${dim(label)}`);
  } else if (r.status === 'fail') {
    console.log(`  ${red('✗')} ${label} ${dim('[' + r.step + ']')}`);
    if (flagVerbose && r.detail) {
      const indented = r.detail.split('\n').map(l => '    ' + l).join('\n');
      console.log(indented);
    }
  } else {
    console.log(`  ${yellow('-')} ${dim(label + ' (skip: ' + r.reason + ')')}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(bold('TSClang Test Runner'));
  console.log(dim(`doc:      ${DOC_DIR}`));
  console.log(dim(`tsclang:  ${checkTsclang() ? green('found') : yellow('not built')}` + (checkTsclang() && !USE_TSX ? dim(' (compiled)') : '')));
  console.log(dim(`gcc:      ${await checkGcc() ? green('found') : yellow('not found')}`));
  console.log(dim(`avr-gcc:  ${await checkAvrGcc() ? green('found') : yellow('not found')}`));
  console.log(dim(`simavr:   ${await checkSimavr() ? green('found') : yellow('not found')}`));
  if (flagNoGcc) console.log(dim('mode:     ' + yellow('--no-gcc (skip compile/run)')));
  console.log('');

  let testDirs = await walkDir(DOC_DIR);
  testDirs.sort();

  if (filterArgs.length > 0) {
    const needles = filterArgs.map(f => f.toLowerCase());
    testDirs = testDirs.filter(d => {
      const norm = d.toLowerCase().replace(/\\/g, '/');
      return needles.some(n => norm.includes(n));
    });
    if (testDirs.length === 0) {
      console.log(yellow(`No tests match filter: "${filterArgs.join(', ')}"`));
      process.exit(0);
    }
    const label = filterArgs.length === 1 ? `"${filterArgs[0]}"` : `[${filterArgs.join(', ')}]`;
    console.log(dim(`Filter: ${label} → ${testDirs.length} test(s)\n`));
  } else {
    console.log(dim(`Found ${testDirs.length} test(s)\n`));
  }

  // Group by phase for display
  let lastPhase = '';

  const results = [];
  const CONCURRENCY = 8;

  for (let i = 0; i < testDirs.length; i += CONCURRENCY) {
    const batch = testDirs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(runTest));

    for (const r of batchResults) {
      // Phase header
      const phase = relPath(r.testDir).split('/')[0];
      if (phase !== lastPhase) {
        console.log(cyan(`\n  ${phase}`));
        lastPhase = phase;
      }
      printResult(r);
      results.push(r);

      if (flagFail && r.status === 'fail') {
        console.log(red('\n  Stopped (--fail-fast)\n'));
        printSummary(results);
        process.exit(1);
      }
    }
  }

  console.log('');
  printSummary(results);

  const failed = results.filter(r => r.status === 'fail');
  if (failed.length > 0) {
    console.log('');
    console.log(bold('Failures:'));
    for (const r of failed) {
      console.log(`\n  ${red('✗')} ${relPath(r.testDir)}`);
      console.log(`    ${dim('step:')} ${r.step}`);
      const msgLines = r.message.split('\n').map((l, i) => i === 0 ? '    ' + l : '      ' + l);
      console.log(msgLines.join('\n'));
      if (r.detail) {
        const indented = r.detail.split('\n').map(l => '    ' + l).join('\n');
        console.log(indented);
      }
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

function printSummary(results) {
  const passed  = results.filter(r => r.status === 'pass').length;
  const failed  = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  console.log(bold('Results:'));
  if (passed)  console.log(`  ${green(`✓ ${passed} passed`)}`);
  if (failed)  console.log(`  ${red(`✗ ${failed} failed`)}`);
  if (skipped) console.log(`  ${yellow(`- ${skipped} skipped`)}`);
}

main().catch(err => {
  console.error(red('Runner error: ' + err.message));
  if (flagVerbose) console.error(err.stack);
  process.exit(2);
});
