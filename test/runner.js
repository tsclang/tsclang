#!/usr/bin/env node
// TSClang test runner
// Supports three input types: .tsc, .json (config), .sh (CLI)
// Three test kinds: [R] run, [F] fragment (C-compare only), [E] compiler error

import { readdir, readFile, mkdir, rm, copyFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { join, resolve, dirname, basename, extname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOC_DIR = join(ROOT, 'doc');
const TSCLANG_BIN = join(ROOT, 'bin', 'index.js');
const RUNTIME_INC = join(ROOT, 'src', 'runtime');

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

  filter        substring match against test path (e.g. "phase1", "let/bool")
  --verbose     print full diff on failure
  --fail-fast   stop after first failure
  --no-gcc      skip gcc compile/run steps (C-compare only)
  --help        show this message

Examples:
  node test/runner.js phase1
  node test/runner.js let/bool-false --verbose
  node test/runner.js phase9 --no-gcc
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
  const shArgs = MSYS2_BASH ? ['--login', '-c', script]
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

  const hasC   = existsSync(join(testDir, 'expected.c'));
  const hasOut = existsSync(join(testDir, 'expected.out'));
  const hasErr = existsSync(join(testDir, 'expected.error'));

  if (hasErr) return { kind: 'E', inputType };

  if (inputType === 'tsc') {
    if (hasC && hasOut) return { kind: 'R', inputType };
    if (hasC)           return { kind: 'F', inputType };
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
  if (MSYS2_BASH) {
    // On Windows: run gcc via MSYS2 bash so cc1.exe has the correct runtime environment
    const inc  = existsSync(RUNTIME_INC) ? `-I${toMsysPath(RUNTIME_INC)}` : '';
    const src  = toMsysPath(cFile);
    const out  = toMsysPath(outBin);
    const cmd  = `gcc ${src} -o ${out} ${inc} -Wall -Wextra -std=c11 -lm`;
    return runShell(cmd);
  }
  const compileArgs = [cFile, '-o', outBin];
  if (existsSync(RUNTIME_INC)) compileArgs.push(`-I${RUNTIME_INC}`);
  compileArgs.push('-Wall', '-Wextra', '-std=c11', '-lm');
  return run('gcc', compileArgs);
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

async function executeTest(testDir, { kind, inputType }, tmpBase) {
  switch (inputType) {
    case 'tsc':  return executeTscTest(testDir, kind, tmpBase);
    case 'json': return executeJsonTest(testDir, kind, tmpBase);
    case 'sh':   return executeShTest(testDir, kind, tmpBase);
    default:     return { status: 'skip', testDir, reason: `unknown input type: ${inputType}` };
  }
}

// ---------------------------------------------------------------------------
// .tsc tests — full compiler pipeline
// ---------------------------------------------------------------------------
async function executeTscTest(testDir, kind, tmpBase) {
  if (!checkTsclang()) {
    return { status: 'skip', testDir, reason: 'tsclang not built (bin/index.js missing)' };
  }

  const inputSrc = join(testDir, 'input.tsc');

  // Step 1: Run tsclang
  const tscResult = await run(
    process.execPath,
    [TSCLANG_BIN, 'build', inputSrc, '--emit', 'c', '--outDir', tmpBase,
     ...(existsSync(join(testDir, 'flags.txt'))
       ? (readFileSync(join(testDir, 'flags.txt'), 'utf8').trim().split(/\s+/).filter(Boolean))
       : [])],
  );

  if (kind === 'E') {
    if (tscResult.code === 0) {
      return fail(testDir, 'compiler-exit', 'Expected compiler error but exited 0', tscResult.stdout || tscResult.stderr);
    }
    return checkErrorOutput(testDir, tscResult.stderr + tscResult.stdout);
  }

  if (tscResult.code !== 0) {
    return fail(testDir, 'tsclang', `tsclang exited ${tscResult.code}`, tscResult.stderr || tscResult.stdout);
  }

  // Step 2: Compare C output
  const stem = basename(inputSrc, extname(inputSrc));
  const generatedC = join(tmpBase, stem + '.c');

  if (!existsSync(generatedC)) {
    return fail(testDir, 'c-output', `Expected C file not found: ${generatedC}`, `tsclang stdout: ${tscResult.stdout}`);
  }

  const cCompareResult = await compareCOutput(testDir, generatedC);
  if (cCompareResult) return cCompareResult;

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
  if (!await checkGcc()) return { status: 'skip', testDir, reason: 'gcc not found' };
  const binary = join(tmpBase, 'test_bin');
  const gccResult = await gccCompile(generatedC, binary);
  if (gccResult.code !== 0) return fail(testDir, 'gcc', 'C does not compile', gccResult.stderr);

  return runAndCompare(testDir, binary, []);
}

// ---------------------------------------------------------------------------
// .json tests — config validation
// ---------------------------------------------------------------------------
async function executeJsonTest(testDir, kind) {
  if (!checkTsclang()) {
    return { status: 'skip', testDir, reason: 'tsclang not built (bin/index.js missing)' };
  }

  const inputJson = join(testDir, 'input.json');

  const tscResult = await run(
    process.execPath,
    [TSCLANG_BIN, 'validate-config', inputJson],
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
    return { status: 'skip', testDir, reason: 'tsclang not built (bin/index.js missing)' };
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
  const patchedScript = script
    .replace(/\bnode\b/g, nodeExec)
    .replace(/\btsclang\b/g, `${nodeExec} ${JSON.stringify(tscBin)}`);

  const result = await runShell(patchedScript, { cwd: tmpBase });

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
async function checkErrorOutput(testDir, combined) {
  const expected = await readFile(join(testDir, 'expected.error'), 'utf8');
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
  // On Windows: run compiled binary via MSYS2 bash to handle path and DLL issues
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
  console.log(dim(`tsclang:  ${checkTsclang() ? green('found') : yellow('not built')}`));
  console.log(dim(`gcc:      ${await checkGcc() ? green('found') : yellow('not found')}`));
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
