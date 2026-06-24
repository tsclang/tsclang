import { readFileSync } from 'fs';
import { join } from 'path';

export function getVersion(rootDir: string): string {
  return JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version;
}

export function getHelpText(version: string): string {
  return `tsclang ${version} — TypeScript-like language that compiles to C

USAGE:
  tsclang <command> [options]

COMMANDS:
  build            Compile .tsc to C or binary
  run              Compile and run
  init             Create a new project
  build-cmake      Generate CMakeLists.txt
  lint             Run linter
  format           Format source code
  explain          Explain an error code
  emit-dts         Generate .d.tsc declaration files
  lsp              Start Language Server
  validate-config  Validate tsc.package.json
  install          Install a package
  update           Update lock file
  search           Search packages
  publish          Publish a package

OPTIONS:
  --version, -v    Print version
  --help, -h       Print this help
  --no-color       Disable colored output
  --no-cache       Bypass compilation cache

Run 'tsclang <command> --help' for command-specific options.`;
}

export const CMD_HELP: Record<string, string> = {
  build: `tsclang build — Compile .tsc to C or binary

USAGE:
  tsclang build <input.tsc> [options]

OPTIONS:
  --emit <c|binary|hex|flash|wasm>   Output format (default: c)
  --outDir <dir>           Output directory (default: .)
  --target <name>          Target platform (desktop, avr, nes, wasm, ...)
  --platform <profile>     Use built-in profile (avr, nes, wasm, desktop, ...)
  --build <name>           Use named build from tsc.package.json
  --mcu <chip>             Target MCU (e.g. atmega328p, atmega2560)
  --default-number <type>  Default number type (f64, f32, i32, ...)
  --allocator <type>       Allocator strategy (heap, static)
  --async <type>           Async model (libuv, state_machine, none)
  --optimize <O0-O3|Os|Oz> Optimization level
  --debug                  Compile with debug info
  --sourcemap              Generate source map
  --all-errors             Show all errors (no limit)
  --strict <rules>         Comma-separated strict rules (no-any,no-unsafe,no-native,safe-math,no-lossy-cast,no-dynamic-alloc)
  --watch, -w              Rebuild on file change
  --no-cache               Bypass compilation cache`,
  run: `tsclang run — Compile and run

USAGE:
  tsclang run <input.tsc> [-- <args>...]

OPTIONS:
  --no-cache    Bypass compilation cache`,
  init: `tsclang init — Create a new project

USAGE:
  tsclang init [options]

OPTIONS:
  --type <executable|library>   Project type (default: executable)
  --library                     Shorthand for --type library`,
  lint: `tsclang lint — Run linter

USAGE:
  tsclang lint <input.tsc> [options]

OPTIONS:
  --fix          Auto-fix issues
  --rule=<name>  Run specific rule only`,
  format: `tsclang format — Format source code

USAGE:
  tsclang format <input.tsc>`,
  explain: `tsclang explain — Explain an error code

USAGE:
  tsclang explain <code>

EXAMPLE:
  tsclang explain E012`,
};
