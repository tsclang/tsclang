#!/usr/bin/env node
// TSClang CLI entry point

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

import { lex }     from '../src/compiler/lexer.js';
import { parse }   from '../src/compiler/parser.js';
import { codegen } from '../src/compiler/codegen.js';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

const command = args[0];

if (!command) {
  console.error('Usage: tsclang <command> [options]');
  console.error('Commands: build');
  process.exit(1);
}

if (command === 'build') {
  const inputFile = args[1];
  if (!inputFile) {
    console.error('tsclang build: missing input file');
    process.exit(1);
  }

  const emitIdx  = args.indexOf('--emit');
  const emit     = emitIdx !== -1 ? args[emitIdx + 1] : 'c';
  const outIdx   = args.indexOf('--outDir');
  const outDir   = outIdx !== -1 ? args[outIdx + 1] : '.';

  const inputPath = resolve(inputFile);
  let src;
  try {
    src = readFileSync(inputPath, 'utf8');
  } catch (e) {
    console.error(`tsclang: cannot read '${inputPath}': ${e.message}`);
    process.exit(1);
  }

  const filename = basename(inputPath);
  const stem     = basename(inputPath, extname(inputPath));

  let c;
  try {
    const tokens = lex(src, filename);
    const ast    = parse(tokens, filename);
    c            = codegen(ast, stem);
  } catch (e) {
    console.error(`${filename}: ${e.message}`);
    if (process.env.TSC_DEBUG) console.error(e.stack);
    process.exit(1);
  }

  if (emit === 'c') {
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, stem + '.c');
    writeFileSync(outPath, c, 'utf8');
  }

} else {
  console.error(`tsclang: unknown command '${command}'`);
  process.exit(1);
}
