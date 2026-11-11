// Toolchain bundle builder (issue #278). Repackages official toolchain
// distributions into our layout — `bin/` at the archive root (or a flat
// root, which then serves as its own bin dir) — and emits the archive +
// sha256 + size for the registry catalog and GitHub Releases upload.
//
// Run from the repo root:
//   node packages/registry/scripts/build-bundles.mjs [--only <toolchain>] [--target <os-arch>]
// Cache: .tsclang-tmp/bundles/src   Output: .tsclang-tmp/bundles/out
//
// Targets are `os-arch` keys of toolchains.downloads in tsc.package.json.
// Posix bundles MUST be packed on a posix host (CI): executable bits and
// symlinks live in tar metadata, but a Windows tar cannot create them.
// Cross-arch packing is fine — binaries are never executed during packing,
// so one arm64 runner can build both darwin targets.
//
// Sources are pinned below; re-check licenses before adding new ones
// (packages/registry/README.md — "Toolchain bundles").

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
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

const EMSDK_HASH = '6afbd83493d647051772d491124187d4e9a0cda9';
const EMSDK_BASE = `https://storage.googleapis.com/webassembly/emscripten-releases-builds`;
const EMSDK_DEPS = `${EMSDK_BASE}/deps/`;

// Pinned toolchain distributions, per target. `win32-x64` bundles are built
// on Windows; every other target on a posix runner (see header comment).
const BUNDLES = [
  {
    toolchain: 'avr-gcc', version: '16.1.0',
    license: 'GPL-3.0-or-later with GCC Runtime Library Exception (Zak Kemble build: GCC + binutils + avr-libc)',
    targets: {
      'win32-x64': {
        source: 'https://github.com/ZakKemble/avr-gcc-build/releases/download/v16.1.0-1/avr-gcc-16.1.0-x64-windows.zip',
        file: 'avr-gcc-16.1.0-x64-windows.zip', // single root -> bin/ etc.
      },
      'linux-x64': {
        source: 'https://github.com/ZakKemble/avr-gcc-build/releases/download/v16.1.0-1/avr-gcc-16.1.0-x64-linux.tar.bz2',
        file: 'avr-gcc-16.1.0-x64-linux.tar.bz2',
      },
      // darwin: no upstream binaries — platform-avr CI builds avr-gcc from
      // sources (binutils + gcc + avr-libc); see that repo's workflow.
    },
  },
  {
    toolchain: 'avrdude', version: '8.3',
    license: 'BSD-3-Clause (avrdude)',
    targets: {
      'win32-x64': {
        source: 'https://github.com/avrdudes/avrdude/releases/download/v8.3/avrdude-v8.3-windows-x64.zip',
        file: 'avrdude-v8.3-windows-x64.zip', // flat: avrdude.exe at the archive root
      },
      'linux-x64': {
        source: 'https://github.com/avrdudes/avrdude/releases/download/v8.3/avrdude_v8.3_Linux_64bit.tar.gz',
        file: 'avrdude-8.3-linux64.tar.gz', // single root -> bin/ + etc/
      },
      'darwin-x64': {
        source: 'https://github.com/avrdudes/avrdude/releases/download/v8.3/avrdude_v8.3_macOS_64bit.tar.gz',
        file: 'avrdude-8.3-macos64.tar.gz', // single root -> bin/ + etc/
      },
      // darwin-arm64: no upstream binary — platform-avr CI builds avrdude
      // from the v8.3 source tarball; see that repo's workflow.
    },
  },
  {
    toolchain: 'gcc', version: '16.2.0',
    license: 'GPL-3.0-or-later with exceptions (win32: WinLibs GCC, binutils, mingw-w64, LLVM); Apache-2.0 WITH LLVM-exception (posix: LLVM/Clang)',
    // posix desktop bundles ship LLVM/Clang (upstream publishes portable,
    // statically linked builds) with gcc/g++/cc symlinked to clang so the
    // bundle keeps serving the `gcc` toolchain name on every platform.
    // darwin-x64 has no upstream LLVM build — documented fallback there is
    // the system clang from Xcode Command Line Tools.
    postInstall: bundleGcc,
    targets: {
      'win32-x64': {
        source: 'https://github.com/brechtsanders/winlibs_mingw/releases/download/16.2.0posix-23.1.3-14.0.0-ucrt-r3/winlibs-x86_64-posix-seh-gcc-16.2.0-llvm-23.1.3-mingw-w64ucrt-14.0.0-r3.zip',
        file: 'winlibs-16.2.0-ucrt-r3.zip', // single root (mingw64/) -> bin/ etc.
      },
      'linux-x64': {
        source: 'https://github.com/llvm/llvm-project/releases/download/llvmorg-23.1.5/LLVM-23.1.5-Linux-X64.tar.xz',
        file: 'llvm-23.1.5-linux-x64.tar.xz', archiveExt: 'xz', // flat: bin/ at the top
      },
      'darwin-arm64': {
        source: 'https://github.com/llvm/llvm-project/releases/download/llvmorg-23.1.5/LLVM-23.1.5-macOS-ARM64.tar.xz',
        file: 'llvm-23.1.5-macos-arm64.tar.xz', archiveExt: 'xz',
      },
    },
  },
  {
    toolchain: 'emcc', version: '7.0.0',
    license: 'MIT / UIUC (Emscripten: emscripten, LLVM, Binaryen) + PSF (Python) + Node.js',
    postInstall: bundleEmcc,
    // wasm-binaries alone is NOT self-contained: emcc needs python and the
    // config requires NODE_JS — emsdk ships both as separate deps packages;
    // we fold them in (linux deps have no python: system python3 required,
    // same as upstream emsdk). See postInstall below.
    targets: {
      'win32-x64': {
        source: `${EMSDK_BASE}/win/${EMSDK_HASH}/wasm-binaries.zip`,
        file: 'emcc-7.0.0-win-src.zip', // single root (install/) -> bin/ emscripten/ lib/
        deps: [
          { url: `${EMSDK_DEPS}python-3.13.3-0-win-amd64.zip`, file: 'emsdk-python-3.13.3-win.zip', into: 'bin' },
          { url: `${EMSDK_DEPS}node-v22.16.0-win-x64.zip`, file: 'emsdk-node-22.16.0-win-x64.zip', into: 'bin', fromSub: 'bin' },
        ],
      },
      'linux-x64': {
        source: `${EMSDK_BASE}/linux/${EMSDK_HASH}/wasm-binaries.tar.xz`,
        file: 'emcc-7.0.0-linux-src.tar.xz',
        deps: [
          { url: `${EMSDK_DEPS}node-v22.16.0-linux-x64.tar.xz`, file: 'emsdk-node-22.16.0-linux-x64.tar.xz', into: 'bin', fromSub: 'bin' },
        ],
      },
      'darwin-x64': {
        source: `${EMSDK_BASE}/mac/${EMSDK_HASH}/wasm-binaries.tar.xz`,
        file: 'emcc-7.0.0-macos-src.tar.xz',
        deps: [
          { url: `${EMSDK_DEPS}python-3.13.3-0-macos-x86_64.tar.gz`, file: 'emsdk-python-3.13.3-macos-x86_64.tar.gz', into: 'python' },
          { url: `${EMSDK_DEPS}node-v22.16.0-darwin-x64.tar.gz`, file: 'emsdk-node-22.16.0-darwin-x64.tar.gz', into: 'bin', fromSub: 'bin' },
        ],
      },
      'darwin-arm64': {
        source: `${EMSDK_BASE}/mac/${EMSDK_HASH}/wasm-binaries-arm64.tar.xz`,
        file: 'emcc-7.0.0-macos-arm64-src.tar.xz',
        deps: [
          { url: `${EMSDK_DEPS}python-3.13.3-0-macos-arm64.tar.gz`, file: 'emsdk-python-3.13.3-macos-arm64.tar.gz', into: 'python' },
          { url: `${EMSDK_DEPS}node-v22.16.0-darwin-arm64.tar.gz`, file: 'emsdk-node-22.16.0-darwin-arm64.tar.gz', into: 'bin', fromSub: 'bin' },
        ],
      },
    },
  },
];

// Posix desktop bundles alias gcc/g++/cc to clang so the toolchain keeps the
// `gcc` name on every platform (the resolver looks for `gcc` in bin/).
function bundleGcc(contentRoot, target) {
  if (target === 'win32-x64') return; // WinLibs ships a real gcc
  const binDir = join(contentRoot, 'bin');
  for (const [alias, real] of [['cc', 'clang'], ['gcc', 'clang'], ['g++', 'clang++']]) {
    const link = join(binDir, alias);
    if (existsSync(link)) continue;
    try {
      symlinkSync(real, link); // relative symlink stays valid in the archive
    } catch {
      copyFileSync(join(binDir, real), link); // windows smoke-run fallback
    }
  }
}

// Make the emcc bundle consumable by findIsolatedToolchain (binDir=<root>/bin):
//  - relocatable .emscripten config (config.py exec's it with __file__ set,
//    so paths are computed relative to the install location)
//  - win32: bin/emcc.exe + bin/emcc.py shim — pylauncher requires <name>.py
//    next to the exe, but the real emcc.py imports `tools.*` relative to its
//    own directory — a copy would break; a runpy stub keeps it intact.
//  - posix: bin/emcc wrapper preferring the bundled python (macOS; linux
//    bundles have none and use the system python3, like upstream emsdk).
function bundleEmcc(contentRoot, target) {
  const esmDir = join(contentRoot, 'emscripten');
  const binDir = join(contentRoot, 'bin');
  const nodeBin = target === 'win32-x64' ? 'node.exe' : 'node';
  const config = [
    '# TSClang bundle config — relocatable (paths computed from this file).',
    'import os',
    "_here = os.path.dirname(os.path.abspath(__file__))",
    "_root = os.path.normpath(os.path.join(_here, '..'))",
    "LLVM_ROOT = os.path.join(_root, 'bin')",
    'BINARYEN_ROOT = _root',
    `NODE_JS = os.path.join(_root, 'bin', '${nodeBin}')`,
    "CACHE = os.path.join(_here, 'cache')",
    '',
  ].join('\n');
  writeFileSync(join(esmDir, '.emscripten'), config, 'utf8');

  if (target === 'win32-x64') {
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
    return;
  }

  const wrapper = [
    '#!/bin/sh',
    '# TSClang bundle wrapper for emcc (posix). Mirrors the upstream launcher',
    '# (python3 -E, EMSDK_PYTHON override) but prefers the bundled python on',
    '# macOS; linux bundles rely on the system python3, same as upstream emsdk.',
    'unset _PYTHON_SYSCONFIGDATA_NAME',
    'DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    'if [ -n "$EMSDK_PYTHON" ]; then',
    '  PY="$EMSDK_PYTHON"',
    'elif [ -x "$DIR/../python/bin/python3" ]; then',
    '  PY="$DIR/../python/bin/python3"',
    'else',
    '  PY=$(command -v python3 || command -v python)',
    'fi',
    'exec "$PY" -E "$DIR/../emscripten/emcc.py" "$@"',
    '',
  ].join('\n');
  writeFileSync(join(binDir, 'emcc'), wrapper, 'utf8');
  const chmod = spawnSync('chmod', ['+x', join(binDir, 'emcc')]);
  if (chmod.status !== 0) {
    throw new Error('chmod +x bin/emcc failed (posix bundles must be built on a posix host)');
  }
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

// A single top-level folder in an extracted archive is a wrapper created by
// the packager (install/, mingw64/, avr-gcc-…/) — unwrap it. Flat extracts
// (LLVM tarballs, the win avrdude zip) keep their own layout.
function unwrapSingleRoot(dir) {
  const top = readdirSync(dir);
  if (top.length === 1 && statSync(join(dir, top[0])).isDirectory()) {
    return join(dir, top[0]);
  }
  return dir;
}

function buildOne(bundle, target, spec) {
  const work = join(SRC, `stage-${bundle.toolchain}-${target}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  run(tarBinary(), ['-xf', join(SRC, spec.file)], { cwd: work });
  const contentRoot = unwrapSingleRoot(work);

  // Fold extra dependency distributions into the tree (e.g. python + node
  // for the emcc bundle).
  for (const dep of spec.deps ?? []) {
    const depWork = join(work, `dep-${dep.file.replace(/\W+/g, '_')}`);
    mkdirSync(depWork, { recursive: true });
    run(tarBinary(), ['-xf', join(SRC, dep.file)], { cwd: depWork });
    let src = unwrapSingleRoot(depWork);
    if (dep.fromSub) src = join(src, dep.fromSub);
    mkdirSync(join(contentRoot, dep.into), { recursive: true });
    for (const entry of readdirSync(src)) {
      cpSync(join(src, entry), join(contentRoot, dep.into, entry), { recursive: true });
    }
  }
  if (bundle.postInstall) bundle.postInstall(contentRoot, target);

  const notice = [
    `TSClang toolchain bundle: ${bundle.toolchain} ${bundle.version} (${target})`,
    `Source: ${spec.source}`,
    `License: ${bundle.license}`,
    `Built: ${new Date().toISOString()} by packages/registry/scripts/build-bundles.mjs`,
    'Redistributed unmodified except for the top-level layout of this archive.',
    ...(bundle.toolchain === 'gcc' && target !== 'win32-x64'
      ? ['Posix bundles ship LLVM/Clang; gcc/g++/cc are symlinks to clang/clang++.'] : []),
    ...(bundle.toolchain === 'emcc' && target === 'linux-x64'
      ? ['Requires python3 in PATH (same as upstream emsdk on linux).'] : []),
  ].join('\n') + '\n';
  writeFileSync(join(contentRoot, 'TSC_BUNDLE_NOTICE.txt'), notice, 'utf8');

  const archiveExt = spec.archiveExt ?? 'gz';
  const outName = `${bundle.toolchain}-${bundle.version}-${target}.tar.${archiveExt}`;
  const outPath = join(OUT, outName);
  mkdirSync(OUT, { recursive: true });
  run(tarBinary(), [`-c${archiveExt === 'xz' ? 'J' : 'z'}f`, outPath, '.'], { cwd: contentRoot });

  const sha256 = createHash('sha256').update(readFileSync(outPath)).digest('hex');
  const sizeMB = Math.round(statSync(outPath).size / 1_000_000);
  process.stdout.write(`${outName}: ${sizeMB} MB\n  sha256: ${sha256}\n`);
  // The staging copy doubles the disk footprint; drop it right after packing.
  rmSync(work, { recursive: true, force: true });
  return { outName, sha256, sizeMB };
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const targetFilter = process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : null;
if (targetFilter && !BUNDLES.some((b) => b.targets[targetFilter])) {
  throw new Error(`unknown --target ${targetFilter}`);
}
const results = {};
for (const bundle of BUNDLES) {
  if (only && bundle.toolchain !== only) continue;
  for (const [target, spec] of Object.entries(bundle.targets)) {
    if (targetFilter && target !== targetFilter) continue;
    await fetchSource(spec.source, spec.file);
    for (const dep of spec.deps ?? []) await fetchSource(dep.url, dep.file);
    results[`${bundle.toolchain}/${target}`] = buildOne(bundle, target, spec);
  }
}
process.stdout.write('\nCatalog entries (packages/platforms/*/tsc.package.json -> toolchains.downloads):\n');
for (const [name, r] of Object.entries(results)) {
  process.stdout.write(`  ${name}: url .../releases/download/toolchains-v1/${r.outName}\n    sha256: ${r.sha256}\n    size: ${r.sizeMB}\n`);
}
