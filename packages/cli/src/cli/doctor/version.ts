// Version and install-source introspection for `tsclang doctor`.

import { realpathSync } from 'fs';
import { dirname } from 'path';
import { getVersion } from '../help.js';
import { fetchWithTimeout } from '@tsclang/pm';

export function localVersion(rootDir: string): string {
  return getVersion(rootDir);
}

/**
 * 'dev' when the running bin resolves outside the global npm bin directory —
 * the `npm link` setup from book 00.2.3 (realpath of argv[1] lands inside the
 * repo instead of the node install dir). Fails open to 'npm'.
 */
export function installSource(binPath: string = process.argv[1] ?? ''): 'dev' | 'npm' {
  try {
    const realBin = realpathSync(binPath);
    const globalDir = dirname(realpathSync(process.execPath));
    return realBin.startsWith(globalDir) ? 'npm' : 'dev';
  } catch {
    return 'npm';
  }
}

// Dotted numeric compare (0.10.0 > 0.9.0 — numeric, never string-wise);
// non-numeric parts count as 0 so garbage degrades instead of throwing.
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Registry /latest body → version string; anything unexpected → null.
export function parseRegistryLatest(body: unknown): string | null {
  if (typeof body === 'object' && body !== null) {
    const v = (body as Record<string, unknown>).version;
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

export function formatUpdate(local: string, latest: string | null): string {
  if (!latest) return 'check failed (offline?)';
  // local ahead of npm (pre-release installs) reads as up to date — no downgrade nags
  return compareVersions(local, latest) >= 0
    ? `up to date (npm ${latest})`
    : `update available: ${latest} (npm i -g tsclang)`;
}

// npm registry latest for tsclang; null on any failure (timeout included) —
// the report must never break because of the network. fetchImpl is DI for tests.
export async function fetchLatestNpm(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchWithTimeout('https://registry.npmjs.org/tsclang/latest', 3000, fetchImpl);
    if (!res.ok) return null;
    return parseRegistryLatest(await res.json());
  } catch {
    return null;
  }
}

export async function updateLine(
  rootDir: string,
  source: 'dev' | 'npm',
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (process.env.TSC_DOCTOR_NO_UPDATE) return 'skipped (TSC_DOCTOR_NO_UPDATE=1)';
  if (source === 'dev') return 'dev install - npm check not applicable';
  return formatUpdate(localVersion(rootDir), await fetchLatestNpm(fetchImpl));
}
