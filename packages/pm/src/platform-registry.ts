import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fetchWithTimeout } from './net.js';
import { semverParseFull, semverCanonical, semverCmpFull, semverSatisfies } from './semver.js';

// Platform registry v1 (#266, epic #260) — a JSON catalog hosted in the
// TSClang GitHub repo (`packages/registry/catalog.json`). No dedicated
// service; the CLI fetches the catalog with the doctor network pattern
// (AbortSignal.timeout), caches with a TTL, and respects offline gates.

export interface CatalogLocation {
  url: string;
  sha256?: string;
}

/** One versioned archive in the catalog's `versions` history (#280). */
export interface CatalogVersionEntry {
  location: CatalogLocation;
  /** Minimum tsclang CLI version this package version needs. */
  minCli?: string;
}

export interface CatalogPackage {
  name: string;
  /** Explicit marker from the package manifest ('platform' | 'library') —
   *  lets `platform search` tell platforms from libraries. */
  type: string;
  /** Latest version (the flat fields ARE the latest entry). */
  version: string;
  description: string;
  /** Download of the latest version. */
  location?: CatalogLocation;
  /** Minimum CLI version for the flat latest (no effect on history entries). */
  minCli?: string;
  /** Version history (#280): optional, must include the flat latest verbatim
   *  (same url) — old CLIs keep resolving the flat fields, new ones resolve
   *  `name@spec` against the history. */
  versions?: Record<string, CatalogVersionEntry>;
}

export interface Catalog {
  version: number;
  packages: CatalogPackage[];
}

/** Catalog schema version this CLI understands. */
export const CATALOG_SCHEMA_VERSION = 1;

/** Catalog + archives live in the repo's default branch. TSClang releases
 *  from `develop` until the v1 publication flow (merge to main) is set up —
 *  main holds no registry archives yet, so pointing there breaks installs. */
export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/tsclang/tsclang/develop/packages/registry/catalog.json';

/** npm-style metadata freshness window. */
export const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

/** Catalog-level failure the CLI reports quietly (offline, parse, network). */
export class CatalogError extends Error {
  constructor(message: string, public readonly kind: 'offline' | 'parse' | 'network' | 'schema') {
    super(message);
    this.name = 'CatalogError';
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse and validate raw catalog JSON. Throws CatalogError on anything that
 *  is not a well-formed v1 catalog — an unknown schema version is reported
 *  explicitly (forward compat: newer CLI, older catalog or vice versa). */
export function parseCatalog(raw: string): Catalog {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new CatalogError('platform catalog is not valid JSON', 'parse');
  }
  if (!isPlainObject(data)) {
    throw new CatalogError('platform catalog must be a JSON object', 'schema');
  }
  const version = data.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new CatalogError("platform catalog: missing integer 'version'", 'schema');
  }
  if (version !== CATALOG_SCHEMA_VERSION) {
    throw new CatalogError(`unsupported platform catalog schema version ${version} (this CLI understands ${CATALOG_SCHEMA_VERSION})`, 'schema');
  }
  if (!Array.isArray(data.packages)) {
    throw new CatalogError("platform catalog: 'packages' must be an array", 'schema');
  }
  const packages: CatalogPackage[] = [];
  for (const entry of data.packages) {
    if (!isPlainObject(entry)) {
      throw new CatalogError('platform catalog: every entry must be an object', 'schema');
    }
    const { name, type, version: ver, description } = entry as Record<string, unknown>;
    if (typeof name !== 'string' || name.length === 0
      || typeof type !== 'string' || type.length === 0
      || typeof ver !== 'string' || ver.length === 0) {
      throw new CatalogError(`platform catalog entry ${JSON.stringify(name ?? entry)}: name, type and version are required strings`, 'schema');
    }
    let location: CatalogLocation | undefined;
    if (entry.location !== undefined) {
      if (!isPlainObject(entry.location) || typeof (entry.location as Record<string, unknown>).url !== 'string') {
        throw new CatalogError(`platform catalog entry ${name}: 'location.url' must be a string`, 'schema');
      }
      const loc = entry.location as Record<string, unknown>;
      location = { url: loc.url as string, ...(typeof loc.sha256 === 'string' ? { sha256: loc.sha256 } : {}) };
    }
    let minCli: string | undefined;
    if (entry.minCli !== undefined) {
      if (typeof entry.minCli !== 'string' || !semverParseFull(entry.minCli)) {
        throw new CatalogError(`platform catalog entry ${name}: 'minCli' must be a version string`, 'schema');
      }
      minCli = entry.minCli;
    }
    // Version history (#280). The flat fields remain the mandatory latest
    // entry; `versions` deepens it with older releases. Catalog desync is a
    // schema error, caught here rather than at a random install later.
    let versions: Record<string, CatalogVersionEntry> | undefined;
    if (entry.versions !== undefined) {
      if (!isPlainObject(entry.versions)) {
        throw new CatalogError(`platform catalog entry ${name}: 'versions' must be an object`, 'schema');
      }
      if (!location) {
        throw new CatalogError(`platform catalog entry ${name}: 'location' is required when 'versions' is present`, 'schema');
      }
      let hasLatest = false;
      for (const [key, raw] of Object.entries(entry.versions)) {
        const full = semverParseFull(key);
        if (!full || semverCanonical(full) !== key) {
          throw new CatalogError(`platform catalog entry ${name}: version key '${key}' is not a canonical X.Y.Z[-pre] version`, 'schema');
        }
        if (!isPlainObject(raw) || !isPlainObject((raw as Record<string, unknown>).location)
          || typeof ((raw as Record<string, unknown>).location as Record<string, unknown>).url !== 'string') {
          throw new CatalogError(`platform catalog entry ${name}: versions['${key}'].location.url must be a string`, 'schema');
        }
        const loc = (raw as Record<string, unknown>).location as Record<string, unknown>;
        const rawMinCli = (raw as Record<string, unknown>).minCli;
        if (rawMinCli !== undefined && (typeof rawMinCli !== 'string' || !semverParseFull(rawMinCli))) {
          throw new CatalogError(`platform catalog entry ${name}: versions['${key}'].minCli must be a version string`, 'schema');
        }
        if (key === ver) {
          hasLatest = true;
          if ((loc as Record<string, unknown>).url !== location.url) {
            throw new CatalogError(`platform catalog entry ${name}: versions['${key}'] disagrees with the flat location (catalog desync)`, 'schema');
          }
        }
      }
      if (!hasLatest) {
        throw new CatalogError(`platform catalog entry ${name}: 'versions' must include the latest version ${ver}`, 'schema');
      }
      versions = entry.versions as Record<string, CatalogVersionEntry>;
    }
    packages.push({
      name, type, version: ver, minCli,
      description: typeof description === 'string' ? description : '',
      ...(location ? { location } : {}),
      ...(versions ? { versions } : {}),
    });
  }
  return { version, packages };
}

/** Case-insensitive substring match over name and description. Empty query
 * returns everything — the type marker keeps platforms/libraries apart. */
export function filterCatalog(catalog: Catalog, query: string): CatalogPackage[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog.packages;
  return catalog.packages.filter((p) =>
    p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
}

// ── name@spec resolution (#280) ──────────────────────────────────────────────

/** Split a `name@spec` request at the LAST '@' (names may carry a @scope):
 * '@nes/zxdev@^0.4' → { name: '@nes/zxdev', spec: '^0.4' }; a bare name gets
 * spec '' (latest). Null only for empty/degenerate input — name VALIDITY is
 * the caller's concern (install reports not-found for junk names). */
export function parsePlatformRequest(arg: string): { name: string; spec: string } | null {
  if (!arg || arg === '@') return null;
  const at = arg.lastIndexOf('@');
  if (at <= 0) return { name: arg, spec: '' };
  const name = arg.slice(0, at);
  const spec = arg.slice(at + 1);
  if (!name || !spec) return null;
  return { name, spec };
}

export type CatalogVersionResolution =
  | { status: 'resolved'; version: string; location: CatalogLocation }
  | { status: 'no-version'; available: string[] }
  | { status: 'cli-too-old'; version: string; requires: string };

/** All installable versions of an entry (history + flat latest), the flat
 * entry winning a duplicate key (its minCli applies unless the history entry
 * carries its own). */
function catalogVersionCandidates(entry: CatalogPackage): Map<string, CatalogVersionEntry> {
  const candidates = new Map<string, CatalogVersionEntry>();
  for (const [v, e] of Object.entries(entry.versions ?? {})) candidates.set(v, e);
  if (entry.location) {
    const fromHistory = candidates.get(entry.version);
    candidates.set(entry.version, {
      location: entry.location,
      ...(fromHistory?.minCli ?? entry.minCli ? { minCli: fromHistory?.minCli ?? entry.minCli } : {}),
    });
  }
  return candidates;
}

/** Resolve `name@spec` against a catalog entry (#280). Bare / `*` / `latest`
 * take the flat latest — NO silent fallback to an older version when the
 * latest needs a newer CLI (fail loud instead). Ranges pick the highest
 * satisfying version, silently skipping ones whose minCli exceeds the running
 * CLI; when every candidate is filtered out, 'cli-too-old' names the newest
 * candidate and what it requires. Unknown minCli-CLI (no cliVersion) never
 * blocks. Pure. */
export function resolveCatalogVersion(
  entry: CatalogPackage,
  spec: string,
  opts: { cliVersion?: string } = {},
): CatalogVersionResolution {
  const candidates = catalogVersionCandidates(entry);
  const cliOk = (minCli?: string): boolean => {
    if (minCli === undefined || opts.cliVersion === undefined) return true;
    const cli = semverParseFull(opts.cliVersion);
    const need = semverParseFull(minCli);
    return !cli || !need ? true : semverCmpFull(cli, need) >= 0;
  };
  const sortedAvailable = (): string[] =>
    [...candidates.keys()].sort((a, b) => semverCmpFull(semverParseFull(a)!, semverParseFull(b)!));

  const trimmed = spec.trim();
  if (trimmed === '' || trimmed === '*' || trimmed === 'latest') {
    const latest = candidates.get(entry.version);
    if (!latest) return { status: 'no-version', available: sortedAvailable() };
    if (!cliOk(latest.minCli)) return { status: 'cli-too-old', version: entry.version, requires: latest.minCli! };
    return { status: 'resolved', version: entry.version, location: latest.location };
  }

  const matching = sortedAvailable().filter((v) => semverSatisfies(v, trimmed));
  if (!matching.length) return { status: 'no-version', available: sortedAvailable() };
  const compatible = matching.filter((v) => cliOk(candidates.get(v)!.minCli));
  if (!compatible.length) {
    const newest = matching[matching.length - 1];
    return { status: 'cli-too-old', version: newest, requires: candidates.get(newest)!.minCli! };
  }
  const pick = compatible[compatible.length - 1]; // already sorted ascending
  return { status: 'resolved', version: pick, location: candidates.get(pick)!.location };
}

// ── update planning (#279, ranged in #280) ─────────────────────────────────

export interface InstalledPlatformRef {
  name: string;
  version: string;
  /** Requested spec from dependencies. undefined/'' (legacy manifests) →
   *  latest semantics. An exact version is a PIN and is never updated. */
  spec?: string;
}

export interface PlatformUpdate {
  name: string;
  /** Version currently applied in the project. */
  current: string;
  /** Strictly newer catalog version to move to (within the requested spec). */
  next: string;
  /** The dependency spec this update stays inside ('' = bare latest). */
  spec: string;
}

/** Installed platforms pinned by an exact version — reported, never touched. */
export interface PlatformPin {
  name: string;
  version: string;
}

/** Compare installed platforms with the catalog (#279; #280 makes it respect
 * the dependency spec): bare → flat latest (strictly newer only, a stale
 * registry must not downgrade); range (^ ~ >= *) → the highest catalog
 * version INSIDE the range; exact spec → a pin, reported separately and never
 * updated. Platforms absent from the catalog are reported separately. Pure. */
export function planPlatformUpdates(
  installed: ReadonlyArray<InstalledPlatformRef>,
  catalog: Catalog,
  opts: { cliVersion?: string } = {},
): { updates: PlatformUpdate[]; missingFromCatalog: string[]; pinned: PlatformPin[] } {
  const updates: PlatformUpdate[] = [];
  const missingFromCatalog: string[] = [];
  const pinned: PlatformPin[] = [];
  const byName = new Map(catalog.packages.map((p) => [p.name, p]));
  const newer = (a: string, b: string): boolean => {
    const fa = semverParseFull(a);
    const fb = semverParseFull(b);
    return fa !== null && fb !== null && semverCmpFull(fa, fb) > 0;
  };
  for (const p of installed) {
    const entry = byName.get(p.name);
    if (!entry) {
      missingFromCatalog.push(p.name);
      continue;
    }
    const spec = (p.spec ?? '').trim();
    if (spec !== '' && spec !== '*' && spec !== 'latest' && semverParseFull(spec)) {
      pinned.push({ name: p.name, version: spec }); // exact version = pin
      continue;
    }
    let target: string;
    if (spec === '') {
      target = entry.version; // bare / legacy: the flat latest
    } else {
      const resolution = resolveCatalogVersion(entry, spec, { cliVersion: opts.cliVersion });
      if (resolution.status !== 'resolved') continue; // empty range in catalog
      target = resolution.version;
    }
    if (newer(target, p.version)) {
      updates.push({ name: p.name, current: p.version, next: target, spec });
    }
  }
  return { updates, missingFromCatalog, pinned };
}

// ── Catalog loading: registry override → cache → network, with gates ────────

export type CatalogSource = 'file' | 'cache' | 'registry';

export interface LoadCatalogResult {
  catalog: Catalog;
  source: CatalogSource;
}

export interface LoadCatalogOptions {
  /** Explicit registry: an http(s) URL or a local file path (TSC_REGISTRY
   *  fixture). A local path bypasses cache and network entirely. */
  registry?: string;
  /** TSC_NO_NETWORK / --offline: cache only, never touch the network. */
  offline?: boolean;
  /** DI for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Catalog cache file; defaults to TSC_CATALOG_CACHE env or
   *  ~/.tsclang/platform-catalog-cache.json. */
  cachePath?: string;
  timeoutMs?: number;
}

function defaultCachePath(): string {
  return process.env.TSC_CATALOG_CACHE
    ?? join(homedir(), '.tsclang', 'platform-catalog-cache.json');
}

interface CatalogCache {
  fetchedAt: number;
  catalog: Catalog;
}

function readCache(path: string, now: number): Catalog | null {
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as CatalogCache;
    if (typeof data.fetchedAt !== 'number' || !Array.isArray(data.catalog?.packages)) return null;
    if (now - data.fetchedAt > CATALOG_CACHE_TTL_MS) return null;
    return data.catalog;
  } catch {
    return null;
  }
}

function writeCache(path: string, catalog: Catalog, now: number): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ fetchedAt: now, catalog } satisfies CatalogCache, null, 2) + '\n', 'utf8');
  } catch {
    // Cache write is best-effort: a read-only home must not break search.
  }
}

/** Load the platform catalog. Order: explicit local registry file → fresh
 *  cache → network fetch (which refreshes the cache). Offline mode never
 *  touches the network; offline with no usable cache throws CatalogError
 *  ('offline') — the CLI prints a quiet notice instead of crashing. */
export async function loadCatalog(opts: LoadCatalogOptions = {}): Promise<LoadCatalogResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = Date.now();
  const cachePath = opts.cachePath ?? defaultCachePath();

  // 1. Explicit local registry (TSC_REGISTRY fixture or a plain path) — the
  //    file is the source of truth: no cache reads, no writes, no network.
  if (opts.registry !== undefined && !/^https?:\/\//.test(opts.registry)) {
    let raw: string;
    try {
      raw = readFileSync(opts.registry, 'utf8');
    } catch {
      throw new CatalogError(`platform registry file not found: ${opts.registry}`, 'parse');
    }
    return { catalog: parseCatalog(raw), source: 'file' };
  }

  // 2. Fresh cache satisfies both online and offline modes.
  const cached = readCache(cachePath, now);
  if (cached) return { catalog: cached, source: 'cache' };

  if (opts.offline) {
    throw new CatalogError('offline: no cached platform catalog (set TSC_REGISTRY or go online)', 'offline');
  }

  // 3. Fetch the catalog (explicit registry URL or the default GitHub raw).
  const url = opts.registry ?? DEFAULT_CATALOG_URL;
  let raw: string;
  try {
    const res = await fetchWithTimeout(url, opts.timeoutMs ?? 10_000, fetchImpl);
    if (!res.ok) {
      throw new CatalogError(`platform catalog fetch failed: HTTP ${res.status}`, 'network');
    }
    raw = await res.text();
  } catch (e) {
    if (e instanceof CatalogError) throw e;
    throw new CatalogError(`platform catalog unreachable: ${(e as Error).message}`, 'network');
  }
  const catalog = parseCatalog(raw);
  writeCache(cachePath, catalog, now);
  return { catalog, source: 'registry' };
}
