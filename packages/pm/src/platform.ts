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
    // Preset names become manifest build keys via the docker-model mapping —
    // they must be usable as a key and a path segment (no ':' etc.).
    if (!NAME_PART_RE.test(name)) {
      return `'platform.builds.${name}': invalid preset name (must match ${NAME_PART_RE}, it becomes a manifest build name)`;
    }
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
      if (!NAME_PART_RE.test(name)) {
        return `'platform.scripts.${name}': invalid script name (must match ${NAME_PART_RE}, it becomes a manifest script name)`;
      }
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

// ── Docker-model name mapping (#263) ────────────────────────────────────────
//
//   @tsclang/spectrum → build `spectrum`        script `spectrum:dev`      outDir build/spectrum
//   @someuser/cpc     → build `someuser:cpc`    script `someuser:cpc:dev`  outDir build/someuser-cpc
//
// The official scope ships without a prefix (short, first-class names); any
// other scope is prefixed with its owner. `:` is the single separator in the
// manifest and on the command line; it degrades to `-` only when a build name
// materializes as a path (NTFS forbids `:` in paths).

/** The one scope whose packages get unprefixed build names. */
export const OFFICIAL_PLATFORM_SCOPE = 'tsclang';

export interface PlatformNames {
  /** `builds.<key>` in the consumer manifest — `:`-separated */
  build: string;
  /** Manifest key for ANY package-internal preset name (multi-preset
   *  packages map each internal name with the same scope rule). */
  key(internal: string): string;
  /** `scripts.<key>` for a package-internal script name */
  script(name: string): string;
  /** Default output dir relative to the consumer root (`:` → `-`). An explicit
   *  `outDir` from the package preset is honored as-is and never re-converted. */
  outDir: string;
}

// Each part (scope / name / preset name) must be usable as a manifest key and
// a path segment.
export const NAME_PART_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Map a platform package name to its build/script/outDir names, or null when
 * the package name cannot produce a valid build key. Pure — no fs, no throw.
 */
export function platformNames(pkgName: string): PlatformNames | null {
  if (typeof pkgName !== 'string' || pkgName.length === 0) return null;
  const slash = pkgName.indexOf('/');
  if (slash === -1) {
    if (!NAME_PART_RE.test(pkgName)) return null;
    const build = pkgName;
    const key = (internal: string): string => {
      if (!NAME_PART_RE.test(internal)) throw new Error(`invalid platform preset name '${internal}' of '${pkgName}'`);
      return internal;
    };
    return { build, key, script: (s) => `${build}:${s}`, outDir: `build/${build}` };
  }
  // Exactly one slash: @scope/name. Anything deeper is not a package name.
  if (slash !== pkgName.lastIndexOf('/')) return null;
  const scope = pkgName.slice(0, slash);
  const name = pkgName.slice(slash + 1);
  if (!scope.startsWith('@')) return null;
  if (!NAME_PART_RE.test(scope.slice(1)) || !NAME_PART_RE.test(name)) return null;
  const build = scope === `@${OFFICIAL_PLATFORM_SCOPE}` ? name : `${scope.slice(1)}:${name}`;
  const key = (internal: string): string => {
    if (!NAME_PART_RE.test(internal)) throw new Error(`invalid platform preset name '${internal}' of '${pkgName}'`);
    return scope === `@${OFFICIAL_PLATFORM_SCOPE}` ? internal : `${scope.slice(1)}:${internal}`;
  };
  return { build, key, script: (s) => `${build}:${s}`, outDir: `build/${build.replace(/:/g, '-')}` };
}
