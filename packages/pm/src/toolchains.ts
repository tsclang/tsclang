// Toolchain downloader for platform packages (epic #260, #270). Toolchains
// live isolated under ~/.tsclang/platforms/<platform>@<v>/<toolchain>@<v>/
// (multi-version, CI caches one directory). The decision core is pure and
// unit-tested; downloadToolchain fetches (http/https/file), verifies sha256
// and extracts with the SYSTEM tar (tar.exe on win10+ is bsdtar and reads
// .tar.gz; no dependency, no own tar parser, no tar-slip surface).

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { platformNames } from './platform.js';
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
  | { action: 'use-system'; command: string }
  | { action: 'ask-system'; command: string }
  | { action: 'ask-download' }
  | { action: 'download' }
  | { action: 'instruct' };

export interface DecisionState {
  /** Resolved system toolchain path/command, if one is found in PATH. */
  systemCommand?: string;
  tty: boolean;
  /** Machine-level remembered consent file value. */
  consent?: Consent;
  /** TSC_TOOLCHAINS env policy — overrides questions and the consent file. */
  envPolicy?: 'always' | 'never';
  /** A download exists for this os-arch. */
  hasDownload: boolean;
}

/** Decide what install does with one toolchain. Order: env policy → system
 * toolchain (TTY asks before using it, non-TTY uses it silently) → consent
 * file → ask (TTY) / instruct (non-TTY). No download for this os-arch —
 * always a manual instruction. */
export function decideToolchain(state: DecisionState): ToolchainDecision {
  if (state.envPolicy === 'always') {
    return state.hasDownload ? { action: 'download' } : { action: 'instruct' };
  }
  if (state.envPolicy === 'never') {
    return state.systemCommand
      ? { action: 'use-system', command: state.systemCommand }
      : { action: 'instruct' };
  }
  if (state.systemCommand) {
    return state.tty
      ? { action: 'ask-system', command: state.systemCommand }
      : { action: 'use-system', command: state.systemCommand };
  }
  if (!state.hasDownload) return { action: 'instruct' };
  if (state.consent === 'yes') return { action: 'download' };
  if (state.consent === 'no') return { action: 'instruct' };
  return state.tty ? { action: 'ask-download' } : { action: 'instruct' };
}

// ── system detection ────────────────────────────────────────────────────────

/** Resolve a toolchain command through PATH (`<cmd> --version`). Returns the
 * command name when it runs, null otherwise. */
export function detectSystemCommand(command: string): string | null {
  try {
    const r = spawnSync(command, ['--version'], { timeout: 10_000, windowsHide: true });
    return r.status === 0 ? command : null;
  } catch {
    return null;
  }
}

// ── per-OS manual instructions ──────────────────────────────────────────────

/** Short per-OS install instruction printed on a declined/failed download. */
export function toolchainInstructions(toolchain: string, os: string = process.platform): string {
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
    res = await doFetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000) });
  } catch (e) {
    throw new Error(`network error fetching ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

