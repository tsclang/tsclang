import { EMIT_VALUES, STRICT_RULES, PACKAGE_FILE } from "@tsclang/shared";

const emitOptions = EMIT_VALUES.join('|');
const strictOptions = STRICT_RULES.join(',');

export const build = `tsclang build — Compile .tsc to C or binary

USAGE:
  tsclang build <input.tsc> [options]

OPTIONS:
  --emit <${emitOptions}>  Output format (default: c)
  --outDir <dir>           Output directory (default: .)
  --target <name>          Target platform (desktop, avr, nes, wasm, ...)
  --platform <profile>     Use built-in profile (avr, nes, wasm, desktop, ...)
  --build <name>           Use named build from ${PACKAGE_FILE}
  --mcu <chip>             Target MCU (e.g. atmega328p, atmega2560)
  --default-number <type>  Default number type (f64, f32, i32, ...)
  --allocator <type>       Allocator strategy (heap, static)
  --async <type>           Async model (libuv, state_machine, none)
  --optimize <O0-O3|Os|Oz> Optimization level
  --debug                  Compile with debug info
  --sourcemap              Generate source map
  --all-errors             Show all errors (no limit)
  --strict <rules>         Comma-separated strict rules (${strictOptions})
  --watch, -w              Rebuild on file change
  --no-cache               Bypass compilation cache`;
