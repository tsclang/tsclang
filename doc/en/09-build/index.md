# Build System

[← Up](../index.md) | [Next →](./projects.md)

---

TSClang's build system compiles `.tsc` files to C99 and builds a binary via CMake. Supports desktop applications, libraries, C-wrappers for native C libraries, and embedded targets (AVR, ARM, retro platforms).

## Pipeline

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (or .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

`outDir` structure:

```
build/desktop/
  c/              ← generated .c and .h
  CMakeLists.txt
  myapp           ← binary (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## Quick Start

```bash
npm install -g tsclang   # install compiler
tsclang init myapp       # create project
cd myapp
tsclang install          # install dependencies
tsclang run              # build and run
```

## Project Types

| Type | Description | `"type"` | Entry point |
|------|-------------|----------|-------------|
| **Executable** | Application | not specified (default) | `"main"` (required) |
| **TSClang library** | TSClang library | `"library"` | `index.tsc` (convention) |
| **C-wrapper** | Wrapper over C library | `"library"` | `index.d.tsc` |
| **Platform profile** | Platform profile | `"platform"` | `index.d.tsc` |

## CLI Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `tsclang init` | — | Create new project |
| `tsclang build` | `b` | Build project |
| `tsclang run` | — | Build and run |
| `tsclang dev` | — | Watch mode |
| `tsclang install` | `i` | Install dependencies |
| `tsclang update` | `u` | Update dependencies |
| `tsclang remove` | `r` | Remove dependency |
| `tsclang clean` | `c` | Remove build artifacts |
| `tsclang lint` | `l` | Check formatting |
| `tsclang migrate` | — | TypeScript → TSClang migration *(roadmap)* |
| `tsclang lsp` | — | Language Server Protocol *(roadmap)* |

## Subpages

| Page | Description |
|------|-------------|
| [Project Types](./projects.md) | Executable, library, C-wrapper, platform profile |
| [Configuration](./config.md) | Fields of `tsc.package.json`, builds, platformSettings |
| [CLI](./cli.md) | Commands build, run, init, lint, migrate, lsp |
| [Package Manager](./packages.md) | install, publish, search, workspaces, lock file |
| [Embedded Build](./embedded.md) | AVR, ARM, retro platforms, binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt, debug/release profiles, optimization |

## C-output

```c
// build/desktop/c/main.c — generated from src/main.tsc
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## Errors

| Error | Cause |
|-------|-------|
| `cannot determine entry point` | `"main"` field not specified for executable |
| `unknown target arch '6502'` | Unknown architecture without platform profile |
| `toolchain 'avr-gcc' not found in PATH` | Compiler not installed |
| `dependency conflict` | Incompatible semver constraints |

## See also

- [Modules: Import/Export](../08-modules/import-export.md) — entry point and initialization
- [Memory: Ownership](../05-memory/ownership-types.md) — owned/borrow during FFI
- [Concurrency](../07-concurrency/index.md) — async runtime: libuv, cooperative, none
