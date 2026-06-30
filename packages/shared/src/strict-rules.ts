export const STRICT_RULES = [
  'no-any',
  'no-unsafe',
  'no-native',
  'safe-math',
  'no-lossy-cast',
  'no-dynamic-alloc',
  'no-closures',
  'no-sort',
  'no-threads',
  'no-interfaces',
  'no-abort',
  'no-i64-print',
  'switch-default',
] as const;

export type StrictRule = typeof STRICT_RULES[number];
