export const help = `tsclang {version} — TypeScript-like language that compiles to C

USAGE:
  tsclang <command> [options]

COMMANDS:
  build            Compile .tsc to C or binary
  run              Compile and run
  test             Run tests in test/ directory
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
