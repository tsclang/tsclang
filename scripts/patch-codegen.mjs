#!/usr/bin/env node
// Patches codegen.ts: adds import, delegating methods, removes any-entries from declaration merging
// Usage: node scripts/patch-codegen.mjs <methods-json> <import-path> <module-var> <old-mixin-var>
// methods-json: JSON file with array of {name, params} objects
// import-path: e.g. './codegen/generics.js'
// module-var: e.g. 'genericsFns' (new import * as name)
// old-mixin-var: e.g. 'generics' (old import var to remove from imports, _mixinSources, Object.assign)

import { readFileSync, writeFileSync } from 'fs';

const [,, methodsFile, importPath, moduleVar, oldMixinVar] = process.argv;
if (!methodsFile || !importPath || !moduleVar) {
  console.error('Usage: node scripts/patch-codegen.mjs <methods-json> <import-path> <module-var> [old-mixin-var]');
  process.exit(1);
}
const methods = JSON.parse(readFileSync(methodsFile, 'utf8').trim());

let src = readFileSync('packages/compiler/src/compiler/codegen.ts', 'utf8');
src = src.replace(/\r\n/g, '\n');
const lines = src.split('\n');

// Phase 1: Remove any-entries from declaration merging
const methodNames = new Set(methods.map(m => m.name));
const newLines = [];
let removedCount = 0;
for (const line of lines) {
  const m = line.match(/^  (\w+)\(\.\.\.args: any\[\]\): any;$/);
  if (m && methodNames.has(m[1])) {
    removedCount++;
    continue;
  }
  newLines.push(line);
}
console.log(`Removed ${removedCount} any-entries from declaration merging`);

// Phase 2: Add import after the STDLIB_HANDLERS import
let importAdded = false;
const withImport = [];
for (const line of newLines) {
  withImport.push(line);
  if (!importAdded && line.includes("from './stdlib-registry.js'")) {
    withImport.push(`import * as ${moduleVar} from '${importPath}';`);
    importAdded = true;
  }
}
if (!importAdded) throw new Error('Could not find import insertion point');
console.log(`Added import: import * as ${moduleVar} from '${importPath}';`);

// Phase 3: Add delegating methods before the class closing brace
function splitParams(paramList) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of paramList) {
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; }
    else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map(p => p.trim());
}

const delegators = methods.map(m => {
  const paramList = m.params || '';
  const argNames = paramList
    ? splitParams(paramList).map(p => p.split(/[:\s=]/)[0].replace(/^\.{3}/, '...')).join(', ')
    : '';
  return `  ${m.name}(${paramList}) { return ${moduleVar}.${m.name}(this${argNames ? ', ' + argNames : ''}); }`;
}).join('\n');

let delegatorsAdded = false;
const withDelegators = [];
for (let i = 0; i < withImport.length; i++) {
  // Insert before the `}` that closes the class body
  // Look for: `}` followed by blank line(s) and `// Declaration merging` comment
  if (!delegatorsAdded && /^\}/.test(withImport[i])) {
    // Check if this is the class closing brace (followed by declaration merging comment)
    let nextIdx = i + 1;
    while (nextIdx < withImport.length && withImport[nextIdx].trim() === '') nextIdx++;
    if (nextIdx < withImport.length && withImport[nextIdx].includes('// Declaration merging')) {
      withDelegators.push(`  // Delegating methods: ${moduleVar}`);
      withDelegators.push(delegators);
      withDelegators.push('');
      delegatorsAdded = true;
    }
  }
  withDelegators.push(withImport[i]);
}
if (!delegatorsAdded) throw new Error('Could not find delegating method insertion point');
console.log(`Added ${methods.length} delegating methods`);

// Phase 4: Remove old mixin from _mixinSources, Object.assign, and imports
const finalLines = [];
let removedFromMixin = false;
let removedFromAssign = false;
let removedImport = false;

for (const line of withDelegators) {
  // Remove from _mixinSources: `  ['label',     oldVar],`
  if (oldMixinVar && new RegExp(`^\\s*\\['[^']+',\\s*${oldMixinVar}\\s*\\],?\\s*$`).test(line)) {
    console.log(`Removed ${oldMixinVar} from _mixinSources`);
    removedFromMixin = true;
    continue;
  }
  let modified = line;
  // Remove from Object.assign
  if (oldMixinVar && modified.includes('Object.assign(Context.prototype')) {
    const re = new RegExp(`,\\s*${oldMixinVar}(?=[,\\s])`, 'g');
    modified = modified.replace(re, '');
    if (modified !== line) {
      console.log(`Removed ${oldMixinVar} from Object.assign`);
      removedFromAssign = true;
    }
  }
  // Remove old import: `import oldVar from '...';`
  if (oldMixinVar && new RegExp(`^import\\s+${oldMixinVar}\\s+from\\s+'[^']*';\\s*$`).test(modified)) {
    console.log(`Removed old import: ${modified.trim()}`);
    removedImport = true;
    continue;
  }
  finalLines.push(modified);
}

let finalResult = finalLines.join('\n');
// Clean up any double blank lines
finalResult = finalResult.replace(/\n\n\n\n+/g, '\n\n\n');

writeFileSync('packages/compiler/src/compiler/codegen.ts', finalResult);
console.log('Written: packages/compiler/src/compiler/codegen.ts');
