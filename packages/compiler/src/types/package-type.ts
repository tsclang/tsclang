export const PACKAGE_TYPE_VALUES = ['executable', 'declaration', 'library', 'platform'] as const;

export type PackageType = typeof PACKAGE_TYPE_VALUES[number];
