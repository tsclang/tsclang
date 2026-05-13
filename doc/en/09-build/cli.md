# CLI Commands

[← Up](./index.md) | [Next →](./packages.md) | [Previous ←](./config.md)

---

The TSClang command line is the primary interface for creating, building, and running projects. All commands are available through the global CLI `tsclang`.

## Overview

| Command | Alias | Description |
|---------|-------|-------------|
| `tsclang init` | — | Create a new project |
| `tsclang build` | `b` | Build the project |
| `tsclang run` | — | Build and run |
| `tsclang dev` | — | Watch mode |
| `tsclang install` | `i` | Install dependencies |
| `tsclang update` | `u` | Update dependencies |
| `tsclang remove` | `r` | Remove a dependency |
| `tsclang clean` | `c` | Remove build artifacts |
| `tsclang lint` | `l` | Check formatting |
| `tsclang migrate` | — | TypeScript → TSClang migration *(roadmap)* |
| `tsclang debug` | — | DAP server *(roadmap)* |
| `tsclang lsp` | — | Language Server Protocol *(roadmap)* |

```bash
tsclang b                     # = tsclang build
tsclang i                     # = tsclang install
tsclang i @tsc/sqlite3 -d     # add dev dependency
tsclang u                     # = tsclang update
tsclang r @tsc/sqlite3        # = tsclang remove
tsclang l -f                  # format
```

## tsclang build

Compile `.tsc` → C99 → binary via CMake.

```bash
tsclang build                 # build default build
tsclang build <name>          # build specific build
tsclang build hello.tsc       # single file → binary
```

### Flags

| Flag | Description |
|------|-------------|
| `--emit c` | C files only |
| `--emit binary` | C + compile to binary |
| `--emit hex` | C + avr-gcc → `.hex` |
| `--emit lib` | Generate `.a`/`.so` |
| `--outDir <path>` | Override outDir |
| `--target <target>` | Target platform |
| `--profile <name>` | Platform profile |
| `--optimize <level>` | `O0`, `O1`, `O2`, `O3`, `Os` |
| `--clean` | Full rebuild (clear cache) |

```bash
tsclang build --emit c        # C generation only
tsclang build --emit binary   # C + compile to binary
tsclang build --emit hex      # C + avr-gcc → .hex
tsclang build --outDir ./dist # override outDir
tsclang build --target avr    # build for AVR
tsclang build --optimize O2   # optimization level O2
tsclang build --clean         # full rebuild
```

- If build is not specified — uses `"desktop"` or the first one in the list
- CLI parameters override settings from `tsc.package.json`

## tsclang run

Build + run the compiled binary. Only for `emit: "binary"`.

```bash
tsclang run                   # build default + run
tsclang run <name>            # build specific + run
tsclang run -- --foo bar      # pass arguments to binary
```

```
tsclang run
  │
  ├─ 1. tsclang build        ← compiles .tsc → .c → binary
  └─ 2. exec <outDir>/myapp  ← runs binary, stdout/stderr to terminal
```

- If `emit` is not `"binary"` — error: `error: tsclang run requires emit: "binary"`
- Binary exit code is forwarded as `tsclang run` exit code
- Arguments after `--` are passed directly:

```bash
tsclang run -- --port 8080 --verbose
# runs: ./build/desktop/myapp --port 8080 --verbose
```

## tsclang dev

Build in Hot Reload / Hot Restart mode. Arguments are identical to `tsclang run`.

```bash
tsclang dev                   # start watch mode
tsclang dev <name>            # specific build
```

**Workflow:**
1. `tsclang dev` compiles and runs the project
2. Developer saves a file in the IDE
3. Change detected → incremental rebuild → restart

| Platform | Behavior |
|----------|----------|
| Desktop | kill old process + start new one |
| Embedded | rebuild + automatic flash (avrdude/openocd) |

- File watcher: inotify (Linux), FSEvents (macOS), ReadDirectoryChangesW (Windows)
- Incremental build — rebuilds only changed files

## tsclang init

Create a new project with minimal structure.

```bash
tsclang init myapp                    # executable
tsclang init mylib --library          # TSClang library
tsclang init sqlite3 --declaration    # C-wrapper
```

Short flags:

```bash
tsclang init mylib -l      # TSClang library
tsclang init sqlite3 -d    # C-wrapper
```

| Flag | Short | What it creates |
|------|-------|-----------------|
| (no flag) | — | executable |
| `--library` | `-l` | TSClang library |
| `--declaration` | `-d` | C-wrapper |

Without arguments — creates project in the current directory.

`tsclang init myapp` creates:

```
myapp/
  src/
    main.tsc
  tsc.package.json
```

Minimal `tsc.package.json`:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc",
  "builds": {
    "desktop": { "emit": "binary", "outDir": "build/desktop" }
  }
}
```

## tsclang lint

Check formatting and code style.

```bash
tsclang lint                  # check all files
tsclang lint -f               # format (fix)
tsclang lint --check          # CI mode: exit 1 if issues
```

## tsclang migrate *(roadmap)*

Tool for one-time migration of a TypeScript project to TSClang.

```bash
tsclang migrate [path]           # dry-run — show what will change
tsclang migrate [path] --fix     # apply changes in place
tsclang migrate [path] --check   # CI mode: exit 1 if incompatibilities
```

`path` — file, directory, or glob. Defaults to current directory.

**Automatic transformations:**

| Transformation | Example |
|---------------|---------|
| `undefined` → `null` | `x === undefined` → `x == null` |
| `throw "msg"` → `throw new Error("msg")` | everywhere |
| `export default X` → `export { X }` | everywhere |
| `x === y` → `x == y` | everywhere |
| `x !== y` → `x != y` | everywhere |
| Renaming `.ts` → `.tsc` | `user.ts` → `user.tsc` |

**Requires manual editing** (output via `--check`):
- Class inheritance (`extends`)
- `s[i]` string indexing
- `for (let x of arr)` — element type analysis
- `number` → concrete numeric type
- Ownership annotations

**Dry-run output:**

```
tsclang migrate ./src

  src/user.ts → src/user.tsc
    line 12: throw "not found"  →  throw new Error("not found")
    line 34: x === undefined    →  x == null
    line 67: export default User  →  export { User }

  Manual review required (2 files):
    src/base.ts:15  — class Dog extends Animal (inheritance)
    src/parser.ts:8 — s[i] string indexing

  3 files to transform, 2 require manual review.
  Run with --fix to apply automatic changes.
```

## tsclang lsp *(roadmap)*

LSP server for IDE integration (VS Code, JetBrains, Neovim).

```bash
tsclang lsp              # start LSP server (stdio transport)
tsclang lsp --port 7777  # TCP transport
```

| Feature | Description |
|---------|-------------|
| Completions | Autocomplete by types, methods, imports |
| Hover | Expression type, documentation |
| Go-to-definition | Jump to declaration |
| Find references | Find usages |
| Diagnostics | Real-time errors and warnings |
| Rename | Symbol renaming |
| Format | Formatting via `tsclang lint --fix` |

**Error recovery:** LSP mode continues working despite syntax errors — parser inserts `ErrorNode` into AST and resynchronizes at the nearest boundary (`}`, `;`, `class`, `function`).

## tsclang clean

Remove build artifacts:

```bash
tsclang clean                 # remove outDir
tsclang clean --all           # remove everything: outDir + cache
```

## C-output

Full build example `tsclang build`:

```
build/desktop/
  c/
    main.c          ← generated from src/main.tsc
    user.c          ← generated from src/user.tsc
    user.h          ← forward declarations
  CMakeLists.txt    ← generated automatically
  myapp             ← compiled binary
```

## Errors

| Error | Cause |
|-------|-------|
| `tsclang run requires emit: "binary"` | `run` with `emit: "hex"` or `emit: "c"` |
| `cannot determine entry point` | Executable without `"main"` |
| `build 'avr' not found in builds` | Specified non-existent build |
| `toolchain 'avr-gcc' not found in PATH` | Compiler not installed |
| `main file not found` | File from `"main"` does not exist |

## See also

- [Configuration](./config.md) — `tsc.package.json` fields, builds
- [Package manager](./packages.md) — install, update, remove
- [Embedded build](./embedded.md) — AVR, ARM, retro platforms
- [CMake](./cmake.md) — CMakeLists.txt, profiles
