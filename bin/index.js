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
import { TscError, renderDiagnostic } from '../src/compiler/error.js';
import { setColorEnabled } from '../src/compiler/colors.js';
import { explainError, ERROR_CATALOG } from '../src/compiler/error-catalog.js';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--no-color')) setColorEnabled(false);

const command = args[0];

if (!command) {
  console.error('Usage: tsclang <command> [options]');
  console.error('Commands: build, explain');
  process.exit(1);
}

if (command === 'explain') {
  const code = args[1];
  if (!code) {
    const codes = Object.keys(ERROR_CATALOG).join(', ');
    console.error(`tsclang explain: missing error code\nKnown codes: ${codes}`);
    process.exit(1);
  }
  const text = explainError(code);
  if (!text) {
    console.error(`tsclang explain: unknown error code '${code}'`);
    process.exit(1);
  }
  process.stdout.write(text + '\n');
  process.exit(0);
}

if (command === 'build') {
  const inputFile = args[1];
  if (!inputFile) {
    console.error('tsclang build: missing input file');
    process.exit(1);
  }

  const emitIdx   = args.indexOf('--emit');
  const emit      = emitIdx !== -1 ? args[emitIdx + 1] : 'c';
  const outIdx    = args.indexOf('--outDir');
  const outDir    = outIdx !== -1 ? args[outIdx + 1] : '.';
  const allErrors = args.includes('--all-errors');

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

  let c, warnings;
  try {
    const tokens = lex(src, filename);
    const ast    = parse(tokens, filename, src);
    ({ c, warnings } = codegen(ast, filename, src, {
      maxErrors: allErrors ? Infinity : 10,
    }));
  } catch (e) {
    const errors = e?.isTscErrorBag ? e.errors
                 : e?.isTscError    ? [e]
                 : null;
    if (errors) {
      for (const err of errors) {
        process.stderr.write(renderDiagnostic(err, { contextLines: 1 }) + '\n');
      }
      const n = errors.length;
      process.stderr.write(`aborting due to ${n} error${n > 1 ? 's' : ''}\n`);
    } else {
      process.stderr.write(`${filename}: ${e.message}\n`);
      if (process.env.TSC_DEBUG) process.stderr.write(e.stack + '\n');
      process.stderr.write('aborting due to 1 error\n');
    }
    process.exit(1);
  }

  for (const w of warnings) {
    process.stderr.write(renderDiagnostic(w, { contextLines: 1 }) + '\n');
  }
  if (warnings.length > 0) {
    const n = warnings.length;
    process.stderr.write(`${n} warning${n > 1 ? 's' : ''} emitted\n`);
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
