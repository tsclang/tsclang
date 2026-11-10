// Version and install-source introspection for `tsclang doctor`.

import { realpathSync } from 'fs';
import { dirname } from 'path';
import { getVersion } from '../help.js';

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

export function updateLine(rootDir: string, source: 'dev' | 'npm'): string {
  if (process.env.TSC_DOCTOR_NO_UPDATE) return 'skipped (TSC_DOCTOR_NO_UPDATE=1)';
  if (source === 'dev') return 'dev install - npm check not applicable';
  // npm registry check lands in the update step; never block the report
  return 'not checked';
}
