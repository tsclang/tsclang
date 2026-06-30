import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join, basename, extname, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { compileTsc } from '@tsclang/compiler';
import { OPTIMIZE_LEVELS, C_STANDARD_FLAG, GCC_LINK_FLAGS, RUNTIME_HEADER, RUNTIME_DIR, DEBUG_FLAG } from '@tsclang/shared';
import { getPositionalAfter, isValidOptimizeLevel } from '../args.js';
import { missingInput, checkInput, reportErrors } from '../helpers.js';

export function runRunCommand(args: string[], rootDir: string): void {
  const inputFile = args[1];
  if (!inputFile) {
    missingInput('run');
  }

  const progArgs = getPositionalAfter(args, '--');
  const sepIdx = args.indexOf('--');
  const runOptIdx = args.indexOf('--optimize');
  const runOptimize = runOptIdx !== -1 && runOptIdx < (sepIdx !== -1 ? sepIdx : args.length) ? args[runOptIdx + 1] : null;
  if (runOptimize && !isValidOptimizeLevel(runOptimize)) {
    process.stderr.write(`tsclang run: invalid --optimize value '${runOptimize}'; use ${OPTIMIZE_LEVELS.join(', ')}\n`);
    process.exit(1);
  }

  const inputPath = resolve(inputFile);
  checkInput('run', inputPath);
  let c: string, warnings: unknown[];
  try {
    ({ c, warnings } = compileTsc(inputPath));
  } catch (e) {
    reportErrors(e, basename(inputPath));
    process.exit(1);
  }

  const stem    = basename(inputPath, extname(inputPath));
  const tmpDir  = mkdtempSync(join(tmpdir(), 'tsclang-'));
  const cPath   = join(tmpDir, stem + '.c');
  const binPath = join(tmpDir, stem);
  writeFileSync(cPath, c, 'utf8');

  const runtimeH = join(rootDir, RUNTIME_DIR, RUNTIME_HEADER);
  const runGccOpt = runOptimize ? [`-${runOptimize}`] : [];
  const gcc = spawnSync('gcc', [
    cPath, '-o', binPath,
    '-I', dirname(runtimeH),
    ...GCC_LINK_FLAGS, C_STANDARD_FLAG,
    ...runGccOpt,
  ], { stdio: 'pipe' });
  if (gcc.status !== 0) {
    process.stderr.write(`tsclang: gcc failed:\n${gcc.stderr?.toString() || ''}\n`);
    process.exit(1);
  }

  const runResult = spawnSync(binPath, progArgs, { stdio: 'inherit' });
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  process.exit(runResult.status ?? 0);
}

export function runDebugCommand(args: string[], rootDir: string): void {
  const inputFile = args[1];
  if (!inputFile) {
    missingInput('debug');
  }
  const inputPath = resolve(inputFile);
  const { c } = compileTsc(inputPath, { debugLines: true, sourcemap: true });
  const tmpDir = mkdtempSync(join(tmpdir(), 'tsclang-dbg-'));
  const mainC = join(tmpDir, 'main.c');
  const binaryPath = join(tmpDir, 'main');
  writeFileSync(mainC, c, 'utf8');
  const runtimeInc = join(rootDir, RUNTIME_DIR);
  const gccResult = spawnSync('gcc', [mainC, '-o', binaryPath, DEBUG_FLAG, `-I${runtimeInc}`, ...GCC_LINK_FLAGS], { encoding: 'utf8' });
  if (gccResult.status !== 0) {
    process.stderr.write(gccResult.stderr || 'gcc failed\n');
    process.exit(1);
  }
  const gdbCheck = spawnSync('gdb', ['--version'], { encoding: 'utf8' });
  if (gdbCheck.status === 0) {
    const gdbArgs = ['--source-directory', dirname(inputPath), '-q', binaryPath];
    spawnSync('gdb', gdbArgs, { stdio: 'inherit' });
  } else {
    process.stderr.write('tsclang debug: gdb not found, running without debugger\n');
    const r = spawnSync(binaryPath, [], { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
}
