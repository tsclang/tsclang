import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PACKAGES_DIR } from '@tsclang/shared';
import { loadCatalog, filterCatalog, CatalogError } from '@tsclang/pm';
import type { PlatformSection } from '@tsclang/pm';
import { hasFlag } from '../args.js';

// `tsclang platform <sub>` — nested command group (#265). The dispatcher
// validates the subcommand and its flags before calling here. search/list
// landed in #266; install lands in #267, remove in #268 (explicit stubs).

export const PLATFORM_SUBCOMMANDS = ['install', 'search', 'remove', 'list'] as const;

export async function runPlatformCommand(sub: string, restArgs: string[]): Promise<void> {
  switch (sub) {
    case 'search': return runPlatformSearch(restArgs);
    case 'list':   return runPlatformList();
    default:
      // install/remove stubs — honest refusal until #267/#268 land.
      console.error(`tsclang: platform ${sub} is not implemented yet`);
      process.exit(1);
  }
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
