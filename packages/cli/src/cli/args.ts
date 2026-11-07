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

// Options of each command that consume the NEXT token as their value. Needed to
// find the real positional argument when flags come first (`build --build uno`).
const VALUE_FLAGS: Record<string, Set<string>> = {
  build: new Set(['--emit', '--out-dir', '--command', '--target', '--platform', '--build',
    '--mcu', '--default-number', '--allocator', '--async', '--strict', '--optimize',
    '--ram-size', '--stack-size']),
  init: new Set(['--type']),
};

/**
 * First positional argument, skipping flags AND the values of value-taking
 * flags (unlike getPositional, which would return `c` for `--emit c hello.tsc`).
 */
export function firstPositional(args: string[], command: string): string | undefined {
  const valueFlags = VALUE_FLAGS[command];
  for (let i = 1; i < args.length; i++) {
    const tok = args[i];
    if (valueFlags?.has(tok)) { i++; continue; } // flag + its value
    if (tok.startsWith('-')) continue;           // boolean/global flag
    return tok;
  }
  return undefined;
}

const OPTIMIZE_SET = new Set<string>(OPTIMIZE_LEVELS);

export function isValidOptimizeLevel(val: string): boolean {
  return OPTIMIZE_SET.has(val);
}

const VALID_NUMBER_TYPES = new Set<string>(NUMBER_TYPES);

export function isValidNumberType(val: string): boolean {
  return VALID_NUMBER_TYPES.has(val);
}

// --- CLI surface registry: which options each command accepts (#244) ---
// Drives both the unknown-option check and the universal `--help` dispatch.
// Keep in sync with the per-command parsers in cli/commands/*.

const GLOBAL_FLAGS = new Set(['--no-color', '--version', '-v', '--help', '-h']);

export const COMMAND_FLAGS: Record<string, Set<string>> = {
  build: new Set(['--emit', '--out-dir', '--command', '--all-errors', '--debug', '--no-cache', '--sourcemap',
    '--watch', '--optimize', '--target', '--default-number', '--allocator', '--async',
    '--strict', '--ram-size', '--stack-size', '--platform', '--build', '--mcu']),
  run: new Set(),
  debug: new Set(),
  init: new Set(['--type', '--library', '-l', '--declaration', '-d', '--platform', '-p', '--avr']),
  lint: new Set(['--fix', '--format']),
  'emit-dts': new Set(),
  explain: new Set(),
  'validate-config': new Set(),
  install: new Set(['--production']),
  update: new Set(),
  remove: new Set(),
  search: new Set(),
  publish: new Set(),
  lsp: new Set(),
  test: new Set(),
};

// Single-letter command aliases — npm/pnpm/bun muscle memory (tsclang i / u / r),
// cargo b/t, npm t/s; l/p are mnemonic (no single-letter reference).
// Canonicalized by the dispatcher BEFORE flag checks and command dispatch, so
// COMMAND_FLAGS and the per-command parsers only ever see canonical names
// (getPositional skips tokens equal to the command name).
export const COMMAND_ALIASES: Record<string, string> = {
  i: 'install',
  u: 'update',
  r: 'remove',
  b: 'build',
  t: 'test',
  l: 'lint',
  s: 'search',
  p: 'publish',
};

export function isKnownCommand(command: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMAND_FLAGS, command);
}

/**
 * Validate that every option-looking token is a known option of `command`.
 * Returns an error message, or null when everything is recognized.
 * The only inline `--opt=value` form is lint's `--rule=<name>`.
 */
export function checkUnknownFlags(args: string[], command: string): string | null {
  const known = COMMAND_FLAGS[command];
  if (!known) return null; // unknown commands are reported by the dispatcher
  for (let i = 1; i < args.length; i++) {
    const tok = args[i];
    if (!tok.startsWith('-') || tok === '-') continue;
    if (GLOBAL_FLAGS.has(tok) || known.has(tok)) continue;
    const eq = tok.indexOf('=');
    const base = eq === -1 ? tok : tok.slice(0, eq);
    if (command === 'lint' && base === '--rule' && eq !== -1) continue;
    if (eq !== -1 && known.has(base)) {
      return `unknown option '${tok}' for '${command}'; option '${base}' does not support the inline '=' form; use '${base} <value>'`;
    }
    return `unknown option '${tok}' for '${command}'`;
  }
  return null;
}
