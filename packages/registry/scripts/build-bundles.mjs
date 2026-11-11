// Toolchain bundle builder (issue #278). Repackages official toolchain
// distributions into our layout — `bin/` at the archive root (or a flat
// root, which then serves as its own bin dir) — and emits .tar.gz + sha256
// + size for the registry catalog and GitHub Releases upload.
//
// Run from the repo root:
//   node packages/registry/scripts/build-bundles.mjs [--only <toolchain>]
// Cache: .tsclang-tmp/bundles/src   Output: .tsclang-tmp/bundles/out
//
// Sources are pinned below; re-check licenses before adding new ones
// (packages/registry/README.md — "Toolchain bundles").

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, '.tsclang-tmp', 'bundles', 'src');
const OUT = join(ROOT, '.tsclang-tmp', 'bundles', 'out');

// GNU tar (git-bash, msys) cannot read .zip archives — bsdtar ships with
// Windows 10+ at System32\tar.exe. Outside win32 the system tar is fine.
function tarBinary() {
  if (process.platform !== 'win32') return 'tar';
  const system32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  return existsSync(system32) ? system32 : 'tar';
}

const EMSDK_DEPS = 'https://storage.googleapis.com/webassembly/emscripten-releases-builds/deps/';

const BUNDLES = [
  {
    toolchain: 'avr-gcc', version: '16.1.0',
    source: 'https://github.com/ZakKemble/avr-gcc-build/releases/download/v16.1.0-1/avr-gcc-16.1.0-x64-windows.zip',
    file: 'avr-gcc-16.1.0-x64-windows.zip',
    stripRoot: true, // avr-gcc-16.1.0-x64-windows/bin/... -> bin/...
    license: 'GPL-3.0-or-later with GCC Runtime Library Exception (Zak Kemble build; GCC + binutils + avr-libc)',
  },
  {
    toolchain: 'avrdude', version: '8.3',
    source: 'https://github.com/avrdudes/avrdude/releases/download/v8.3/avrdude-v8.3-windows-x64.zip',
    file: 'avrdude-v8.3-windows-x64.zip',
    stripRoot: false, // flat: avrdude.exe at the archive root
    license: 'BSD-3-Clause (avrdude)',
  },
  {
    toolchain: 'gcc', version: '16.2.0',
    source: 'https://github.com/brechtsanders/winlibs_mingw/releases/download/16.2.0posix-23.1.3-14.0.0-ucrt-r3/winlibs-x86_64-posix-seh-gcc-16.2.0-llvm-23.1.3-mingw-w64ucrt-14.0.0-r3.zip',
    file: 'winlibs-16.2.0-ucrt-r3.zip',
    stripRoot: true, // mingw64/bin/... -> bin/...
    license: 'GPL-3.0-or-later with exceptions (WinLibs: GCC, binutils, mingw-w64, LLVM)',
  },
  {
    toolchain: 'emcc', version: '7.0.0',
    source: 'https://storage.googleapis.com/webassembly/emscripten-releases-builds/win/6afbd83493d647051772d491124187d4e9a0cda9/wasm-binaries.zip',
    file: 'emscripten-7.0.0-win-x64.zip',
    stripRoot: true, // install/bin, install/emscripten, install/lib -> bin/, emscripten/, lib/
    license: 'MIT / UIUC (Emscripten: emscripten, LLVM, Binaryen) + PSF (Python) + Node.js',
    // wasm-binaries alone is NOT self-contained: emcc's pylauncher exe needs
    // python on PATH and the config requires NODE_JS — emsdk ships both as
    // separate deps packages; we fold them in. See postInstall below.
    deps: [
      { url: EMSDK_DEPS + 'python-3.13.3-0-win-amd64.zip', file: 'emsdk-python-3.13.3.zip', into: 'bin' },
      { url: EMSDK_DEPS + 'node-v22.16.0-win-x64.zip', file: 'emsdk-node-22.16.0.zip', into: 'bin', fromSub: 'bin' },
    ],
    postInstall: bundleEmcc,
  },
];

// Make the emcc bundle consumable by findIsolatedToolchain (binDir=<root>/bin):
//  - relocatable .emscripten config (config.py exec's it with __file__ set,
//    so paths are computed relative to the install location)
//  - bin/emcc.exe + bin/emcc.py shim: pylauncher requires <name>.py next to
//    the exe, but the real emcc.py imports `tools.*` relative to its own
//    directory — a copy would break; a runpy stub keeps it intact.
function bundleEmcc(contentRoot) {
  const esmDir = join(contentRoot, 'emscripten');
  const binDir = join(contentRoot, 'bin');
  const config = [
    '# TSClang bundle config — relocatable (paths computed from this file).',
    'import os',
    "_here = os.path.dirname(os.path.abspath(__file__))",
    "_root = os.path.normpath(os.path.join(_here, '..'))",
    "LLVM_ROOT = os.path.join(_root, 'bin')",
    'BINARYEN_ROOT = _root',
    "NODE_JS = os.path.join(_root, 'bin', 'node.exe')",
    "CACHE = os.path.join(_here, 'cache')",
    '',
  ].join('\n');
  writeFileSync(join(esmDir, '.emscripten'), config, 'utf8');

  copyFileSync(join(esmDir, 'emcc.exe'), join(binDir, 'emcc.exe'));
  const shim = [
    '# TSClang bundle shim: pylauncher requires <name>.py next to the exe;',
    '# the real emcc.py lives in ../emscripten and imports `tools.*` relative',
    '# to that directory, so it cannot simply be copied here.',
    'import os, sys, runpy',
    "_real = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), \"..\", \"emscripten\"))",
    'sys.path.insert(0, _real)',
    'runpy.run_path(os.path.join(_real, "emcc.py"), run_name="__main__")',
    '',
  ].join('\n');
  writeFileSync(join(binDir, 'emcc.py'), shim, 'utf8');
}

async function fetchSource(url, file) {
  const path = join(SRC, file);
  if (existsSync(path) && statSync(path).size > 10_000) return path;
  mkdirSync(SRC, { recursive: true });
  process.stdout.write(`downloading ${url} ...\n`);
  const res = await fetch(url, { signal: AbortSignal.timeout(20 * 60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  // GCS answers missing keys with a small XML body instead of an HTTP error
  // status — catch it here rather than unpacking garbage later.
  if (bytes.length < 10_000 && bytes.subarray(0, 5).toString() === '<?xml') {
    throw new Error(`error body fetched from ${url}: ${bytes.subarray(0, 120).toString()}`);
  }
  writeFileSync(path, bytes);
  return path;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'pipe', windowsHide: true, ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${(r.stderr ?? '').toString().trim() || `exit ${r.status}`}`);
  }
  return r;
}

function findSingleRoot(dir) {
  const entries = readdirSync(dir);
  if (entries.length !== 1) {
    throw new Error(`expected a single root folder inside the source archive, got: ${entries.join(', ')}`);
  }
  return join(dir, entries[0]);
}

function buildOne(bundle) {
  const work = join(SRC, `stage-${bundle.toolchain}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  run(tarBinary(), ['-xf', join(SRC, bundle.file)], { cwd: work });
  const contentRoot = bundle.stripRoot ? findSingleRoot(work) : work;

  // Fold extra dependency distributions into the tree (e.g. python + node
  // for the emcc bundle).
  for (const dep of bundle.deps ?? []) {
    const depWork = join(work, `dep-${dep.file.replace(/\W+/g, '_')}`);
    mkdirSync(depWork, { recursive: true });
    run(tarBinary(), ['-xf', join(SRC, dep.file)], { cwd: depWork });
    // Unwrap a single root folder (some deps zip their tree into one), then
    // apply the optional fromSub pick.
    let src = depWork;
    const top = readdirSync(depWork);
    if (top.length === 1 && statSync(join(depWork, top[0])).isDirectory()) src = join(depWork, top[0]);
    if (dep.fromSub) src = join(src, dep.fromSub);
    mkdirSync(join(contentRoot, dep.into), { recursive: true });
    for (const entry of readdirSync(src)) {
      cpSync(join(src, entry), join(contentRoot, dep.into, entry), { recursive: true });
    }
  }
  if (bundle.postInstall) bundle.postInstall(contentRoot);

  const notice = [
    `TSClang toolchain bundle: ${bundle.toolchain} ${bundle.version} (win32-x64)`,
    `Source: ${bundle.source}`,
    `License: ${bundle.license}`,
    `Built: ${new Date().toISOString()} by packages/registry/scripts/build-bundles.mjs`,
    'Redistributed unmodified except for the top-level layout of this archive.',
  ].join('\n') + '\n';
  writeFileSync(join(contentRoot, 'TSC_BUNDLE_NOTICE.txt'), notice, 'utf8');

  const outName = `${bundle.toolchain}-${bundle.version}-win32-x64.tar.gz`;
  const outPath = join(OUT, outName);
  mkdirSync(OUT, { recursive: true });
  run(tarBinary(), ['-czf', outPath, '.'], { cwd: contentRoot });

  const sha256 = createHash('sha256').update(readFileSync(outPath)).digest('hex');
  const sizeMB = Math.round(statSync(outPath).size / 1_000_000);
  process.stdout.write(`${outName}: ${sizeMB} MB\n  sha256: ${sha256}\n`);
  // The staging copy doubles the disk footprint; drop it right after packing.
  rmSync(work, { recursive: true, force: true });
  return { outName, sha256, sizeMB };
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const results = {};
for (const bundle of BUNDLES) {
  if (only && bundle.toolchain !== only) continue;
  await fetchSource(bundle.source, bundle.file);
  for (const dep of bundle.deps ?? []) await fetchSource(dep.url, dep.file);
  results[bundle.toolchain] = buildOne(bundle);
}
process.stdout.write('\nCatalog entries (packages/platforms/*/tsc.package.json -> toolchains.downloads):\n');
for (const [name, r] of Object.entries(results)) {
  process.stdout.write(`  ${name}: url .../releases/download/toolchains-v1/${r.outName}\n    sha256: ${r.sha256}\n    size: ${r.sizeMB}\n`);
}
