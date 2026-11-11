import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, isAbsolute, join } from 'path';
import { NAME_PART_RE } from './platform.js';
import { fetchWithTimeout } from './net.js';
import type { PlatformNames, PlatformSection } from './platform.js';

// `tsclang platform install` (#267): applying a platform package to the host
// project. Pure planning + application of manifest changes with lock
// ownership («the guest with a memory»): every builds/scripts entry the
// platform creates is recorded in the lock as a hash snapshot, so a later
// install can update its own entries, never touch user entries, and a remove
// can clean up exactly what it created.

// ── canonical hashing ───────────────────────────────────────────────────────

/** JSON with recursively sorted object keys — key-order-independent identity. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

/** Ownership snapshot of one manifest entry (builds.<key> object or scripts.<key> string). */
export function entryHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

// ── plan ────────────────────────────────────────────────────────────────────

export type ManifestTarget = 'builds' | 'scripts';
export type PlanActionKind = 'add' | 'update' | 'keep' | 'skip' | 'remove';

export interface PlanAction {
  kind: PlanActionKind;
  target: ManifestTarget;
  /** Manifest key in the consumer project (docker-model name) */
  key: string;
  /** Resolved preset value to write (add/update/keep; builds get a default outDir) */
  value?: unknown;
  /** entryHash(value) — the ownership snapshot */
  hash?: string;
  /** skip only: 'exists' (entry is not ours) | 'edited' (user modified our entry) */
  reason?: 'exists' | 'edited';
}

export interface PlatformApplyPlan {
  actions: PlanAction[];
}

/** Hash snapshots of manifest entries created by a platform (stored in the lock). */
export interface PlatformOwnership {
  builds?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface ManifestLike {
  builds?: Record<string, unknown>;
  scripts?: Record<string, unknown>;
}

// Default outDir for a build preset: the materialized manifest key (':' is
// forbidden in paths). An explicit preset outDir is honored as-is.
function withDefaultOutDir(raw: unknown, manifestKey: string): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const cfg = raw as Record<string, unknown>;
  if (cfg.outDir !== undefined) return cfg;
  return { ...cfg, outDir: `build/${manifestKey.replace(/:/g, '-')}` };
}

function planTarget(
  entries: [string, unknown][],
  target: ManifestTarget,
  keyOf: (internal: string) => string,
  manifestMap: Record<string, unknown> | undefined,
  ownedMap: Record<string, string> | undefined,
): PlanAction[] {
  const actions: PlanAction[] = [];
  const wanted = new Set<string>();
  for (const [internal, raw] of entries) {
    const key = keyOf(internal);
    wanted.add(key);
    const value = target === 'builds' ? withDefaultOutDir(raw, key) : raw;
    const hash = entryHash(value);
    const current = manifestMap?.[key];
    if (current === undefined) {
      actions.push({ kind: 'add', target, key, value, hash });
      continue;
    }
    const ownedHash = ownedMap?.[key];
    if (ownedHash === undefined) {
      // Entry exists but the platform never owned it — the user's. Never overwrite.
      actions.push({ kind: 'skip', target, key, value, hash, reason: 'exists' });
      continue;
    }
    if (entryHash(current) !== ownedHash) {
      // Was ours, but the user modified it — treat as the user's from now on.
      actions.push({ kind: 'skip', target, key, value, hash, reason: 'edited' });
      continue;
    }
    actions.push(hash === ownedHash
      ? { kind: 'keep', target, key, value, hash }
      : { kind: 'update', target, key, value, hash });
  }
  // Stale own entries: the preset set no longer lists them. Only unedited ones
  // are removed — a user-edited entry stays (with a skip/edited notice).
  for (const key of Object.keys(ownedMap ?? {})) {
    if (wanted.has(key)) continue;
    const current = manifestMap?.[key];
    if (current === undefined || entryHash(current) === ownedMap![key]) {
      actions.push({ kind: 'remove', target, key });
    } else {
      actions.push({ kind: 'skip', target, key, reason: 'edited' });
    }
  }
  return actions;
}

/**
 * Decide how a platform section applies to a host manifest, given the
 * ownership snapshots from the lock (undefined = first install). Pure:
 * mutates nothing, throws only on malformed preset names.
 */
export function planPlatformApply(
  platform: PlatformSection,
  names: PlatformNames,
  manifest: ManifestLike,
  owned: PlatformOwnership | undefined,
): PlatformApplyPlan {
  const actions = [
    ...planTarget(Object.entries(platform.builds), 'builds', (k) => names.key(k), manifest.builds, owned?.builds),
    ...planTarget(Object.entries(platform.scripts ?? {}), 'scripts', (k) => names.script(k), manifest.scripts, owned?.scripts),
  ];
  return { actions };
}

/**
 * Apply a plan to a manifest object (mutated in place, no fs): writes
 * add/update entries, removes stale own entries, records the dependency.
 * Skipped and kept entries are untouched.
 */
export function applyPlatformPlan(
  manifest: Record<string, unknown>,
  plan: PlatformApplyPlan,
  dep?: { name: string; version: string },
): void {
  if (dep) {
    if (!manifest.dependencies || typeof manifest.dependencies !== 'object') manifest.dependencies = {};
    (manifest.dependencies as Record<string, string>)[dep.name] = dep.version;
  }
  for (const action of plan.actions) {
    if (action.kind === 'add' || action.kind === 'update') {
      let map = manifest[action.target] as Record<string, unknown> | undefined;
      if (!map || typeof map !== 'object') { map = {}; manifest[action.target] = map; }
      map[action.key] = action.value;
    } else if (action.kind === 'remove') {
      const map = manifest[action.target] as Record<string, unknown> | undefined;
      if (map && typeof map === 'object') delete map[action.key];
    }
  }
}

/** Ownership snapshots after the plan is applied: every entry we add/update/keep. */
export function ownershipFromPlan(plan: PlatformApplyPlan): PlatformOwnership {
  const ownership: PlatformOwnership = {};
  for (const action of plan.actions) {
    if (action.kind !== 'add' && action.kind !== 'update' && action.kind !== 'keep') continue;
    const map = (action.target === 'builds' ? ownership.builds : ownership.scripts) ?? {};
    map[action.key] = action.hash!;
    if (action.target === 'builds') ownership.builds = map as Record<string, string>;
    else ownership.scripts = map as Record<string, string>;
  }
  return ownership;
}

/**
 * Plan the removal side of `platform remove` (#268): every owned entry whose
 * current value still matches its lock snapshot is removed; a user-edited one
 * (hash mismatch) is kept and reported as skip/edited; entries already gone
 * from the manifest produce no action. Pure.
 */
export function planPlatformRemoval(
  manifest: ManifestLike,
  owned: PlatformOwnership | undefined,
): PlanAction[] {
  const actions: PlanAction[] = [];
  for (const target of ['builds', 'scripts'] as const) {
    const ownedMap = target === 'builds' ? owned?.builds : owned?.scripts;
    const manifestMap = target === 'builds' ? manifest.builds : manifest.scripts;
    for (const [key, hash] of Object.entries(ownedMap ?? {})) {
      const current = manifestMap?.[key];
      if (current === undefined) continue; // already gone
      actions.push(entryHash(current) === hash
        ? { kind: 'remove', target, key }
        : { kind: 'skip', target, key, reason: 'edited' });
    }
  }
  return actions;
}

// ── archive fetching ────────────────────────────────────────────────────────

export interface ArchiveLocation {
  url: string;
  sha256?: string;
}

export interface FetchedArchive {
  text: string;
  /** sha256 of the archive text */
  integrity: string;
}

/**
 * Fetch a .tspkg archive: http(s) URL via fetch (AbortSignal timeout, the
 * doctor pattern), `file://` or a plain path via fs (registry fixtures and
 * mirrors). Verifies location.sha256 when present.
 */
export async function fetchPackageArchive(
  location: ArchiveLocation,
  opts: { offline?: boolean; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<FetchedArchive> {
  if (opts.offline) {
    throw new Error(`offline: package download skipped for ${location.url} (TSC_NO_NETWORK/--offline)`);
  }
  let text: string;
  if (/^https?:\/\//.test(location.url)) {
    let res: Response;
    try {
      res = await fetchWithTimeout(location.url, opts.timeoutMs ?? 30_000, opts.fetchImpl ?? fetch);
    } catch (e) {
      throw new Error(`network error fetching ${location.url}: ${(e as Error).message}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${location.url}`);
    text = await res.text();
  } else if (location.url.startsWith('file://')) {
    text = readFileSync(fileURLToPath(location.url), 'utf8');
  } else {
    text = readFileSync(location.url, 'utf8');
  }
  const integrity = createHash('sha256').update(text, 'utf8').digest('hex');
  if (location.sha256 && location.sha256 !== integrity) {
    throw new Error(`sha256 mismatch for ${location.url}: expected ${location.sha256}, got ${integrity}`);
  }
  return { text, integrity };
}

// ── archive extraction (zip-slip safe) ─────────────────────────────────────

const isWindowsAbsolute = (p: string): boolean => /^[a-zA-Z]:[\\/]/.test(p);

/** Valid package name shape ('name' or '@scope/name') → its path parts, else null. */
export function packageNameParts(pkgName: string): string[] | null {
  const parts = pkgName.split('/');
  const scopeOk = parts.length === 2 && parts[0].startsWith('@') && NAME_PART_RE.test(parts[0].slice(1));
  const nameOk = NAME_PART_RE.test(parts[parts.length - 1]);
  return (parts.length === 1 && nameOk) || (scopeOk && nameOk) ? parts : null;
}

/**
 * Extract a .tspkg archive (files map from the publish format) into
 * `<packagesDir>/<full package name>/`. Rejects path escapes in both the
 * package name and file paths — archives come from the network. Returns the
 * destination directory.
 */
export function extractTspkg(files: Record<string, string>, packagesDir: string, pkgName: string): string {
  const parts = packageNameParts(pkgName);
  if (!parts) throw new Error(`invalid package name in .tspkg: '${pkgName}'`);
  const dest = join(packagesDir, ...parts);
  for (const rel of Object.keys(files)) {
    if (isAbsolute(rel) || isWindowsAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
      throw new Error(`unsafe path in .tspkg: '${rel}'`);
    }
  }
  for (const [rel, content] of Object.entries(files)) {
    const target = join(dest, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return dest;
}
