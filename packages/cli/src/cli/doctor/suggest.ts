// Diff a manifest against its packageGenerate preset: which builds/scripts
// entries the project's `type` is supposed to have but doesn't. Doctor turns
// the result into a `[!] ... missing` warning and a fix offer.

import { packageGenerate } from '@tsclang/pm';

export interface ManifestAdditions {
  preset: 'desktop' | 'avr';
  builds: Record<string, unknown>;
  scripts: Record<string, string>;
}

function presetFor(pkg: Record<string, unknown>): 'desktop' | 'avr' {
  const builds = pkg.builds as Record<string, Record<string, unknown>> | undefined;
  if (builds) {
    for (const cfg of Object.values(builds)) {
      if (cfg && typeof cfg === 'object'
        && (cfg.emit === 'flash' || cfg.emit === 'hex' || cfg.profile === 'avr' || cfg.mcu)) {
        return 'avr';
      }
    }
  }
  return 'desktop';
}

/**
 * Missing preset entries for the manifest, or null when the manifest already
 * carries everything its type prescribes (or the type has no preset at all —
 * declaration/platform/package).
 */
export function suggestManifestAdditions(pkg: Record<string, unknown>): ManifestAdditions | null {
  const type = pkg.type;
  if (type !== 'executable' && type !== 'library') return null;
  const preset = presetFor(pkg);
  const gen = packageGenerate(String(pkg.name ?? 'app'), type, preset) as unknown as {
    builds?: Record<string, unknown>;
    scripts?: Record<string, string>;
  };
  const existingBuilds = (pkg.builds as Record<string, unknown>) ?? {};
  const existingScripts = (pkg.scripts as Record<string, string>) ?? {};

  const builds: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(gen.builds ?? {})) {
    if (!(key in existingBuilds)) builds[key] = val;
  }
  const scripts: Record<string, string> = {};
  for (const [key, val] of Object.entries(gen.scripts ?? {})) {
    if (!(key in existingScripts)) scripts[key] = val;
  }
  if (!Object.keys(builds).length && !Object.keys(scripts).length) return null;
  return { preset, builds, scripts };
}
