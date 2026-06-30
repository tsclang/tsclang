import { STRICT_RULES } from '@tsclang/shared';

export const VALID_STRICT_RULES = new Set<string>(STRICT_RULES);

export const VALID_BUILD_KEYS = new Set<string>([
  'target', 'mcu', 'toolchain', 'toolchainFile', 'arch',
  'emit', 'linkerScript', 'frequency', 'freq', 'allocator', 'debug',
]);

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
