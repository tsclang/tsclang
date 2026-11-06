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

// --- CLI surface registry: which options each command accepts (#244) ---
// Drives both the unknown-option check and the universal `--help` dispatch.
// Keep in sync with the per-command parsers in cli/commands/*.

const GLOBAL_FLAGS = new Set(['--no-color', '--version', '-v', '--help', '-h']);

export const COMMAND_FLAGS: Record<string, Set<string>> = {
  build: new Set(['--emit', '--outDir', '--all-errors', '--debug', '--no-cache', '--sourcemap',
    '--watch', '-w', '--optimize', '--target', '--default-number', '--allocator', '--async',
    '--strict', '--ram-size', '--stack-size', '--platform', '--build', '--mcu']),
  run: new Set(['--optimize', '--no-cache']),
  debug: new Set(),
  init: new Set(['--type', '--library', '-l', '--declaration', '-d', '--platform', '-p']),
  'build-cmake': new Set(['--build']),
  lint: new Set(['--fix']),
  format: new Set(),
  'emit-dts': new Set(),
  explain: new Set(),
  'validate-config': new Set(),
  install: new Set(['--production']),
  update: new Set(),
  search: new Set(),
  publish: new Set(),
  lsp: new Set(),
  test: new Set(),
};

export function isKnownCommand(command: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMAND_FLAGS, command);
}

/**
 * Validate that every option-looking token is a known option of `command`.
 * Returns an error message, or null when everything is recognized.
 * Tokens after `--` (run's program arguments) are not CLI options and are skipped.
 * The only inline `--opt=value` form is lint's `--rule=<name>`.
 */
export function checkUnknownFlags(args: string[], command: string): string | null {
  const known = COMMAND_FLAGS[command];
  if (!known) return null; // unknown commands are reported by the dispatcher
  const sepIdx = command === 'run' ? args.indexOf('--') : -1;
  const end = sepIdx === -1 ? args.length : sepIdx;
  for (let i = 1; i < end; i++) {
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
