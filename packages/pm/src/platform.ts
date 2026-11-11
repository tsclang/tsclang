import { VALID_BUILD_KEYS } from '@tsclang/shared';

// Platform package distribution section (`platform` in tsc.package.json of a
// `type: "platform"` package, epic #260). The same key means exactly one thing:
// a toolchain distribution + build/script presets for the host project. Project
// toolchain pinning lives in `builds.<n>.toolchain` (spec 13-build.md).

export interface PlatformDownload {
  url: string;
  sha256: string;
  /** Archive size in MB — shown in the download consent prompt */
  size?: number;
}

export interface PlatformToolchain {
  version: string;
  downloads: Record<string, PlatformDownload>;
}

export interface PlatformSection {
  /** Profile name the package provides/overrides (its own index.d.tsc) */
  profile: string;
  toolchains?: Record<string, PlatformToolchain>;
  builds: Record<string, Record<string, unknown>>;
  scripts?: Record<string, string>;
}

const SHA256_RE = /^[0-9a-fA-F]{64}$/;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

// Schema validation for the platform section. Returns a ready-to-print error
// message or null. The type <-> section pairing is enforced by the manifest
// diagnostics (cli/commands/config.ts), not here.
export function validatePlatformSection(platform: unknown): string | null {
  if (!isPlainObject(platform)) {
    return `'platform' section must be an object, got ${JSON.stringify(platform)}`;
  }

  if (typeof platform.profile !== 'string' || !platform.profile.trim()) {
    return `'platform.profile' must be a non-empty string, got ${JSON.stringify(platform.profile)}`;
  }

  if (platform.toolchains !== undefined) {
    if (!isPlainObject(platform.toolchains)) {
      return `'platform.toolchains' must be an object, got ${JSON.stringify(platform.toolchains)}`;
    }
    for (const [tcName, tcRaw] of Object.entries(platform.toolchains)) {
      if (!isPlainObject(tcRaw)) {
        return `'platform.toolchains.${tcName}' must be an object`;
      }
      const tc = tcRaw as unknown as PlatformToolchain;
      if (typeof tc.version !== 'string' || !tc.version.trim()) {
        return `'platform.toolchains.${tcName}.version' must be a non-empty string, got ${JSON.stringify(tc.version)}`;
      }
      if (!isPlainObject(tc.downloads) || Object.keys(tc.downloads).length === 0) {
        return `'platform.toolchains.${tcName}.downloads' must have at least one download (os-arch → url/sha256)`;
      }
      for (const [osArch, dlRaw] of Object.entries(tc.downloads)) {
        if (!isPlainObject(dlRaw)) {
          return `'platform.toolchains.${tcName}.downloads.${osArch}' must be an object`;
        }
        const dl = dlRaw as unknown as PlatformDownload;
        if (typeof dl.url !== 'string' || !/^https?:\/\//.test(dl.url)) {
          return `'platform.toolchains.${tcName}.downloads.${osArch}.url' must be a string (http/https URL), got ${JSON.stringify(dl.url)}`;
        }
        if (typeof dl.sha256 !== 'string' || !SHA256_RE.test(dl.sha256)) {
          return `'platform.toolchains.${tcName}.downloads.${osArch}.sha256' must be 64 hex characters, got ${JSON.stringify(dl.sha256)}`;
        }
        if (dl.size !== undefined && (typeof dl.size !== 'number' || dl.size <= 0)) {
          return `'platform.toolchains.${tcName}.downloads.${osArch}.size' must be a positive number (MB), got ${JSON.stringify(dl.size)}`;
        }
      }
    }
  }

  if (!isPlainObject(platform.builds) || Object.keys(platform.builds).length === 0) {
    return `'platform.builds' must have at least one build preset, got ${JSON.stringify(platform.builds)}`;
  }
  for (const [name, cfgRaw] of Object.entries(platform.builds)) {
    if (!isPlainObject(cfgRaw)) {
      return `'platform.builds.${name}' must be an object`;
    }
    for (const key of Object.keys(cfgRaw)) {
      if (!VALID_BUILD_KEYS.has(key)) {
        return `unknown key '${key}' in platform.builds.${name}`;
      }
    }
  }

  if (platform.scripts !== undefined) {
    if (!isPlainObject(platform.scripts)) {
      return `'platform.scripts' must be an object, got ${JSON.stringify(platform.scripts)}`;
    }
    for (const [name, cmd] of Object.entries(platform.scripts)) {
      if (typeof cmd !== 'string' || !cmd.trim()) {
        return `platform.scripts.${name} must be a non-empty string, got ${JSON.stringify(cmd)}`;
      }
    }
  }

  return null;
}

// Extracts a profile name from a package name: scope is dropped
// (`@someuser/cpc` → `cpc`, `plain` → `plain`).
export function profileNameFromPackage(pkgName: string): string {
  const at = pkgName.lastIndexOf('/');
  return at === -1 ? pkgName : pkgName.slice(at + 1);
}
