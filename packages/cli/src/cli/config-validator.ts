import { STRICT_RULES, VALID_BUILD_KEYS as SHARED_BUILD_KEYS } from '@tsclang/shared';

export const VALID_STRICT_RULES = new Set<string>(STRICT_RULES);

// Single source: the shared VALID_BUILD_KEYS (project manifests and platform
// package `platform.builds` presets validate against the same set — the sdk
// key had drifted between the two copies before this re-export)
export const VALID_BUILD_KEYS = SHARED_BUILD_KEYS;

export function validateStrictRules(rules: unknown, source: string): string | null {
  if (!Array.isArray(rules)) {
    return `'strict' must be an array of strings`;
  }
  for (const rule of rules) {
    if (typeof rule !== 'string' || !VALID_STRICT_RULES.has(rule)) {
      return `unknown strict rule '${rule}' in ${source}; valid: ${[...VALID_STRICT_RULES].join(', ')}`;
    }
  }
  return null;
}

export function validateBuildKeys(buildCfg: Record<string, unknown>, buildName: string): string | null {
  for (const key of Object.keys(buildCfg)) {
    if (!VALID_BUILD_KEYS.has(key)) {
      return `unknown key '${key}' in builds.${buildName}`;
    }
  }
  return null;
}
