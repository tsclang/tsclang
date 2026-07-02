#!/usr/bin/env node
// Transforms a mixin file from `export default { method(this: CodeGenThis, ...) {} }`
// to `export function method(ctx: CodeGenContext, ...) {}`
//
// Usage: node scripts/transform-mixin.mjs <file.ts> [--dry-run]
// Outputs: transformed file + delegating methods + names to remove from declaration merging

import { readFileSync, writeFileSync } from 'fs';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!file) {
  console.error('Usage: node scripts/transform-mixin.mjs <file.ts> [--dry-run]');
  process.exit(1);
}

let src = readFileSync(file, 'utf8');
// Normalize CRLF → LF (Windows safety)
src = src.replace(/\r\n/g, '\n');
// Global replace CodeGenThis → CodeGenContext before any processing
src = src.replace(/\bCodeGenThis\b/g, 'CodeGenContext');
const lines = src.split('\n');

// Phase 1: Find default export block boundaries
let defaultExportStart = -1;
let defaultExportEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^\s*export\s+default\s*\{/.test(lines[i])) {
    defaultExportStart = i;
  }
  if (defaultExportStart >= 0 && /^\};\s*$/.test(lines[i])) {
    defaultExportEnd = i;
    break;
  }
}
if (defaultExportStart < 0 || defaultExportEnd < 0) {
  console.error('Could not find `export default { ... };` block');
  process.exit(1);
}

// Phase 2: Extract method names + parameter signatures
const methods = [];
for (let i = defaultExportStart + 1; i < defaultExportEnd; i++) {
  const m = lines[i].match(/^  (\w+)\(this:\s*CodeGenContext\s*,?\s*(.*?)\)\s*\{/);
  if (m) {
    methods.push({ name: m[1], params: m[2].trim(), lineIdx: i });
  }
}
console.log(`Found ${methods.length} methods`);

// Phase 3: Build output lines
const out = [];

// Lines before default export
for (let i = 0; i < defaultExportStart; i++) {
  out.push(lines[i]);
}

// Transform methods inside default export
for (let i = defaultExportStart + 1; i < defaultExportEnd; i++) {
  let line = lines[i];

  // Method definition: `  methodName(this: CodeGenContext, params) {`
  const methodMatch = line.match(/^  (\w+)\(this:\s*CodeGenContext\s*,?\s*(.*?)\)\s*\{(.*)$/);
  if (methodMatch) {
    const name = methodMatch[1];
    const params = methodMatch[2].trim();
    const rest = methodMatch[3];
    line = `export function ${name}(ctx: CodeGenContext${params ? ', ' + params : ''}) {${rest}`;
  }

  // Method closing: `  },` or `  }` at exactly 2-space indent
  if (/^  \},?\s*$/.test(line)) {
    line = '}';
  }

  // Replace this. → ctx.
  line = line.replace(/\bthis\./g, 'ctx.');

  out.push(line);
}

// Lines after default export (none expected, but handle just in case)
for (let i = defaultExportEnd + 1; i < lines.length; i++) {
  out.push(lines[i]);
}

const transformed = out.join('\n');

// Phase 4: Generate codegen.ts helpers
const importPath = file
  .replace(/\\/g, '/')
  .replace(/^.*\/compiler\/src\/compiler\//, './')
  .replace(/\.ts$/, '.js');

const moduleVar = file
  .replace(/\\/g, '/')
  .replace(/^.*\//, '')
  .replace(/\.ts$/, '')
  .replace(/-/g, '');

// Delegating methods for Context class body
const delegators = methods.map(m => {
  const paramList = m.params || '';
  const argNames = paramList
    ? paramList.split(',').map(p => p.trim().split(/[:\s=]/)[0].replace(/^\.{3}/, '...')).join(', ')
    : '';
  return `  ${m.name}(${paramList}) { return ${moduleVar}.${m.name}(this${argNames ? ', ' + argNames : ''}); }`;
}).join('\n');

// Entries to remove from declaration merging
const entriesToRemove = methods.map(m => `  ${m.name}(...args: any[]): any;`).join('\n');

console.log('\n=== IMPORT for codegen.ts ===');
console.log(`import * as ${moduleVar} from '${importPath}';`);

console.log('\n=== DELEGATING METHODS (add to Context class body) ===');
console.log(delegators);

console.log('\n=== ENTRIES TO REMOVE from declaration merging interface ===');
console.log(entriesToRemove);

console.log('\n=== _mixinSources / Object.assign ===');
console.log(`Remove ['types', types] from _mixinSources`);
console.log(`Remove types from Object.assign call`);

if (!dryRun) {
  writeFileSync(file, transformed);
  console.log(`\nWritten: ${file}`);
} else {
  console.log('\n=== DRY RUN: transformed file (first 30 lines) ===');
  console.log(transformed.split('\n').slice(0, 30).join('\n'));
}
