#!/usr/bin/env node
// TSClang test runner
// Three-level pipeline: tsclang→C comparison → gcc compile → binary run

import { readdir, readFile, stat, mkdir, rm, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
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

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const filterArg  = args.find(a => !a.startsWith('--'));
const flagVerbose = args.includes('--verbose') || args.includes('-v');
const flagHelp    = args.includes('--help')    || args.includes('-h');

if (flagHelp) {
  console.log(`Usage: node test/runner.js [filter] [--verbose]

  filter     substring match against test path
  --verbose  print full diff on failure
  --help     show this message
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Subprocess helper
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// C normalization
// ---------------------------------------------------------------------------
function normalizeC(src) {
  return src
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Test discovery
// ---------------------------------------------------------------------------
async function walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = join(dir, e.name);
    // skip non-test dirs (e.g. dirs named after phases without input.tsc)
    const sub = await readdir(full, { withFileTypes: true });
    const hasInput = sub.some(f => f.isFile() && f.name === 'input.tsc');
    if (hasInput) {
      results.push(full);
    } else {
      // recurse deeper
      const deeper = await walkDir(full);
      results.push(...deeper);
    }
  }
  return results;
}

// Classify test by presence of expected files
async function classifyTest(testDir) {
  const hasC    = existsSync(join(testDir, 'expected.c'));
  const hasOut  = existsSync(join(testDir, 'expected.out'));
  const hasErr  = existsSync(join(testDir, 'expected.error'));

  if (hasErr) return 'E';       // [E] Error — compiler must fail
  if (hasC && hasOut) return 'R'; // [R] Runnable — compile + run
  if (hasC) return 'F';          // [F] Fragment — C comparison only
  return null; // no expected files → skip
}

// Relative path for display
function relPath(p) {
  return p.replace(ROOT + '/', '').replace(ROOT + '\\', '');
}

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------
async function runTest(testDir) {
  const kind = await classifyTest(testDir);
  if (!kind) return { status: 'skip', testDir, reason: 'no expected files' };

  // Create isolated temp dir
  const tmpBase = join(tmpdir(), `tsclang-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpBase, { recursive: true });

  try {
    return await executeTest(testDir, kind, tmpBase);
  } finally {
    await rm(tmpBase, { recursive: true, force: true });
  }
}

async function executeTest(testDir, kind, tmpBase) {
  const inputSrc = join(testDir, 'input.tsc');

  // ------------------------------------------------------------------
  // Step 1: Run tsclang
  // ------------------------------------------------------------------
  const tscResult = await run(
    process.execPath,
    [TSCLANG_BIN, 'build', inputSrc, '--emit', 'c', '--outDir', tmpBase],
  );

  if (kind === 'E') {
    // Compiler should have failed
    if (tscResult.code === 0) {
      return {
        status: 'fail',
        testDir,
        step: 'compiler-exit',
        message: 'Expected compiler error but it exited 0',
        detail: tscResult.stdout,
      };
    }
    // Check that all lines from expected.error appear in stderr
    const expected = await readFile(join(testDir, 'expected.error'), 'utf8');
    const expectedLines = expected.split('\n').map(l => l.trim()).filter(Boolean);
    const stderr = tscResult.stderr;
    const missing = expectedLines.filter(line => !stderr.includes(line));
    if (missing.length > 0) {
      return {
        status: 'fail',
        testDir,
        step: 'error-check',
        message: `Missing in stderr:\n${missing.map(l => '  ' + l).join('\n')}`,
        detail: `stderr was:\n${stderr}`,
      };
    }
    return { status: 'pass', testDir };
  }

  // For [R] and [F]: compiler should succeed
  if (tscResult.code !== 0) {
    return {
      status: 'fail',
      testDir,
      step: 'tsclang',
      message: `tsclang exited ${tscResult.code}`,
      detail: tscResult.stderr || tscResult.stdout,
    };
  }

  // ------------------------------------------------------------------
  // Step 2: Compare C output
  // ------------------------------------------------------------------
  // Output file name: input.tsc → input.c
  const stem = basename(inputSrc, extname(inputSrc));
  const generatedC = join(tmpBase, stem + '.c');

  if (!existsSync(generatedC)) {
    return {
      status: 'fail',
      testDir,
      step: 'c-output',
      message: `Expected C file not found: ${generatedC}`,
      detail: `tsclang stdout: ${tscResult.stdout}`,
    };
  }

  const [actualCRaw, expectedCRaw] = await Promise.all([
    readFile(generatedC, 'utf8'),
    readFile(join(testDir, 'expected.c'), 'utf8'),
  ]);

  const actualC   = normalizeC(actualCRaw);
  const expectedC = normalizeC(expectedCRaw);

  if (actualC !== expectedC) {
    return {
      status: 'fail',
      testDir,
      step: 'c-compare',
      message: 'C output mismatch',
      detail: diffSummary(expectedC, actualC),
    };
  }

  if (kind === 'F') {
    // Fragment: verify C compiles but don't run
    const gccCheck = await gccCompile(generatedC, join(tmpBase, 'frag_check'));
    if (gccCheck.code !== 0) {
      return {
        status: 'fail',
        testDir,
        step: 'gcc',
        message: 'C does not compile',
        detail: gccCheck.stderr,
      };
    }
    return { status: 'pass', testDir };
  }

  // ------------------------------------------------------------------
  // Step 3: Compile generated C with gcc  ([R] only)
  // ------------------------------------------------------------------
  const binary = join(tmpBase, 'test_bin');
  const gccResult = await gccCompile(generatedC, binary);

  if (gccResult.code !== 0) {
    return {
      status: 'fail',
      testDir,
      step: 'gcc',
      message: 'C does not compile',
      detail: gccResult.stderr,
    };
  }

  // ------------------------------------------------------------------
  // Step 4: Run binary and compare stdout
  // ------------------------------------------------------------------
  const runResult = await run(binary, []);
  const expectedOut = await readFile(join(testDir, 'expected.out'), 'utf8');

  const actualOut   = runResult.stdout.replace(/\r\n/g, '\n').trimEnd();
  const expectedOut2 = expectedOut.replace(/\r\n/g, '\n').trimEnd();

  if (actualOut !== expectedOut2) {
    return {
      status: 'fail',
      testDir,
      step: 'run',
      message: 'stdout mismatch',
      detail: diffSummary(expectedOut2, actualOut),
    };
  }

  return { status: 'pass', testDir };
}

// ---------------------------------------------------------------------------
// gcc helper
// ---------------------------------------------------------------------------
async function gccCompile(cFile, outBin) {
  const args = [cFile, '-o', outBin];
  if (existsSync(RUNTIME_INC)) args.push(`-I${RUNTIME_INC}`);
  args.push('-Wall', '-Wextra', '-std=c11');
  return run('gcc', args);
}

// ---------------------------------------------------------------------------
// Minimal diff: show first 5 differing lines
// ---------------------------------------------------------------------------
function diffSummary(expected, actual) {
  const expLines = expected.split('\n');
  const actLines = actual.split('\n');
  const maxLen = Math.max(expLines.length, actLines.length);
  const diffs = [];
  for (let i = 0; i < maxLen && diffs.length < 8; i++) {
    const e = expLines[i] ?? '<missing>';
    const a = actLines[i] ?? '<missing>';
    if (e !== a) {
      diffs.push(`  line ${i + 1}:`);
      diffs.push(`    - ${e}`);
      diffs.push(`    + ${a}`);
    }
  }
  const extra = maxLen > 8 ? `  ... and more` : '';
  return diffs.join('\n') + (extra ? '\n' + extra : '');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(bold('TSClang Test Runner'));
  console.log(dim(`doc: ${DOC_DIR}`));
  console.log('');

  // Discover tests
  let testDirs = await walkDir(DOC_DIR);
  testDirs.sort();

  // Apply filter
  if (filterArg) {
    const needle = filterArg.toLowerCase();
    testDirs = testDirs.filter(d => d.toLowerCase().includes(needle));
    if (testDirs.length === 0) {
      console.log(yellow(`No tests match filter: "${filterArg}"`));
      process.exit(0);
    }
    console.log(dim(`Filter: "${filterArg}" → ${testDirs.length} test(s)`));
    console.log('');
  }

  console.log(dim(`Found ${testDirs.length} test(s)\n`));

  // Run all tests (concurrent, capped at 8)
  const CONCURRENCY = 8;
  const results = [];
  for (let i = 0; i < testDirs.length; i += CONCURRENCY) {
    const batch = testDirs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(runTest));
    results.push(...batchResults);

    for (const r of batchResults) {
      printResult(r);
    }
  }

  // Summary
  const passed  = results.filter(r => r.status === 'pass').length;
  const failed  = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  console.log('');
  console.log(bold('Results:'));
  if (passed)  console.log(`  ${green(`✓ ${passed} passed`)}`);
  if (failed)  console.log(`  ${red(`✗ ${failed} failed`)}`);
  if (skipped) console.log(`  ${yellow(`- ${skipped} skipped`)}`);

  if (failed > 0) {
    console.log('');
    console.log(bold('Failures:'));
    for (const r of results.filter(r => r.status === 'fail')) {
      console.log(`\n  ${red('✗')} ${relPath(r.testDir)}`);
      console.log(`    step: ${r.step}`);
      console.log(`    ${r.message}`);
      if ((flagVerbose || true) && r.detail) {
        const indented = r.detail.split('\n').map(l => '    ' + l).join('\n');
        console.log(indented);
      }
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

function printResult(r) {
  const label = relPath(r.testDir).padEnd(60);
  if (r.status === 'pass') {
    console.log(`  ${green('✓')} ${dim(label)}`);
  } else if (r.status === 'fail') {
    console.log(`  ${red('✗')} ${label} ${dim('[' + r.step + ']')}`);
  } else {
    console.log(`  ${yellow('-')} ${dim(label + ' (skip)')}`);
  }
}

main().catch(err => {
  console.error(red('Runner error: ' + err.message));
  console.error(err.stack);
  process.exit(2);
});
