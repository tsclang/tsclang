#!/usr/bin/env node
// TSClang CLI entry point

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename, extname, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

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
  console.error('Commands: build, run, init, validate-config, explain');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// explain command
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// validate-config command
// ---------------------------------------------------------------------------
if (command === 'validate-config') {
  const jsonFile = args[1];
  if (!jsonFile) {
    console.error('tsclang validate-config: missing config file');
    process.exit(1);
  }

  let raw;
  try {
    raw = readFileSync(resolve(jsonFile), 'utf8');
  } catch (e) {
    process.stderr.write(`tsclang: cannot read '${jsonFile}': ${e.message}\n`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`ConfigError: tsc.package.json: invalid JSON: ${e.message}\n`);
    process.exit(1);
  }

  const cfgErr = (msg) => {
    process.stderr.write(`ConfigError: tsc.package.json: ${msg}\n`);
    process.exit(1);
  };

  if (!config.name) cfgErr(`missing required field 'name'`);
  if (!config.version) cfgErr(`missing required field 'version'`);

  // Simple semver check: must start with N.N.N
  if (!/^\d+\.\d+\.\d+/.test(String(config.version))) {
    cfgErr(`'version' must be a valid semver string, got '${config.version}'`);
  }

  const type = config.type || 'executable';

  if (type === 'library' && config.main) {
    cfgErr(`library projects must not have a 'main' entry point`);
  }
  if (type === 'executable' && !config.main) {
    cfgErr(`executable project requires 'main' field`);
  }

  // Validate builds entries
  if (config.builds) {
    const validBuildKeys = new Set([
      'target', 'mcu', 'toolchain', 'toolchainFile', 'arch',
      'emit', 'linkerScript', 'frequency', 'allocator', 'debug',
    ]);
    for (const [buildName, buildCfg] of Object.entries(config.builds)) {
      if (buildCfg && typeof buildCfg === 'object') {
        for (const key of Object.keys(buildCfg)) {
          if (!validBuildKeys.has(key)) {
            cfgErr(`unknown key '${key}' in builds.${buildName}`);
          }
        }
      }
    }
  }

  // Library projects: run is not available
  if (type === 'library') {
    process.stderr.write(`ConfigError: 'tsclang run' is not available for library projects\n`);
    process.exit(1);
  }

  // Valid executable: print notable fields
  if (config.builds) {
    process.stdout.write(`builds: ${Object.keys(config.builds).join(', ')}\n`);
  }
  if (config.dependencies) {
    const deps = Object.entries(config.dependencies).map(([n, v]) => `${n}@${v}`);
    process.stdout.write(`dependencies: ${deps.join(', ')}\n`);
  }
  if (config.targets) {
    process.stdout.write(`targets: ${config.targets.join(', ')}\n`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------
if (command === 'init') {
  const nameIdx = args.indexOf('--name');
  const name    = nameIdx !== -1 ? args[nameIdx + 1] : 'myapp';
  const typeIdx = args.indexOf('--type');
  const type    = typeIdx !== -1 ? args[typeIdx + 1] : 'executable';

  // Key order matters: the last key has no trailing comma (for grep-based tests)
  // executable: version, type, main, name (name last)
  // library: version, name, type (type last)
  let pkg;
  if (type === 'executable') {
    pkg = { version: '0.1.0', type, main: 'src/main.tsc', name };
  } else {
    pkg = { version: '0.1.0', name, type };
  }

  writeFileSync('tsc.package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  if (type === 'executable') {
    mkdirSync('src', { recursive: true });
    if (!existsSync('src/main.tsc')) {
      writeFileSync('src/main.tsc', 'console.log("Hello, World!");\n', 'utf8');
    }
  }

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Shared: compile TSC → C string
// ---------------------------------------------------------------------------
function compileTsc(inputPath, opts = {}) {
  const src = readFileSync(inputPath, 'utf8');
  const filename = basename(inputPath);
  const tokens = lex(src, filename);
  const ast    = parse(tokens, filename, src);
  return codegen(ast, filename, src, opts);
}

function reportErrors(e, filename) {
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
}

// ---------------------------------------------------------------------------
// build command
// ---------------------------------------------------------------------------
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
  const allErrors  = args.includes('--all-errors');
  const debugLines = args.includes('--debug');

  // Validate emit mode before reading input
  if (emit === 'hex') {
    process.stderr.write(
      `ConfigError: --emit hex requires an embedded target (avr); desktop target does not support hex output\n`
    );
    process.exit(1);
  }

  const inputPath = resolve(inputFile);
  let c, warnings;
  try {
    ({ c, warnings } = compileTsc(inputPath, { maxErrors: allErrors ? Infinity : 10, debugLines }));
  } catch (e) {
    reportErrors(e, basename(inputPath));
    process.exit(1);
  }

  for (const w of warnings) {
    process.stderr.write(renderDiagnostic(w, { contextLines: 1 }) + '\n');
  }
  if (warnings.length > 0) {
    const n = warnings.length;
    process.stderr.write(`${n} warning${n > 1 ? 's' : ''} emitted\n`);
  }

  const stem = basename(inputPath, extname(inputPath));
  mkdirSync(outDir, { recursive: true });

  const cPath = join(outDir, stem + '.c');
  writeFileSync(cPath, c, 'utf8');

  if (emit === 'c') {
    // Write CMakeLists.txt stub for project-mode builds
    const cmakePath = join(outDir, 'CMakeLists.txt');
    if (!existsSync(cmakePath)) {
      const runtimeH = join(ROOT, 'src/runtime/runtime.h');
      const cmakeContent = [
        'cmake_minimum_required(VERSION 3.10)',
        `project(${stem} C)`,
        'set(CMAKE_C_STANDARD 99)',
        `add_executable(${stem} ${stem}.c)`,
        `target_include_directories(${stem} PRIVATE ${JSON.stringify(dirname(runtimeH))})`,
        '',
      ].join('\n');
      writeFileSync(cmakePath, cmakeContent, 'utf8');
    }
  }

  if (emit === 'binary') {
    const runtimeH = join(ROOT, 'src/runtime/runtime.h');
    const binPath = join(outDir, stem);
    const gcc = spawnSync('gcc', [
      cPath, '-o', binPath,
      '-I', dirname(runtimeH),
      '-lpthread', '-std=c99',
    ], { stdio: 'pipe' });
    if (gcc.status !== 0) {
      process.stderr.write(`tsclang: gcc failed:\n${gcc.stderr?.toString() || ''}\n`);
      process.exit(1);
    }
  }

} else if (command === 'run') {
// ---------------------------------------------------------------------------
// run command
// ---------------------------------------------------------------------------
  const inputFile = args[1];
  if (!inputFile) {
    console.error('tsclang run: missing input file');
    process.exit(1);
  }

  // Check for -- separator (args to pass to program)
  const sepIdx = args.indexOf('--');
  const progArgs = sepIdx !== -1 ? args.slice(sepIdx + 1) : [];

  const inputPath = resolve(inputFile);
  let c, warnings;
  try {
    ({ c, warnings } = compileTsc(inputPath));
  } catch (e) {
    reportErrors(e, basename(inputPath));
    process.exit(1);
  }

  // Write C to temp file and compile+run
  const stem    = basename(inputPath, extname(inputPath));
  const tmpDir  = join(ROOT, '.tsclang-tmp');
  mkdirSync(tmpDir, { recursive: true });
  const cPath   = join(tmpDir, stem + '.c');
  const binPath = join(tmpDir, stem);
  writeFileSync(cPath, c, 'utf8');

  const runtimeH = join(ROOT, 'src/runtime/runtime.h');
  const gcc = spawnSync('gcc', [
    cPath, '-o', binPath,
    '-I', dirname(runtimeH),
    '-lpthread', '-std=c99',
  ], { stdio: 'pipe' });
  if (gcc.status !== 0) {
    process.stderr.write(`tsclang: gcc failed:\n${gcc.stderr?.toString() || ''}\n`);
    process.exit(1);
  }

  const run = spawnSync(binPath, progArgs, { stdio: 'inherit' });
  process.exit(run.status ?? 0);

} else {
  console.error(`tsclang: unknown command '${command}'`);
  process.exit(1);
}
