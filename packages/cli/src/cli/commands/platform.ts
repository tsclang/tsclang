import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PACKAGES_DIR } from '@tsclang/shared';
import {
  loadCatalog, filterCatalog, CatalogError,
  platformNames, validatePlatformSection,
  planPlatformApply, applyPlatformPlan, ownershipFromPlan,
  fetchPackageArchive, extractTspkg,
  readLock, writeLock, ensureManifest, writeManifest,
} from '@tsclang/pm';
import type { PlatformSection, PlatformApplyPlan } from '@tsclang/pm';
import { hasFlag } from '../args.js';
import { askYesNo } from '../doctor/prompt.js';

// `tsclang platform <sub>` — nested command group (#265). The dispatcher
// validates the subcommand and its flags before calling here. search/list
// landed in #266, install in #267; remove lands in #268 (explicit stub).

export const PLATFORM_SUBCOMMANDS = ['install', 'search', 'remove', 'list'] as const;

export async function runPlatformCommand(sub: string, restArgs: string[]): Promise<void> {
  switch (sub) {
    case 'install': return runPlatformInstall(restArgs);
    case 'search':  return runPlatformSearch(restArgs);
    case 'list':    return runPlatformList();
    default:
      // remove stub — honest refusal until #268 lands.
      console.error(`tsclang: platform ${sub} is not implemented yet`);
      process.exit(1);
  }
}

// ── platform install ────────────────────────────────────────────────────────

async function runPlatformInstall(restArgs: string[]): Promise<void> {
  const name = restArgs.find((a) => !a.startsWith('-'));
  if (!name) {
    process.stderr.write('tsclang platform install: missing <name> (usage: tsclang platform install <name>)\n');
    process.exit(1);
  }
  const offline = hasFlag(restArgs, '--offline') || !!process.env.TSC_NO_NETWORK;
  const registry = process.env.TSC_REGISTRY; // local fixture or URL override

  // A write operation fails loud: unlike search, offline/catalog errors abort.
  let packages;
  try {
    const { catalog } = await loadCatalog({ registry, offline });
    packages = catalog.packages;
  } catch (e) {
    if (e instanceof CatalogError) {
      process.stderr.write(`tsclang platform install: ${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }
  const entry = packages.find((p) => p.name === name);
  if (!entry) {
    process.stderr.write(`tsclang platform install: '${name}' not found in the platform registry\n`);
    process.exit(1);
  }
  if (entry.type !== 'platform') {
    process.stderr.write(`tsclang platform install: '${name}' is a ${entry.type} package, not a platform — use 'tsclang install'\n`);
    process.exit(1);
  }
  if (!entry.location?.url) {
    process.stderr.write(`tsclang platform install: registry entry for '${name}' has no download location\n`);
    process.exit(1);
  }

  let archiveText: string, integrity: string;
  try {
    ({ text: archiveText, integrity } = await fetchPackageArchive(entry.location, { offline }));
  } catch (e) {
    process.stderr.write(`tsclang platform install: ${(e as Error).message}\n`);
    process.exit(1);
  }

  let archive: { name?: string; version?: string; files?: Record<string, string> };
  try {
    archive = JSON.parse(archiveText);
  } catch (e) {
    process.stderr.write(`tsclang platform install: invalid .tspkg for '${name}': ${(e as Error).message}\n`);
    process.exit(1);
  }
  if (!archive.name || !archive.version || !archive.files) {
    process.stderr.write(`tsclang platform install: malformed .tspkg for '${name}' (missing name/version/files)\n`);
    process.exit(1);
  }
  if (archive.name !== name) {
    process.stderr.write(`tsclang platform install: archive name mismatch — catalog says '${name}', archive says '${archive.name}'\n`);
    process.exit(1);
  }

  // The platform section travels inside the package manifest.
  let pkgManifest: { platform?: unknown };
  try {
    pkgManifest = JSON.parse(archive.files['tsc.package.json'] ?? '{}');
  } catch (e) {
    process.stderr.write(`tsclang platform install: package manifest is not valid JSON: ${(e as Error).message}\n`);
    process.exit(1);
  }
  const invalid = validatePlatformSection(pkgManifest.platform);
  if (invalid) {
    process.stderr.write(`tsclang platform install: package '${name}' has an invalid platform section: ${invalid}\n`);
    process.exit(1);
  }
  const platform = pkgManifest.platform as PlatformSection;
  const names = platformNames(archive.name);
  if (!names) {
    process.stderr.write(`tsclang platform install: cannot map package name '${archive.name}' to build names\n`);
    process.exit(1);
  }

  extractTspkg(archive.files, PACKAGES_DIR, archive.name);

  // npm semantics: installing in a bare directory creates a minimal manifest.
  const manifest = ensureManifest() as unknown as Record<string, unknown>;
  const lock = readLock();
  const owned = lock.packages[archive.name]?.platform;
  const plan = planPlatformApply(platform, names, manifest as never, owned);

  // Conflict policy: platform entries NEVER overwrite. Non-TTY — skip with a
  // notice; TTY (or TSC_PLATFORM_INTERACTIVE=1) — confirm the skip, an explicit
  // "no" aborts before anything is written to the manifest.
  const interactive = process.env.TSC_PLATFORM_INTERACTIVE === '1' || process.stdin.isTTY === true;
  for (const action of plan.actions.filter((a) => a.kind === 'skip')) {
    const label = action.target === 'builds' ? `builds.${action.key}` : `scripts.${action.key}`;
    const why = action.reason === 'edited'
      ? 'you edited an entry this platform created earlier'
      : 'it exists and was not created by the platform';
    if (interactive) {
      const skipIt = await askYesNo(`tsclang platform install: entry ${label} conflicts (${why}). Platform entries never overwrite — skip it?`, true);
      if (!skipIt) {
        process.stderr.write(`tsclang platform install: aborted on conflict with ${label} (the manifest was not touched)\n`);
        process.exit(1);
      }
    }
    process.stderr.write(`tsclang: skipped ${label} — ${why} (never overwritten)\n`);
  }

  applyPlatformPlan(manifest, plan, { name: archive.name, version: archive.version });
  writeManifest(manifest as never);

  const ownership = ownershipFromPlan(plan);
  const lockEntry: Record<string, unknown> = {
    version: archive.version,
    source: 'registry',
    resolved: entry.location.url,
    integrity,
  };
  if (Object.keys(ownership.builds ?? {}).length || Object.keys(ownership.scripts ?? {}).length) {
    lockEntry.platform = ownership;
  }
  lock.packages[archive.name] = lockEntry as never;
  writeLock(lock);

  printInstallSummary(archive.name, archive.version, platform, plan);
  process.exit(0);
}

function printInstallSummary(name: string, version: string, platform: PlatformSection, plan: PlatformApplyPlan): void {
  const lines = [`Installed ${name}@${version}`];
  for (const action of plan.actions) {
    const label = action.target === 'builds' ? `build ${action.key}` : `script ${action.key}`;
    if (action.kind === 'add') lines.push(`  + ${label}`);
    else if (action.kind === 'update') lines.push(`  ~ ${label} (updated)`);
    else if (action.kind === 'remove') lines.push(`  - ${label} (stale platform entry removed)`);
    // keep → silent (idempotent); skip → already noticed on stderr
  }
  const toolchains = Object.keys(platform.toolchains ?? {});
  if (toolchains.length) {
    lines.push(`  toolchains: ${toolchains.join(', ')} (download consent arrives with toolchain support; system-installed ones already work)`);
  }
  process.stdout.write(lines.join('\n') + '\n');
}

// ── platform search ─────────────────────────────────────────────────────────

async function runPlatformSearch(restArgs: string[]): Promise<void> {
  const query = restArgs.find((a) => !a.startsWith('-')) ?? '';
  const offline = hasFlag(restArgs, '--offline') || !!process.env.TSC_NO_NETWORK;
  const registry = process.env.TSC_REGISTRY; // local fixture or URL override

  let entries;
  try {
    const { catalog } = await loadCatalog({ registry, offline });
    entries = filterCatalog(catalog, query);
  } catch (e) {
    // Quiet offline failure (doctor pattern): a notice, an empty result,
    // never a crash and never a non-zero exit for search.
    if (e instanceof CatalogError) {
      process.stderr.write(`tsclang: ${e.message}\n`);
      process.stdout.write(`No platforms found matching "${query}"\n`);
      process.exit(0);
    }
    throw e;
  }

  if (entries.length === 0) {
    process.stdout.write(`No platforms found matching "${query}"\n`);
    process.exit(0);
  }
  process.stdout.write(`Found ${entries.length} package${entries.length > 1 ? 's' : ''}${query ? ` matching "${query}"` : ''}:\n`);
  for (const p of entries) {
    process.stdout.write(`  ${p.name}@${p.version} [${p.type}] — ${p.description}\n`);
  }
  process.exit(0);
}

// ── platform list ───────────────────────────────────────────────────────────

interface InstalledPlatform {
  name: string;
  version: string;
  section: PlatformSection;
}

/** Platform packages installed in the project's tsc_packages (any depth of
 *  one scope), keyed by their manifest `type: "platform"`. */
export function scanInstalledPlatforms(cwd: string): InstalledPlatform[] {
  const root = join(cwd, PACKAGES_DIR);
  if (!existsSync(root)) return [];
  const pkgDirs: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('@')) {
      const scopeDir = join(root, entry.name);
      for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
        if (sub.isDirectory()) pkgDirs.push(join(scopeDir, sub.name));
      }
    } else {
      pkgDirs.push(join(root, entry.name));
    }
  }
  const installed: InstalledPlatform[] = [];
  for (const dir of pkgDirs) {
    const manifestPath = join(dir, 'tsc.package.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (m?.type !== 'platform' || !m?.platform) continue;
      installed.push({ name: m.name ?? dir, version: m.version ?? '?', section: m.platform });
    } catch { /* skip broken manifests */ }
  }
  installed.sort((a, b) => a.name.localeCompare(b.name));
  return installed;
}

function runPlatformList(): void {
  const installed = scanInstalledPlatforms(process.cwd());
  if (installed.length === 0) {
    process.stdout.write('No platforms installed (see tsclang platform search)\n');
    process.exit(0);
  }
  for (const p of installed) {
    const toolchains = Object.keys(p.section.toolchains ?? {}).join(', ') || 'no toolchains';
    process.stdout.write(`${p.name}@${p.version}  profile: ${p.section.profile}  toolchains: ${toolchains}\n`);
  }
  process.exit(0);
}
