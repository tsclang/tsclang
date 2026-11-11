import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { parsePlatformDecl } from '@tsclang/compiler';
import type { Capabilities } from '@tsclang/compiler';
import { PACKAGES_DIR } from '@tsclang/shared';
import { OFFICIAL_PLATFORM_SCOPE } from '@tsclang/pm';

export type { Capabilities };

/**
 * Resolve a platform profile installed in the project's tsc_packages.
 *
 * Platforms are packages first (epic #260): a package profile OVERRIDES the
 * built-in profile of the same name — without this a platform package could
 * never shadow a built-in profile.
 *
 *  - `@scope/name` resolves to tsc_packages/@scope/name/index.d.tsc (exact);
 *  - a bare name resolves to any installed platform package whose
 *    `platform.profile` equals the name. If several packages claim the same
 *    profile name, the official `@tsclang/*` scope wins, then the rest in
 *    sorted order — deterministic across machines.
 *
 * Returns the index.d.tsc path or null when no package claims the name.
 */
export function findPackageProfile(name: string, baseDir: string): string | null {
  const pkgsRoot = join(baseDir, PACKAGES_DIR);

  if (name.startsWith('@')) {
    const p = join(pkgsRoot, name, 'index.d.tsc');
    return existsSync(p) ? p : null;
  }
  if (!existsSync(pkgsRoot)) return null;

  const candidates: string[] = [];
  for (const entry of readdirSync(pkgsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('@')) {
      const scopeDir = join(pkgsRoot, entry.name);
      for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
        if (sub.isDirectory()) candidates.push(join(scopeDir, sub.name));
      }
    } else {
      candidates.push(join(pkgsRoot, entry.name));
    }
  }

  const matches = candidates.filter((dir) => {
    const manifestPath = join(dir, 'tsc.package.json');
    if (!existsSync(manifestPath)) return false;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      return manifest?.platform?.profile === name && existsSync(join(dir, 'index.d.tsc'));
    } catch { return false; }
  });

  const isOfficial = (p: string) => (p.split(/[\\/]/).includes(`@${OFFICIAL_PLATFORM_SCOPE}`) ? 0 : 1);
  matches.sort((a, b) => isOfficial(a) - isOfficial(b) || a.localeCompare(b));
  return matches.length > 0 ? join(matches[0], 'index.d.tsc') : null;
}

export function loadProfile(name: string, profilesDir: string, inputFile?: string): Capabilities | null {
  // 1. tsc_packages platform packages override built-ins (epic #260).
  const baseDir = inputFile ? dirname(resolve(inputFile)) : process.cwd();
  const pkgProfile = findPackageProfile(name, baseDir);
  if (pkgProfile) {
    try { return parsePlatformDecl(readFileSync(pkgProfile, 'utf8'), pkgProfile); } catch { return null; }
  }

  // 2. Built-in profiles shipped with the compiler.
  const newDtsPath = join(profilesDir, name, "index.d.tsc");
  const dtsPath = join(profilesDir, name + ".d.tsc");
  const jsonPath = join(profilesDir, name + ".json");
  if (existsSync(newDtsPath)) {
    try { return parsePlatformDecl(readFileSync(newDtsPath, "utf8"), newDtsPath); } catch { return null; }
  }
  if (existsSync(dtsPath)) {
    try { return parsePlatformDecl(readFileSync(dtsPath, "utf8"), dtsPath); } catch { return null; }
  }
  if (existsSync(jsonPath)) {
    try { return JSON.parse(readFileSync(jsonPath, "utf8")); } catch { return null; }
  }

  // 3. Explicit local file path.
  if (name.endsWith(".d.tsc") || name.endsWith(".json")) {
    const localPath = resolve(name);
    if (existsSync(localPath)) {
      try {
        if (name.endsWith(".d.tsc")) return parsePlatformDecl(readFileSync(localPath, "utf8"), localPath);
        return JSON.parse(readFileSync(localPath, "utf8"));
      } catch { return null; }
    }
  }

  return null;
}

export function listAvailableProfiles(profilesDir: string): string[] {
  const entries = readdirSync(profilesDir, { withFileTypes: true });
  const names: string[] = [];
  for (const e of entries) {
    if (e.isDirectory() && existsSync(join(profilesDir, e.name, "index.d.tsc"))) {
      names.push(e.name);
    } else if (e.isFile() && (e.name.endsWith(".d.tsc") || e.name.endsWith(".json"))) {
      names.push(e.name.replace(/\.(d\.tsc|json)$/, ""));
    }
  }
  return [...new Set(names)];
}
