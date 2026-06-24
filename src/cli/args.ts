export function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function hasFlagAny(args: string[], ...names: string[]): boolean {
  return names.some((n) => args.includes(n));
}

export function getPositional(args: string[], command: string): string | undefined {
  return args.find((a) => !a.startsWith('-') && a !== command);
}

export function getPositionalAfter(args: string[], marker: string): string[] {
  const i = args.indexOf(marker);
  return i !== -1 ? args.slice(i + 1) : [];
}

const OPTIMIZE_RE = /^O[0-3sz]$/;

export function isValidOptimizeLevel(val: string): boolean {
  return OPTIMIZE_RE.test(val);
}

const VALID_NUMBER_TYPES = new Set([
  'i8', 'i16', 'i32', 'i64',
  'u8', 'u16', 'u32', 'u64',
  'f32', 'f64',
]);

export function isValidNumberType(val: string): boolean {
  return VALID_NUMBER_TYPES.has(val);
}

export const NUMBER_TYPES = [...VALID_NUMBER_TYPES];
