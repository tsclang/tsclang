import { OPTIMIZE_LEVELS, NUMBER_TYPES } from '@tsclang/shared';

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

const OPTIMIZE_SET = new Set<string>(OPTIMIZE_LEVELS);

export function isValidOptimizeLevel(val: string): boolean {
  return OPTIMIZE_SET.has(val);
}

const VALID_NUMBER_TYPES = new Set<string>(NUMBER_TYPES);

export function isValidNumberType(val: string): boolean {
  return VALID_NUMBER_TYPES.has(val);
}
