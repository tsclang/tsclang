import { PACKAGE_FILE } from '@tsclang/shared';

export const help = `tsclang {version} — TypeScript-like language that compiles to C

USAGE:
  tsclang <command> [options]

COMMANDS:
  build (b)        Compile .tsc to C or binary
  run              Run a named script from tsc.package.json
  debug            Debug a .tsc program
  test (t)         Run tests in test/ directory
  init             Create a new project
  lint (l)         Run linter
  format           Format source code
  explain          Explain an error code
  emit-dts         Generate .d.tsc declaration files
  lsp              Start Language Server
  validate-config  Validate ${PACKAGE_FILE}
  install (i)      Install a package
  update (u)       Update lock file
  remove (r)       Remove a package
  search (s)       Search packages
  publish (p)      Publish a package

OPTIONS:
  --version, -v    Print version
  --help, -h       Print this help
  --no-color       Disable colored output

Run 'tsclang <command> --help' for command-specific options.`;
