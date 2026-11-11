import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { PACKAGES_DIR } from '@tsclang/shared';
import {
  loadCatalog, filterCatalog, CatalogError,
  platformNames, validatePlatformSection,
  planPlatformApply, applyPlatformPlan, ownershipFromPlan, planPlatformRemoval,
  fetchPackageArchive, extractTspkg, packageNameParts,
  readLock, writeLock, ensureManifest, writeManifest, readManifest,
  decideToolchain, detectSystemCommand, downloadToolchain, platformToolchainDir,
  readConsent, writeConsent, selectDownload, toolchainInstructions, userHome,
} from '@tsclang/pm';
import type { PlatformSection, PlatformApplyPlan, PlanAction } from '@tsclang/pm';
import { hasFlag } from '../args.js';
import { askYesNo } from '../doctor/prompt.js';

// `tsclang platform <sub>` — nested command group (#265). The dispatcher
// validates the subcommand and its flags before calling here. search/list
// landed in #266, install in #267, remove in #268.

export const PLATFORM_SUBCOMMANDS = ['install', 'search', 'remove', 'list'] as const;

export async function runPlatformCommand(sub: string, restArgs: string[]): Promise<void> {
  switch (sub) {
    case 'install': return runPlatformInstall(restArgs);
    case 'search':  return runPlatformSearch(restArgs);
    case 'remove':  return runPlatformRemove(restArgs);
    case 'list':    return runPlatformList();
  }
}

// ── platform install ────────────────────────────────────────────────────────

export interface PlatformArchive {
  name: string;
  version: string;
  files: Record<string, string>;
  platform: PlatformSection;
  location: string;
  integrity: string;
}

/** Resolve a platform package from the registry and validate it: catalog
 * entry → archive fetch → manifest → platform section. Shared by
 * `platform install` and the first-run wizard (#274; the wizard only reads
 * the toolchain section — machine-level, no project manifest writes). */
export async function fetchPlatformArchive(
  name: string,
  opts: { registry?: string; offline?: boolean } = {},
): Promise<PlatformArchive> {
  let packages;
  try {
    const { catalog } = await loadCatalog({ registry: opts.registry ?? process.env.TSC_REGISTRY, offline: opts.offline });
    packages = catalog.packages;
  } catch (e) {
    if (e instanceof CatalogError) throw new Error(e.message);
    throw e;
  }
  const entry = packages.find((p) => p.name === name);
  if (!entry) throw new Error(`'${name}' not found in the platform registry`);
  if (entry.type !== 'platform') {
    throw new Error(`'${name}' is a ${entry.type} package, not a platform — use 'tsclang install'`);
  }
  if (!entry.location?.url) throw new Error(`registry entry for '${name}' has no download location`);

  let archiveText: string, integrity: string;
  try {
    ({ text: archiveText, integrity } = await fetchPackageArchive(entry.location, { offline: opts.offline }));
  } catch (e) {
    throw new Error((e as Error).message);
  }
  let archive: { name?: string; version?: string; files?: Record<string, string> };
  try {
    archive = JSON.parse(archiveText);
  } catch (e) {
    throw new Error(`invalid .tspkg for '${name}': ${(e as Error).message}`);
  }
  if (!archive.name || !archive.version || !archive.files) {
    throw new Error(`malformed .tspkg for '${name}' (missing name/version/files)`);
  }
  if (archive.name !== name) {
    throw new Error(`archive name mismatch — catalog says '${name}', archive says '${archive.name}'`);
  }
  let pkgManifest: { platform?: unknown };
  try {
    pkgManifest = JSON.parse(archive.files['tsc.package.json'] ?? '{}');
  } catch (e) {
    throw new Error(`package manifest is not valid JSON: ${(e as Error).message}`);
  }
  const invalid = validatePlatformSection(pkgManifest.platform);
  if (invalid) throw new Error(`package '${name}' has an invalid platform section: ${invalid}`);
  return {
    name: archive.name,
    version: archive.version,
    files: archive.files,
    platform: pkgManifest.platform as PlatformSection,
    location: entry.location.url,
    integrity,
  };
}

async function runPlatformInstall(restArgs: string[]): Promise<void> {
  const name = restArgs.find((a) => !a.startsWith('-'));
  if (!name) {
    process.stderr.write('tsclang platform install: missing <name> (usage: tsclang platform install <name>)\n');
    process.exit(1);
  }
  const offline = hasFlag(restArgs, '--offline') || !!process.env.TSC_NO_NETWORK;
  const registry = process.env.TSC_REGISTRY; // local fixture or URL override

  // A write operation fails loud: unlike search, offline/catalog errors abort.
  let fetched: PlatformArchive;
  try {
    fetched = await fetchPlatformArchive(name, { registry, offline });
  } catch (e) {
    process.stderr.write(`tsclang platform install: ${(e as Error).message}\n`);
    process.exit(1);
  }
  const archive = { name: fetched.name, version: fetched.version, files: fetched.files };
  const platform = fetched.platform;
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
    resolved: fetched.location,
    integrity: fetched.integrity,
  };
  if (Object.keys(ownership.builds ?? {}).length || Object.keys(ownership.scripts ?? {}).length) {
    lockEntry.platform = ownership;
  }
  lock.packages[archive.name] = lockEntry as never;
  writeLock(lock);

  printInstallSummary(archive.name, archive.version, platform, plan);
  await installToolchains(archive.name, archive.version, platform, offline);
  process.exit(0);
}

/** Toolchain handling after a successful platform install (#270). One line
 * per toolchain; failures degrade to a manual instruction — the platform
 * itself is already installed, a missing toolchain must not fail the run.
 * Also used by the first-run wizard (#274), which installs toolchains only. */
export async function installToolchains(
  pkgName: string, pkgVersion: string, platform: PlatformSection, offline: boolean,
): Promise<void> {
  const entries = Object.entries(platform.toolchains ?? {});
  if (!entries.length) return;
  const home = userHome();
  const consent = readConsent(home);
  const envPolicy = process.env.TSC_TOOLCHAINS === 'always' || process.env.TSC_TOOLCHAINS === 'never'
    ? (process.env.TSC_TOOLCHAINS as 'always' | 'never')
    : undefined;
  const tty = process.env.TSC_TOOLCHAIN_INTERACTIVE === '1' || process.stdin.isTTY === true;

  for (const [tcName, spec] of entries) {
    const dir = platformToolchainDir(pkgName, pkgVersion, tcName, spec.version, home);
    if (existsSync(dir)) {
      process.stdout.write(`  toolchain ${tcName}: already installed (${dir})\n`);
      continue;
    }
    const download = selectDownload(spec);
    const systemCommand = detectSystemCommand(tcName) ?? undefined;
    let decision = decideToolchain({ systemCommand, tty, consent, envPolicy, hasDownload: !!download });

    // TTY: the system toolchain is confirmed before use; declining it moves
    // on to the download question.
    if (decision.action === 'ask-system') {
      const useSystem = await askYesNo(`toolchain ${tcName}: found in PATH (${decision.command}) — use the system one?`, true);
      if (useSystem) {
        decision = { action: 'use-system', command: decision.command };
      } else {
        decision = decideToolchain({ tty, consent, envPolicy, hasDownload: !!download });
      }
    }
    if (decision.action === 'ask-download' && download) {
      const sizeNote = download.size !== undefined ? ` (~${download.size} MB)` : '';
      const yes = await askYesNo(`toolchain ${tcName}: download an isolated copy to ${join(home, '.tsclang', 'platforms')}${sizeNote}?`, true);
      writeConsent(yes ? 'yes' : 'no', home); // remembered machine-level
      decision = yes ? { action: 'download' } : { action: 'instruct' };
    }

    if (decision.action === 'use-system') {
      process.stdout.write(`  toolchain ${tcName}: using system ${decision.command} (found in PATH)\n`);
      continue;
    }
    if (decision.action === 'instruct' || !download) {
      process.stdout.write(`  toolchain ${tcName}: manual install — ${toolchainInstructions(tcName)}\n`);
      continue;
    }
    try {
      const r = await downloadToolchain({
        pkgName, pkgVersion, toolchain: tcName, spec, download, home, offline,
      });
      process.stdout.write(`  toolchain ${tcName}: downloaded to ${r.dir}\n`);
    } catch (e) {
      process.stderr.write(`tsclang: toolchain ${tcName} download failed: ${(e as Error).message}\n`);
      process.stdout.write(`  toolchain ${tcName}: manual install — ${toolchainInstructions(tcName)}\n`);
    }
  }
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
  process.stdout.write(lines.join('\n') + '\n');
}

// ── platform remove ─────────────────────────────────────────────────────────

function runPlatformRemove(restArgs: string[]): void {
  const name = restArgs.find((a) => !a.startsWith('-'));
  if (!name) {
    process.stderr.write('tsclang platform remove: missing <name> (usage: tsclang platform remove <name>)\n');
    process.exit(1);
  }
  const parts = packageNameParts(name);
  if (!parts) {
    process.stderr.write(`tsclang platform remove: invalid platform name '${name}'\n`);
    process.exit(1);
  }

  const lock = readLock();
  const lockEntry = lock.packages[name];
  const manifest = readManifest() as unknown as Record<string, unknown> | null;
  const pkgDir = join(PACKAGES_DIR, ...parts);
  const onDisk = existsSync(pkgDir);
  const depsMap = manifest?.dependencies as Record<string, unknown> | undefined;
  const inManifest = depsMap?.[name] !== undefined;

  if (!lockEntry && !onDisk && !inManifest) {
    process.stderr.write(`tsclang platform remove: '${name}' is not installed\n`);
    process.exit(1);
  }

  // Clean up only what the platform created, by lock snapshots: matching
  // entries are removed, user-edited ones stay with a warning.
  const actions = planPlatformRemoval(manifest ?? {}, lockEntry?.platform);
  const lines = [`Removed ${name}`];
  for (const action of actions as PlanAction[]) {
    const label = action.target === 'builds' ? `build ${action.key}` : `script ${action.key}`;
    if (action.kind === 'remove') {
      lines.push(`  - ${label} (platform entry removed)`);
    } else if (action.kind === 'skip' && action.reason === 'edited') {
      process.stderr.write(`tsclang: kept ${action.target}.${action.key} — you edited it (left in place)\n`);
      lines.push(`  ! ${label} kept — edited by you`);
    }
  }
  if (manifest) {
    const removals = actions.filter((a) => a.kind === 'remove');
    if (removals.length) {
      applyPlatformPlan(manifest, { actions: removals });
      for (const depMap of ['dependencies', 'devDependencies'] as const) {
        const deps = manifest[depMap] as Record<string, unknown> | undefined;
        if (deps && deps[name] !== undefined) delete deps[name];
      }
      // Don't leave empty builds/scripts/dependencies maps behind.
      for (const mapKey of ['builds', 'scripts', 'dependencies', 'devDependencies'] as const) {
        const map = manifest[mapKey] as Record<string, unknown> | undefined;
        if (map && typeof map === 'object' && Object.keys(map).length === 0) delete manifest[mapKey];
      }
      writeManifest(manifest as never);
    }
  }
  if (onDisk) rmSync(pkgDir, { recursive: true, force: true });
  if (lockEntry) {
    delete lock.packages[name];
    writeLock(lock);
  }

  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
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
