import { writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'fs';
import { join, resolve, basename } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { compileTsc } from '@tsclang/compiler';
import { C_STANDARD_FLAG, GCC_LINK_FLAGS } from '@tsclang/shared';

function findTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(fullPath));
    } else if (entry.name.endsWith('.test.tsc')) {
      files.push(fullPath);
    }
  }
  return files;
}

export function runTestCommand(args: string[]): void {
  const testDir = resolve(process.cwd(), 'test');
  if (!existsSync(testDir)) {
    console.error('tsclang test: no test/ directory found');
    process.exit(1);
  }

  const testFiles = findTestFiles(testDir);
  if (testFiles.length === 0) {
    console.log('tsclang test: no test files found');
    process.exit(0);
  }

  console.log(`Found ${testFiles.length} test file(s)\n`);

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const file of testFiles) {
    const name = basename(file);
    const tmpDir = mkdtempSync(join(tmpdir(), 'tsclang-test-'));

    try {
      const { c } = compileTsc(file);
      const cPath = join(tmpDir, name.replace('.tsc', '.c'));
      const binPath = join(tmpDir, name.replace('.tsc', ''));

      writeFileSync(cPath, c, 'utf8');

      const runtimeDir = resolve(process.cwd(), 'node_modules/@tsclang/compiler/src/runtime');
      const gcc = spawnSync('gcc', [cPath, '-o', binPath, `-I${runtimeDir}`, ...GCC_LINK_FLAGS, C_STANDARD_FLAG], { stdio: 'pipe' });

      if (gcc.status !== 0) {
        failed++;
        failures.push(`${name}: compile error\n${gcc.stderr?.toString() || ''}`);
        console.log(`  ✗ ${name} (compile error)`);
        continue;
      }

      const run = spawnSync(binPath, [], { stdio: 'pipe', timeout: 5000 });
      if (run.status === 0) {
        passed++;
        console.log(`  ✓ ${name}`);
      } else {
        failed++;
        failures.push(`${name}: exit code ${run.status}\n${run.stderr?.toString() || ''}`);
        console.log(`  ✗ ${name} (exit code ${run.status})`);
      }
    } catch (e) {
      failed++;
      failures.push(`${name}: ${String(e)}`);
      console.log(`  ✗ ${name} (error)`);
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  ✗ ${f}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}