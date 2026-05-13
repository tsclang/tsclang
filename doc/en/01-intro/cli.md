# CLI — Command Overview

[← Up](./index.md) | [Previous ←](./quick-start.md)

---

## Command List

| Command | Alias | Description |
|---------|-------|-------------|
| `tsclang init` | — | Create new project |
| `tsclang build` | `b` | Build project |
| `tsclang run` | `r` | Build and run |
| `tsclang lint` | `l` | Check formatting |
| `tsclang migrate` | — | TypeScript → TSClang migration *(roadmap)* |
| `tsclang lsp` | — | Language Server Protocol for IDE *(roadmap)* |

Aliases:

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

Creates a project from template.

```bash
tsclang init myapp                    # executable (default)
tsclang init mylib --library          # TSClang library
tsclang init sqlite3 --declaration    # C-wrapper (wrapper over C library)
tsclang init                          # in current directory
```

Short flags: `-l` (library), `-d` (declaration).

## tsclang build

Compiles `.tsc` → `.c` → binary (by default).

```bash
tsclang build                  # build default build
tsclang build <name>           # build specific build from configuration
tsclang build hello.tsc        # single file
tsclang build --emit c         # C generation only
tsclang build --emit binary    # C + compile to binary (default)
tsclang build --emit hex       # C + avr-gcc → .hex (for AVR)
tsclang build --outDir ./dist  # override outDir
tsclang build --target desktop # explicitly specify target
tsclang build --clean          # full rebuild (no cache)
```

## tsclang run

Builds and runs the binary. Equivalent to `tsclang build` + run.

```bash
tsclang run
tsclang run -- args...         # pass arguments to program
```

Only for `emit: "binary"`.

## tsclang lint

Checks code style. For CI — `tsclang lint` (without `-fix`) returns exit code 1 on violations.

```bash
tsclang lint          # check without changes
tsclang lint --fix    # format code in place (like prettier / gofmt)
```

Difference from `tsclang build`:

| Command | What it checks |
|---------|---------------|
| `tsclang build` | Semantic errors, formatting ignored |
| `tsclang lint` | Semantics + style warnings, exit 1 on violations |
| `tsclang lint --fix` | Formats code automatically |

## tsclang migrate *(roadmap)*

TypeScript code migration to TSClang.

```bash
tsclang migrate ./src            # show what will change (dry-run)
tsclang migrate ./src --fix      # apply changes
tsclang migrate ./src --check    # CI mode: exit 1 if incompatibilities exist
```

## tsclang lsp *(roadmap)*

Language Server Protocol for IDE (VS Code, Neovim, etc.).

```bash
tsclang lsp               # stdio transport
tsclang lsp --port 7777   # TCP transport
```

## See also

- [Quick Start](./quick-start.md) — installation and first project
- [Build System](../09-build/index.md) — configuration, profiles, platforms
- [Migration Guide](../12-migration/index.md) — porting TS code
