#!/usr/bin/env node
// Converts an entire codegen subsystem from mixin pattern to functional.
//
// Usage: node scripts/convert-subsystem.mjs <subsystem> <importVar> <file1> [file2] ...
// Example: node scripts/convert-subsystem.mjs async asyncFns async/helpers.ts async/scan.ts ...
//
// Steps:
// 1. Transform each file (transform-mixin.mjs)
// 2. Extract methods from transformed files
// 3. Update barrel (index.ts) to export *
// 4. Update shim (.ts) to export *
// 5. Patch codegen.ts (import, delegating methods, remove any-entries, remove from Object.assign)
// 6. Run typecheck

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';

const [,, subsystem, importVar, ...files] = process.argv;
if (!subsystem || !importVar || files.length === 0) {
  console.error('Usage: node scripts/convert-subsystem.mjs <subsystem> <importVar> <file1> [file2] ...');
  process.exit(1);
}

const codegenDir = 'packages/compiler/src/compiler/codegen';
const codegenTsPath = 'packages/compiler/src/compiler/codegen.ts';

// Step 1: Transform each file
console.log(`\n=== Converting subsystem: ${subsystem} (${files.length} files) ===\n`);

const allMethods = [];
for (const file of files) {
  const fullPath = resolve(`${codegenDir}/${file}`);
  console.log(`Transforming: ${file}`);

  // Run transform-mixin.mjs
  execSync(`node scripts/transform-mixin.mjs "${fullPath}"`, { stdio: 'pipe' });

  // Extract methods from transformed file
  const src = readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  for (const line of lines) {
    const m = line.match(/^export function (\w+)\(ctx: CodeGenContext(?:,\s*(.*?))?\)\s*\{/);
    if (m) {
      allMethods.push({ name: m[1], params: (m[2] || '').trim(), file });
    }
  }
}
console.log(`Total methods: ${allMethods.length}`);

// Step 2: Generate methods JSON for patch-codegen.mjs
const methodsJson = JSON.stringify(allMethods);
const methodsFile = resolve('scripts/_methods-tmp.json');
writeFileSync(methodsFile, methodsJson);

// Step 3: Determine import path for codegen.ts
// For single-file subsystems (e.g., generics.ts): import from the file directly
// For multi-file subsystems (e.g., async/): import from the barrel index.ts
let importPath;
const baseDir = dirname(files[0]);
const hasMultipleFiles = files.length > 1;
if (hasMultipleFiles || files[0].includes('/')) {
  // Multi-file: import from barrel
  importPath = `./codegen/${baseDir}/index.js`;
} else {
  // Single file: import from the file
  importPath = `./codegen/${files[0].replace(/\.ts$/, '.js')}`;
}

// Step 4: Update barrel (index.ts) if multi-file
if (hasMultipleFiles || files[0].includes('/')) {
  const barrelPath = resolve(`${codegenDir}/${baseDir}/index.ts`);
  console.log(`Updating barrel: ${baseDir}/index.ts`);
  const subFiles = files.map(f => {
    const parts = f.split('/');
    return parts[parts.length - 1].replace(/\.ts$/, '.js');
  });
  const barrelContent = subFiles.map(f => `export * from './${f}';`).join('\n') + '\n';
  writeFileSync(barrelPath, barrelContent);
}

// Step 5: Update shim (.ts) if it exists
const shimPath = resolve(`${codegenDir}/${subsystem}.ts`);
try {
  const shimSrc = readFileSync(shimPath, 'utf8');
  if (shimSrc.includes("export { default }")) {
    console.log(`Updating shim: ${subsystem}.ts`);
    if (hasMultipleFiles || files[0].includes('/')) {
      writeFileSync(shimPath, `export * from './${subsystem}/index.js';\n`);
    } else {
      writeFileSync(shimPath, `export * from './${files[0].replace(/\.ts$/, '.js')}';\n`);
    }
  }
} catch {
  // No shim file (e.g., calls has no calls.ts shim)
}

// Step 6: Patch codegen.ts
console.log(`Patching codegen.ts (import: ${importPath}, var: ${importVar})`);
execSync(`node scripts/patch-codegen.mjs "${methodsFile}" "${importPath}" "${importVar}"`, { stdio: 'inherit' });

// Step 7: Clean up
import { unlinkSync } from 'fs';
try { unlinkSync(methodsFile); } catch {}

// Step 8: Typecheck
console.log('\n=== Typecheck ===');
try {
  execSync('pnpm --filter @tsclang/compiler typecheck', { stdio: 'inherit', cwd: process.cwd() });
  console.log('Typecheck PASSED');
} catch {
  console.error('Typecheck FAILED — fix errors manually');
  process.exit(1);
}

console.log(`\nDone: ${subsystem} converted (${allMethods.length} methods)`);
