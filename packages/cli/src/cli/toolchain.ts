// Toolchain probing shared by the build pre-checks (#241) and `tsclang doctor`.
// The load-bearing detail: spawnSync leaves `status: null` and sets `.error`
// when the binary is missing — both must count as "not available".

import { spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export function toolAvailable(name: string): boolean {
  const r = spawnSync(name, ['--version'], { stdio: 'pipe' });
  return r.status === 0 && !r.error;
}

// Places where toolchains live when installed but NOT on PATH — the doctor's
// "installed, not reachable" state. Windows-first: MSYS2 default install
// roots, plain MinGW, emsdk (CONTEXT.md: emsdk lives at C:\emsdk on this
// machine). Unix: the usual distro/homebrew suspects.
export function defaultToolCandidates(name: string): string[] {
  if (process.platform === 'win32') {
    const exe = name.endsWith('.exe') ? name : `${name}.exe`;
    return [
      join('C:', 'msys64', 'mingw64', 'bin', exe),
      join('C:', 'msys64', 'usr', 'bin', exe),
      join('C:', 'MinGW', 'bin', exe),
      join('C:', 'emsdk', exe),
      join('C:', 'emsdk', 'upstream', 'emscripten', exe),
    ];
  }
  return [
    join('/usr', 'bin', name),
    join('/usr', 'local', 'bin', name),
    join('/opt', 'homebrew', 'bin', name),
  ];
}

export interface ToolLocation {
  inPath: boolean;
  // Absolute path when the tool was found outside PATH, null otherwise
  foundAt: string | null;
}

/**
 * Locate a toolchain tool: either runnable from PATH, or present in one of the
 * well-known install locations. probe/exists are injectable for unit tests
 * (machine-independent coverage of the three outcome states).
 */
export function findTool(
  name: string,
  opts: { candidates?: string[]; exists?: (p: string) => boolean; probe?: (n: string) => boolean } = {},
): ToolLocation {
  const inPath = opts.probe ? opts.probe(name) : toolAvailable(name);
  if (inPath) return { inPath: true, foundAt: null };
  const exists = opts.exists ?? existsSync;
  const candidates = opts.candidates ?? defaultToolCandidates(name);
  const foundAt = candidates.find((p) => exists(p)) ?? null;
  return { inPath: false, foundAt };
}

// --- MSVC detection (doctor) ---
// Pattern adopted from test-engine's findMsVC() (packages/test-engine/src/compilers/utils.ts):
// vswhere reports the latest VS installation; cl.exe lives under its MSVC toolset dir
// and is almost never on PATH (needs INCLUDE/LIB from vcvarsall — PATH alone is not enough).

export interface MsvcLocation {
  inPath: boolean;
  vsRoot: string | null;
  clPath: string | null;
}

function defaultVswhere(): string | null {
  for (const root of [process.env['ProgramFiles(x86)'], process.env['ProgramFiles']]) {
    if (!root) continue;
    const p = join(root, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
    if (existsSync(p)) return p;
  }
  return null;
}

export function msvcDetect(
  opts: {
    platform?: NodeJS.Platform;
    probe?: (n: string) => boolean;
    runVswhere?: () => string | null;
    readdir?: (dir: string) => string[];
    exists?: (p: string) => boolean;
  } = {},
): MsvcLocation {
  const platform = opts.platform ?? process.platform;
  if (platform !== 'win32') return { inPath: false, vsRoot: null, clPath: null };
  const probe = opts.probe ?? toolAvailable;
  if (probe('cl')) return { inPath: true, vsRoot: null, clPath: null };

  const runVswhere = opts.runVswhere ?? ((): string | null => {
    const exe = defaultVswhere();
    if (!exe) return null;
    const r = spawnSync(exe, ['-latest', '-property', 'installationPath'], { stdio: 'pipe' });
    return r.status === 0 && r.stdout ? r.stdout.toString().trim() : null;
  });
  const vsRoot = runVswhere();
  if (!vsRoot) return { inPath: false, vsRoot: null, clPath: null };

  const readdir = opts.readdir ?? readdirSync;
  const exists = opts.exists ?? existsSync;
  const msvcDir = join(vsRoot, 'VC', 'Tools', 'MSVC');
  let versions: string[] = [];
  try { versions = readdir(msvcDir); } catch {
    return { inPath: false, vsRoot, clPath: null };
  }
  versions.sort();
  for (let i = versions.length - 1; i >= 0; i--) {
    // highest installed toolset first
    const cl = join(msvcDir, versions[i], 'bin', 'Hostx64', 'x64', 'cl.exe');
    if (exists(cl)) return { inPath: false, vsRoot, clPath: cl };
  }
  return { inPath: false, vsRoot, clPath: null };
}
