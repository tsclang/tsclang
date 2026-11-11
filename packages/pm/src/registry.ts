import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { LOCK_FILE, PACKAGE_FILE } from '@tsclang/shared';
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
  if (range === '*' || range === 'latest') return versions[versions.length - 1];
  const satisfying = versions.filter((v: string) => semverSatisfies(v, range));
  if (satisfying.length === 0) return null;
  return satisfying.sort((a: string, b: string) => semverCmp(semverParse(a), semverParse(b))).pop()!;
}

export interface LockPackage {
  version: string;
  source?: string;
  /** Archive URL for registry installs (`platform install`) */
  resolved?: string;
  /** sha256 of the archive text for registry installs */
  integrity?: string;
  /** Hash snapshots of manifest entries created by a platform package (#267):
   *  lets later installs update their own entries without ever touching
   *  user entries, and lets `platform remove` clean up exactly what it made. */
  platform?: import('./platform-install.js').PlatformOwnership;
}

export interface LockFile {
  version: number;
  packages: Record<string, LockPackage>;
}


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
  const p = join(process.cwd(), PACKAGE_FILE);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

// Writes the whole manifest (applyPlatformPlan mutates in memory first).
export function writeManifest(manifest: Manifest): void {
  writeManifestFile(manifest);
}

function writeManifestFile(manifest: Manifest): void {
  writeFileSync(PACKAGE_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

// npm semantics: `install <pkg>` in a directory without tsc.package.json
// creates a minimal manifest instead of failing.
export function ensureManifest(): Manifest {
  let manifest = readManifest();
  if (!manifest) {
    manifest = { name: basename(process.cwd()), version: '0.1.0', type: 'package' };
    writeManifestFile(manifest);
  }
  return manifest;
}

export function manifestAddDependency(name: string, range: string): Manifest {
  const manifest = ensureManifest();
  if (!manifest.dependencies) manifest.dependencies = {};
  manifest.dependencies[name] = range;
  writeManifestFile(manifest);
  return manifest;
}

// Removes the dependency from both dependencies and devDependencies.
// Returns true when it was actually listed (and the manifest rewritten).
export function manifestRemoveDependency(name: string): boolean {
  const manifest = readManifest();
  if (!manifest) return false;
  let removed = false;
  if (manifest.dependencies?.[name] !== undefined) { delete manifest.dependencies[name]; removed = true; }
  if (manifest.devDependencies?.[name] !== undefined) { delete manifest.devDependencies[name]; removed = true; }
  if (removed) writeManifestFile(manifest);
  return removed;
}

// A lock entry satisfies a manifest range when its exact version matches it.
// Legacy entries may store the raw constraint ('^1.0.0', 'git', 'latest') —
// those fall back to string equality.
function lockEntrySatisfies(lockVersion: string, range: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(lockVersion)) return lockVersion === range;
  return semverSatisfies(lockVersion, range);
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
    else if (!lockEntrySatisfies(lockPkgs[name].version, version)) changed.push(name);
  }
  for (const name of Object.keys(lockPkgs)) {
    if (!deps[name]) removed.push(name);
  }
  if (!added.length && !removed.length && !changed.length) return null;
  return { added, removed, changed };
}
