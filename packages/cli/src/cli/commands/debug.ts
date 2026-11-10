import { writeFileSync, mkdtempSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { compileTsc } from '@tsclang/compiler';
import { GCC_LINK_FLAGS, RUNTIME_DIR, DEBUG_FLAG } from '@tsclang/shared';
import { missingInput } from '../helpers.js';
import { toolAvailable } from '../toolchain.js';

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
  if (toolAvailable('gdb')) {
    const gdbArgs = ['--source-directory', dirname(inputPath), '-q', binaryPath];
    spawnSync('gdb', gdbArgs, { stdio: 'inherit' });
  } else {
    process.stderr.write('tsclang debug: gdb not found, running without debugger\n');
    const r = spawnSync(binaryPath, [], { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
}
