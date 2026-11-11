import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// Platform registry v1 (#266, epic #260) — a JSON catalog hosted in the
// TSClang GitHub repo (`packages/registry/catalog.json`). No dedicated
// service; the CLI fetches the catalog with the doctor network pattern
// (AbortSignal.timeout), caches with a TTL, and respects offline gates.

export interface CatalogLocation {
  url: string;
  sha256?: string;
}

export interface CatalogPackage {
  name: string;
  /** Explicit marker from the package manifest ('platform' | 'library') —
   *  lets `platform search` tell platforms from libraries. */
  type: string;
  version: string;
  description: string;
  location?: CatalogLocation;
}

export interface Catalog {
  version: number;
  packages: CatalogPackage[];
}

/** Catalog schema version this CLI understands. */
export const CATALOG_SCHEMA_VERSION = 1;

export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/tsclang/tsclang/main/packages/registry/catalog.json';

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
    packages.push({ name, type, version: ver, description: typeof description === 'string' ? description : '', ...(location ? { location } : {}) });
  }
  return { version, packages };
}

/** Case-insensitive substring match over name and description. Empty query
 *  returns everything — the type marker keeps platforms/libraries apart. */
export function filterCatalog(catalog: Catalog, query: string): CatalogPackage[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog.packages;
  return catalog.packages.filter((p) =>
    p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
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
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
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
