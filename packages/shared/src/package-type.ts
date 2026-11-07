// 'package' is the generic fallback type: none of the specialized behaviors
// (no entry point, no library artifacts) — for manifests that only carry
// name/version/metadata.
export const PACKAGE_TYPE_VALUES = ['executable', 'declaration', 'library', 'platform', 'package'] as const;

export type PackageType = typeof PACKAGE_TYPE_VALUES[number];
