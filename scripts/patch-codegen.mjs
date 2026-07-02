#!/usr/bin/env node
// Patches codegen.ts: adds import, delegating methods, removes any-entries from declaration merging
// Usage: node scripts/patch-codegen.mjs <methods-json> <import-path> <module-var>
// methods-json: JSON array of {name, params} objects

import { readFileSync, writeFileSync } from 'fs';

const [,, methodsFile, importPath, moduleVar] = process.argv;
const methods = JSON.parse(readFileSync(methodsFile, 'utf8').trim());

let src = readFileSync('packages/compiler/src/compiler/codegen.ts', 'utf8');
// Normalize CRLF
src = src.replace(/\r\n/g, '\n');
const lines = src.split('\n');

// Phase 1: Remove any-entries from declaration merging
const methodNames = new Set(methods.map(m => m.name));
const newLines = [];
let removedCount = 0;
for (const line of lines) {
  // Match: `  methodName(...args: any[]): any;`
  const m = line.match(/^  (\w+)\(\.\.\.args: any\[\]\): any;$/);
  if (m && methodNames.has(m[1])) {
    removedCount++;
    continue; // skip this line
  }
  newLines.push(line);
}
console.log(`Removed ${removedCount} any-entries from declaration merging`);

// Phase 2: Add import after the existing imports block
let importAdded = false;
const withImport = [];
for (const line of newLines) {
  withImport.push(line);
  // Add after the last import in the imports block (after STDLIB_HANDLERS import)
  if (!importAdded && line.includes("from './stdlib-registry.js'")) {
    withImport.push(`import * as ${moduleVar} from '${importPath}';`);
    importAdded = true;
  }
}
if (!importAdded) throw new Error('Could not find import insertion point');
console.log(`Added import: import * as ${moduleVar} from '${importPath}';`);

// Phase 3: Add delegating methods before the class closing brace
// Find the last method/property before `}` that closes the class
// The class ends with `}` followed by blank line and the declaration merging comment
const delegators = methods.map(m => {
  const paramList = m.params || '';
  const argNames = paramList
    ? paramList.split(',').map(p => p.trim().split(/[:\s=]/)[0].replace(/^\.{3}/, '...')).join(', ')
    : '';
  return `  ${m.name}(${paramList}) { return ${moduleVar}.${m.name}(this${argNames ? ', ' + argNames : ''}); }`;
}).join('\n');

let delegatorsAdded = false;
const withDelegators = [];
for (let i = 0; i < withImport.length; i++) {
  // Insert before the `}` that closes the class body
  // Look for addLambda line, then skip blank lines to find `}`
  if (!delegatorsAdded && withImport[i].includes('addLambda(')) {
    // Find the closing } (may be separated by blank lines)
    let closeIdx = i + 1;
    while (closeIdx < withImport.length && withImport[closeIdx].trim() === '') closeIdx++;
    if (closeIdx < withImport.length && /^\}/.test(withImport[closeIdx])) {
      // Insert delegators right before the blank line / closing brace
      withDelegators.push(withImport[i]);
      withDelegators.push('');
      withDelegators.push('  // Delegating methods: types/helpers → functional');
      withDelegators.push(delegators);
      withDelegators.push('');
      delegatorsAdded = true;
      continue;
    }
  }
  withDelegators.push(withImport[i]);
}
if (!delegatorsAdded) throw new Error('Could not find delegating method insertion point');
console.log(`Added ${methods.length} delegating methods`);

// Phase 4: Remove types from _mixinSources and Object.assign
const finalLines = [];
for (const line of withDelegators) {
  if (line.trim().startsWith("['types',") || line.trim().startsWith("['types'," )) {
    console.log('Removed types from _mixinSources');
    continue;
  }
  let modified = line;
  // Remove types from Object.assign
  if (modified.includes('Object.assign(Context.prototype')) {
    modified = modified.replace(/,\s*types(?=[,\s])/g, '');
    // Also remove types from the mixinSources array if it's inline
    console.log('Removed types from Object.assign');
  }
  finalLines.push(modified);
}

// Also remove the import of types barrel if it exists
const result = finalLines.join('\n');
let finalResult = result;
// Remove: `import types     from './codegen/types.js';`
finalResult = finalResult.replace(/import\s+types\s+from\s+'\.\/codegen\/types\.js';\n?/g, '');
console.log('Removed types barrel import');

// Write
writeFileSync('packages/compiler/src/compiler/codegen.ts', finalResult);
console.log('Written: packages/compiler/src/compiler/codegen.ts');
