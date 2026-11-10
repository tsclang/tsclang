// Toolchain probing shared by the build pre-checks (#241) and `tsclang doctor`.
// The load-bearing detail: spawnSync leaves `status: null` and sets `.error`
// when the binary is missing — both must count as "not available".

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
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
