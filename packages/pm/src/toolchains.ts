// Toolchain downloader for platform packages (epic #260, #270). Toolchains
// live isolated under ~/.tsclang/platforms/<platform>@<v>/<toolchain>@<v>/
// (multi-version, CI caches one directory). The decision core is pure and
// unit-tested; downloadToolchain fetches (http/https/file), verifies sha256
// and extracts with the SYSTEM tar (tar.exe on win10+ is bsdtar and reads
// .tar.gz; no dependency, no own tar parser, no tar-slip surface).

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';
import { platformNames } from './platform.js';
import { fetchWithTimeout } from './net.js';
import type { PlatformToolchain } from './platform.js';

// ── os-arch selection ───────────────────────────────────────────────────────

/** os-arch key of a process, e.g. 'win32-x64', 'darwin-arm64'. */
export function osArchKey(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
  return `${platform}-${arch}`;
}

/** The download entry for the given os/arch, or null when the toolchain
 * ships no build for it (the CLI turns that into a manual instruction). */
export function selectDownload(
  tc: PlatformToolchain,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): { url: string; sha256: string; size?: number } | null {
  return tc.downloads[osArchKey(platform, arch)] ?? null;
}

// ── paths ───────────────────────────────────────────────────────────────────

/** User home root; TSC_HOME overrides it (tests, CI cache dirs). Everything
 * toolchain-related lives under <home>/.tsclang. */
export function userHome(): string {
  return process.env.TSC_HOME ?? homedir();
}

/** Isolated install dir for one toolchain of one platform package version.
 * The platform name materializes like a build name: official scope has no
 * prefix, a foreign one gets `scope-name` (`:` is not path-safe on NTFS). */
export function platformToolchainDir(
  pkgName: string,
  pkgVersion: string,
  toolchain: string,
  toolchainVersion: string,
  home: string = userHome(),
): string {
  const names = platformNames(pkgName);
  if (!names) throw new Error(`invalid platform package name '${pkgName}'`);
  const platformDir = names.build.replace(/:/g, '-');
  return join(home, '.tsclang', 'platforms', `${platformDir}@${pkgVersion}`, `${toolchain}@${toolchainVersion}`);
}

// ── machine-level consent ───────────────────────────────────────────────────

export type Consent = 'yes' | 'no';

const consentPath = (home: string): string => join(home, '.tsclang', 'toolchain-consent.json');

/** Remembered download consent (machine-level). Best-effort: a missing or
 * corrupted file reads as undefined — the caller asks (TTY) or instructs. */
export function readConsent(home: string = userHome()): Consent | undefined {
  try {
    const raw = JSON.parse(readFileSync(consentPath(home), 'utf8')) as { download?: unknown };
    if (raw.download === 'yes' || raw.download === 'no') return raw.download;
    return undefined;
  } catch {
    return undefined;
  }
}

export function writeConsent(value: Consent, home: string = userHome()): void {
  mkdirSync(join(home, '.tsclang'), { recursive: true });
  writeFileSync(consentPath(home), JSON.stringify({ download: value }, null, 2) + '\n', 'utf8');
}

// ── decision core (pure) ────────────────────────────────────────────────────

export type ToolchainDecision =
  | { action: 'ask-download' }
  | { action: 'download' }
  | { action: 'instruct' };

export interface DecisionState {
  tty: boolean;
  /** Machine-level remembered consent file value. */
  consent?: Consent;
  /** TSC_TOOLCHAINS env policy — overrides questions and the consent file. */
  envPolicy?: 'always' | 'never';
  /** A download exists for this os-arch. */
  hasDownload: boolean;
}

/** Decide what install does with one toolchain (#282: a platform is
 * self-sufficient — the SYSTEM toolchain is never looked at, named or
 * offered; the only choices are the isolated bundle or a manual
 * instruction). Order: env policy → consent file → ask (TTY) / instruct
 * (non-TTY). No download for this os-arch — always a manual instruction. */
export function decideToolchain(state: DecisionState): ToolchainDecision {
  if (state.envPolicy === 'always') {
    return state.hasDownload ? { action: 'download' } : { action: 'instruct' };
  }
  if (state.envPolicy === 'never') return { action: 'instruct' };
  if (!state.hasDownload) return { action: 'instruct' };
  if (state.consent === 'yes') return { action: 'download' };
  if (state.consent === 'no') return { action: 'instruct' };
  return state.tty ? { action: 'ask-download' } : { action: 'instruct' };
}

// ── per-OS manual instructions ──────────────────────────────────────────────

/** Short per-OS install instruction printed on a declined/failed download. */
export function toolchainInstructions(toolchain: string, os: string = process.platform): string {
  // clang on darwin: darwin-x64 has no upstream LLVM bundle — the system
  // clang from Xcode Command Line Tools is the one honest source there
  if (toolchain === 'clang' && os === 'darwin') {
    return 'install clang manually: Xcode Command Line Tools (xcode-select --install) or brew install llvm; re-run with TSC_TOOLCHAINS=always to download an isolated copy';
  }
  switch (os) {
    case 'win32':
      return `install ${toolchain} manually: MSYS2 (https://www.msys2.org) or the vendor installer; re-run with TSC_TOOLCHAINS=always to download an isolated copy`;
    case 'darwin':
      return `install ${toolchain} manually: brew install ${toolchain} (or the vendor installer); re-run with TSC_TOOLCHAINS=always to download an isolated copy`;
    default:
      return `install ${toolchain} manually: apt install ${toolchain} (or your distro's package manager); re-run with TSC_TOOLCHAINS=always to download an isolated copy`;
  }
}

// ── download + extraction ───────────────────────────────────────────────────

export interface DownloadToolchainOptions {
  pkgName: string;
  pkgVersion: string;
  toolchain: string;
  spec: PlatformToolchain;
  download: { url: string; sha256: string };
  home?: string;
  offline?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface DownloadResult {
  /** The toolchain root directory (contains bin/, ... after extraction). */
  dir: string;
  /** True when the toolchain was already installed (no fetch happened). */
  skipped: boolean;
}

/** Download and install one toolchain into its isolated directory. Idempotent:
 * an existing directory is returned as-is without touching the network.
 * sha256 is verified BEFORE extraction; extraction is the system tar. */
export async function downloadToolchain(opts: DownloadToolchainOptions): Promise<DownloadResult> {
  const dir = platformToolchainDir(opts.pkgName, opts.pkgVersion, opts.toolchain, opts.spec.version, opts.home);
  if (existsSync(dir)) return { dir, skipped: true };
  if (opts.offline) {
    throw new Error(`offline: toolchain download skipped for ${opts.toolchain} (TSC_NO_NETWORK/--offline)`);
  }

  const bytes = await fetchArchiveBytes(opts.download.url, opts);
  const integrity = createHash('sha256').update(bytes).digest('hex');
  if (integrity !== opts.download.sha256) {
    throw new Error(`sha256 mismatch for ${opts.toolchain}: expected ${opts.download.sha256}, got ${integrity}`);
  }

  // Extract with the system tar. The archive is referenced by a RELATIVE
  // name with cwd inside the destination: an absolute `C:\...` path makes
  // GNU tar treat the drive colon as its `host:path` remote syntax.
  mkdirSync(dir, { recursive: true });
  const archiveName = `.download.${Date.now()}.tar.gz`;
  const archivePath = join(dir, archiveName);
  writeFileSync(archivePath, bytes);
  try {
    const tar = spawnSync('tar', ['-xf', archiveName], { cwd: dir, timeout: 300_000, windowsHide: true });
    if (tar.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`tar failed for ${opts.toolchain}: ${(tar.stderr ?? '').toString().trim() || `exit ${tar.status}`}`);
    }
  } catch (e) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    throw e;
  } finally {
    rmSync(archivePath, { force: true });
  }
  return { dir, skipped: false };
}

async function fetchArchiveBytes(url: string, opts: DownloadToolchainOptions): Promise<Buffer> {
  if (/^file:\/\//.test(url)) {
    return readFileSync(fileURLToPath(url));
  }
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`unsupported toolchain url: ${url}`);
  }
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, opts.timeoutMs ?? 120_000, doFetch);
  } catch (e) {
    throw new Error(`network error fetching ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── build-time resolution (#271) ────────────────────────────────────────────

export interface ToolchainSpec {
  name: string;
  version?: string;
}

/** Split a toolchain reference like 'avr-gcc@12.1' into name + pinned
 * version. A bare name pins nothing. */
export function parseToolchainSpec(spec: string): ToolchainSpec {
  const at = spec.lastIndexOf('@');
  if (at > 0) return { name: spec.slice(0, at), version: spec.slice(at + 1) };
  return { name: spec };
}

/** Segment-wise numeric version compare ('12.10' > '12.9' > '12.1'). Shared
 * by the isolated-toolchain resolver and platform update planning (#279). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10) || 0);
  const pb = b.split('.').map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface IsolatedToolchain {
  /** The dir to prepend to PATH / take binaries from. */
  binDir: string;
  version: string;
}

/** All toolchains installed for one platform package version (doctor's
 * Platforms section): every `<toolchain>@<version>/` entry under the
 * platform's cache dir, bin/ when present, the flat root otherwise. */
export function listIsolatedToolchains(
  pkgName: string,
  pkgVersion: string,
  home: string = userHome(),
): Array<{ name: string; version: string; dir: string; binDir: string }> {
  const names = platformNames(pkgName);
  if (!names) return [];
  const platformDir = join(home, '.tsclang', 'platforms', `${names.build.replace(/:/g, '-')}@${pkgVersion}`);
  let entries: string[];
  try {
    entries = readdirSync(platformDir);
  } catch {
    return [];
  }
  const result: Array<{ name: string; version: string; dir: string; binDir: string }> = [];
  for (const entry of entries) {
    const at = entry.lastIndexOf('@');
    if (at <= 0) continue;
    const dir = join(platformDir, entry);
    result.push({
      name: entry.slice(0, at),
      version: entry.slice(at + 1),
      dir,
      binDir: existsSync(join(dir, 'bin')) ? join(dir, 'bin') : dir,
    });
  }
  return result;
}

/** Find a toolchain in the isolated platform cache (~/.tsclang/platforms).
 * With `version` — an exact match; without — the newest installed version
 * across all platform packages. `bin/` wins; a flat toolchain root serves as
 * its own bin dir. null when the cache has no such toolchain.
 *
 * `name` may also be a TOOL shipped inside another toolchain's bundle
 * (avr-gcc's bin/ carries avr-objcopy, avr-as…). A bundle named exactly
 * `name` wins; otherwise the newest bundle whose bin dir contains the
 * `name`(.exe) binary resolves the tool, with the bundle's version. */
export function findIsolatedToolchain(
  name: string,
  opts: { version?: string; home?: string } = {},
): IsolatedToolchain | null {
  const platformsRoot = join(opts.home ?? userHome(), '.tsclang', 'platforms');
  let best: IsolatedToolchain | null = null;
  let platforms: string[];
  try {
    platforms = readdirSync(platformsRoot);
  } catch {
    return null;
  }
  let bestIsExact = false;
  for (const platformEntry of platforms) {
    let entries: string[];
    try {
      entries = readdirSync(join(platformsRoot, platformEntry));
    } catch {
      continue;
    }
    for (const tcEntry of entries) {
      if (!tcEntry.includes('@')) continue;
      const at = tcEntry.lastIndexOf('@');
      const tcName = tcEntry.slice(0, at);
      const version = tcEntry.slice(at + 1);
      if (!version) continue;
      if (opts.version && version !== opts.version) continue;
      const root = join(platformsRoot, platformEntry, tcEntry);
      const binDir = existsSync(join(root, 'bin')) ? join(root, 'bin') : root;
      if (tcName === name) {
        // exact bundle name always wins over a bundle merely containing the tool
        if (!bestIsExact || !best || compareVersions(best.version, version) < 0) {
          best = { binDir, version };
          bestIsExact = true;
        }
      } else {
        // bundled tool: the binary sits in the bundle's bin dir
        if (bestIsExact) continue;
        if (!existsSync(join(binDir, process.platform === 'win32' ? `${name}.exe` : name))) continue;
        if (best && compareVersions(best.version, version) >= 0) continue;
        best = { binDir, version };
      }
    }
  }
  return best;
}

/** Does a `--version` output satisfy a pinned version? Segment boundary, not
 * substring: '12.1' matches '12.1.0' but not '12.10.0'. */
export function versionMatches(haystack: string, version: string): boolean {
  const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${esc}(?:\\.|\\s|$)`).test(haystack);
}

export type ResolvedToolchain =
  | { kind: 'isolated'; binDir: string; version: string }
  | { kind: 'path'; command: string };

export interface ResolveToolchainOptions {
  version?: string;
  home?: string;
  /** #282: bare tsclang never compiles with a silently picked toolchain.
   * PATH is probed ONLY when the caller resolved an EXPLICIT reference (a
   * pinned builds.<n>.toolchain or a profile capability) — the user named
   * the toolchain, so honoring PATH is their stated intent. The default
   * (target default name) resolves isolated-cache-only and returns null
   * otherwise; the caller reports the install-or-pin instruction. */
  allowPath?: boolean;
  /** Returns the `--version` output of a PATH command, null when it does not
   * run. Injectable for unit tests; defaults to a real probe. */
  probeVersion?: (command: string) => string | null;
}

/** Resolution order (spec 13-build, #282): the isolated platform cache
 * always; PATH only for an explicitly named toolchain (`allowPath`). A
 * pinned version accepts a PATH toolchain only when its --version output
 * matches; otherwise null — the caller reports the install-or-pin hint. */
export function resolveToolchain(name: string, opts: ResolveToolchainOptions = {}): ResolvedToolchain | null {
  const isolated = findIsolatedToolchain(name, { version: opts.version, home: opts.home });
  if (isolated) return { kind: 'isolated', ...isolated };
  if (!opts.allowPath) return null;
  const probe = opts.probeVersion ?? ((cmd: string): string | null => {
    try {
      const r = spawnSync(cmd, ['--version'], { timeout: 10_000, windowsHide: true });
      return r.status === 0 && !r.error ? `${r.stdout ?? ''}${r.stderr ?? ''}` : null;
    } catch {
      return null;
    }
  });
  const output = probe(name);
  if (output === null) return null;
  if (opts.version && !versionMatches(output, opts.version)) return null;
  return { kind: 'path', command: name };
}

export interface ProfileExtras {
  includeDirs: string[];
  toolchainFile?: string;
}

/** Resolve profile capability paths (`toolchainFile`, `include`) against the
 * directory the profile came from — a platform package ships them next to
 * index.d.tsc. Absolute paths pass through. */
export function resolveProfileExtras(
  caps: { toolchainFile?: string; include?: string | string[] },
  profileDir: string,
): ProfileExtras {
  const resolvePath = (p: string): string => (isAbsolute(p) ? p : join(profileDir, p));
  const includeDirs: string[] = [];
  if (typeof caps.include === 'string') includeDirs.push(resolvePath(caps.include));
  else if (Array.isArray(caps.include)) {
    for (const inc of caps.include) if (typeof inc === 'string') includeDirs.push(resolvePath(inc));
  }
  return {
    includeDirs,
    toolchainFile: typeof caps.toolchainFile === 'string' ? resolvePath(caps.toolchainFile) : undefined,
  };
}

