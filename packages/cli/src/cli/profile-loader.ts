import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { parsePlatformDecl } from '@tsclang/compiler';
import type { Capabilities } from '@tsclang/compiler';
import { PACKAGES_DIR } from '@tsclang/shared';

export type { Capabilities };


export function loadProfile(name: string, profilesDir: string, inputFile?: string): Capabilities | null {
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

  const pkgDir = name.startsWith("@") ? name : null;
  if (pkgDir) {
    const pkgDts = join(inputFile ? dirname(resolve(inputFile)) : process.cwd(), PACKAGES_DIR, pkgDir, "index.d.tsc");
    if (existsSync(pkgDts)) {
      try { return parsePlatformDecl(readFileSync(pkgDts, "utf8"), pkgDts); } catch { return null; }
    }
  }

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