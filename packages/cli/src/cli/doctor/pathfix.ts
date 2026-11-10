// Windows user-PATH repair for doctor's "installed, not on PATH" findings.
// Uses the .NET setter via PowerShell — NEVER setx (it truncates values at
// 1024 chars and can corrupt a long user PATH). The change lands in the user
// registry hive; a terminal restart is required to pick it up.

import { spawnSync } from 'child_process';

export interface PathFixResult {
  ok: boolean;
  error?: string;
}

export function pathFixCommandWin(dir: string): string {
  return `[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";${dir}", "User")`;
}

type Runner = (exe: string, args: string[]) => { status: number | null; error?: Error };

function defaultRun(exe: string, args: string[]): { status: number | null; error?: Error } {
  const r = spawnSync(exe, args, { stdio: 'pipe' });
  return { status: r.status, error: r.error };
}

// Auto-fix is Windows-only: unix shells each own their rc file (bash/zsh/fish),
// so a manual `export PATH=...` hint is the honest fix there.
export function applyUserPathWin(dir: string, run: Runner = defaultRun): PathFixResult {
  const r = run('powershell.exe', ['-NoProfile', '-Command', pathFixCommandWin(dir)]);
  if (r.status === 0) return { ok: true };
  return { ok: false, error: r.error?.message ?? `powershell exited with status ${r.status}` };
}
