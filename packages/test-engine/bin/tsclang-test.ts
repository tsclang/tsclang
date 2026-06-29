#!/usr/bin/env node
// tsclang-test — standalone test runner for TSClang

import { resolve, join, basename } from 'path';
import { existsSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';

function findTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(fullPath));
    } else if (entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const args = process.argv.slice(2);
const testDir = args[0] || 'test';

if (!existsSync(testDir)) {
  console.error(`tsclang-test: directory '${testDir}' not found`);
  process.exit(1);
}

const testFiles = findTestFiles(testDir);
if (testFiles.length === 0) {
  console.log(`tsclang-test: no test files found in '${testDir}'`);
  process.exit(0);
}

console.log(`Found ${testFiles.length} test file(s)\n`);

let passed = 0;
let failed = 0;

for (const file of testFiles) {
  const name = basename(file);
  const result = spawnSync('npx', ['tsx', resolve(file)], {
    stdio: 'pipe',
    shell: true,
    timeout: 30000
  });
  
  if (result.status === 0) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
    if (result.stderr) {
      const stderr = result.stderr.toString().split('\n').filter(Boolean).join('\n    ');
      console.log(`    ${stderr}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);