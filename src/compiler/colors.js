// TSClang ANSI color helpers.
// Colors are enabled based on TTY detection + env vars at module load time.
// Call setColorEnabled(false) to disable (e.g. from --no-color CLI flag).

let _enabled = !!(
  process.stderr.isTTY
  && process.env.NO_COLOR === undefined
  && process.env.TERM !== 'dumb'
);

export const setColorEnabled = (b) => { _enabled = b; };
export const isColorEnabled  = ()  => _enabled;

// style(...ansiCodes)(str) — wraps str in ANSI escape; passes through when disabled.
// Multiple codes are combined: style(1, 31) → '\x1b[1;31m...\x1b[0m' (bold red)
const style = (...codes) => (s) =>
  _enabled ? `\x1b[${codes.join(';')}m${s}\x1b[0m` : s;

export const bold    = style(1);         // bold white — message text
export const boldRed = style(1, 31);     // bold red   — error label, primary ^
export const yellow  = style(1, 33);     // bold yellow — secondary span -, warnings
export const green   = style(1, 32);     // bold green — = help:
export const cyan    = style(36);        // cyan       -- -->, |, line numbers, = note:
export const dim     = style(2);         // dim        — ... gap markers

// makeColors(enabled) — returns a frozen set of color functions with a fixed
// enabled state. Useful for renderDiagnostic's opts.color override.
export function makeColors(enabled) {
  const mk = (...codes) => (s) =>
    enabled ? `\x1b[${codes.join(';')}m${s}\x1b[0m` : s;
  return {
    bold:    mk(1),
    boldRed: mk(1, 31),
    yellow:  mk(1, 33),
    green:   mk(1, 32),
    cyan:    mk(36),
    dim:     mk(2),
  };
}
