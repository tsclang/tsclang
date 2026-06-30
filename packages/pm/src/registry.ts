import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { semverParse, semverCmp, semverSatisfies } from './semver.js';

// MOCK: not yet implemented — mock package registry for dependency resolution tests

export interface RegistryEntry {
  versions: string[];
  description: string;
}

export const MOCK_REGISTRY: Record<string, RegistryEntry> = {
  lib:          { versions: ['1.0.0', '1.0.5', '1.2.3', '2.0.0'], description: 'Core utility library' },
  pkgA:         { versions: ['1.0.0', '1.1.0'],                    description: 'Package A with shared deps' },
  pkgB:         { versions: ['2.0.0'],                             description: 'Package B' },
  'shared-dep': { versions: ['1.0.0', '2.0.0'],                   description: 'Shared dependency' },
  mylib:        { versions: ['1.0.0'],                             description: 'Sample math library' },
};

// MOCK: not yet implemented — transitive deps: "pkg@version" → { dep: range }
export const MOCK_PKG_DEPS: Record<string, Record<string, string>> = {
  'pkgA@1.0.0': { 'shared-dep': '^1.0.0' },
  'pkgA@1.1.0': { 'shared-dep': '^1.0.0' },
  'pkgB@2.0.0': { 'shared-dep': '^2.0.0' },
};

export function resolveRange(pkg: string, range: string): string | null {
  const entry = MOCK_REGISTRY[pkg];
  const versions = entry?.versions ?? null;
  if (!versions) return range.replace(/^[^\d]*/, '');
  const satisfying = versions.filter((v: string) => semverSatisfies(v, range));
  if (satisfying.length === 0) return null;
  return satisfying.sort((a: string, b: string) => semverCmp(semverParse(a), semverParse(b))).pop()!;
}

export interface LockPackage {
  version: string;
  source?: string;
}

export interface LockFile {
  version: number;
  packages: Record<string, LockPackage>;
}

const LOCK_FILE = 'tsc.package.lock';

export function readLock(): LockFile {
  if (!existsSync(LOCK_FILE)) return { version: 1, packages: {} };
  try {
    const data = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
    if (!data.packages || typeof data.packages !== 'object') data.packages = {};
    return data as LockFile;
  } catch {
    return { version: 1, packages: {} };
  }
}

export function writeLock(lock: LockFile): void {
  writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2) + '\n', 'utf8');
}

export interface Manifest {
  name?: string;
  version?: string;
  type?: string;
  main?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  builds?: Record<string, Record<string, unknown>>;
  strict?: string[];
  targets?: string[];
}

export function readManifest(): Manifest | null {
  const p = join(process.cwd(), 'tsc.package.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

export interface LockStaleResult {
  added: string[];
  removed: string[];
  changed: string[];
}

export function checkLockStale(): LockStaleResult | null {
  const manifest = readManifest();
  if (!manifest) return null;
  const lock = readLock();
  const deps: Record<string, string> = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  };
  const lockPkgs = lock.packages || {};
  const added: string[] = [], removed: string[] = [], changed: string[] = [];
  for (const [name, version] of Object.entries(deps)) {
    if (!lockPkgs[name]) added.push(name);
    else if (lockPkgs[name].version !== version) changed.push(name);
  }
  for (const name of Object.keys(lockPkgs)) {
    if (!deps[name]) removed.push(name);
  }
  if (!added.length && !removed.length && !changed.length) return null;
  return { added, removed, changed };
}
