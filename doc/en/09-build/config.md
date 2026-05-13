# tsc.package.json Configuration

[← Up](./index.md) | [Next →](./cli.md) | [Previous ←](./projects.md)

---

`tsc.package.json` is the central configuration file of the project. It defines the project type, dependencies, named build profiles, and code generation parameters.

## Main fields

```json
{
  "name": "@myco/mylib",
  "version": "1.0.0",
  "description": "My awesome TSClang library",
  "author": "My Company <contact@myco.com>",
  "license": "MIT",
  "keywords": ["database", "sqlite"],
  "repository": {
    "type": "git",
    "url": "https://github.com/myco/mylib.git"
  },
  "tscVersion": ">=0.1.0",
  "files": ["index.tsc", "src/"],
  "type": "library",
  "main": "src/main.tsc",
  "dependencies": {
    "@tsc/sqlite3": "^1.0.0"
  },
  "devDependencies": {
    "@tsc/test": "^1.0.0"
  },
  "overrides": {
    "@myco/utils": "2.1.0"
  },
  "builds": {
    "desktop": {
      "emit": "binary",
      "outDir": "build/desktop",
      "optimize": "O2"
    },
    "avr": {
      "target": "avr",
      "mcu": "atmega328p",
      "toolchain": "avr-gcc",
      "optimize": "Os",
      "binaryMode": "small",
      "emit": "hex",
      "outDir": "build/avr"
    }
  }
}
```

### Required fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Package name (`@scope/name` for libraries) |
| `version` | yes | Version in semver format |
| `type` | no | `"executable"` (default), `"library"`, `"platform"` |
| `main` | for exe | Entry point file |

### Dependencies

| Field | Description |
|-------|-------------|
| `dependencies` | Package dependencies |
| `devDependencies` | Development dependencies, not installed in production |
| `overrides` | Override versions for unresolvable conflicts |

```json
{
  "dependencies": {
    "@myco/mylib": "^1.0.0",
    "@scope/sdl2": ">=2.28.0"
  },
  "devDependencies": {
    "@tsc/test": "^1.0.0",
    "@tsc/lint": "^0.2.0"
  },
  "overrides": {
    "@myco/utils": "2.1.0"
  }
}
```

`overrides` applies to all transitive dependencies and has priority over all constraints. Use as a last resort — may break incompatible versions.

### Metadata (for registry)

| Field | Description |
|-------|-------------|
| `description` | Brief package description |
| `author` | Author (name or `"Name <email>"`) |
| `license` | License (`"MIT"`, `"Apache-2.0"`, `"GPL-3.0"`) |
| `keywords` | Array of keywords for search |
| `repository` | Repository: `{ "type": "git", "url": "..." }` |
| `homepage` | Homepage URL |
| `bugs` | URL for bug reports: `{ "url": "..." }` |
| `tscVersion` | Required TSClang version (`">=0.1.0"`) |
| `files` | Files to publish (array of paths). `devDependencies` are excluded automatically. |

### type field behavior

| Value | Behavior |
|-------|----------|
| not specified | same as `"executable"` — compiler looks for entry point |
| `"executable"` | compiler looks for entry point, error if not found |
| `"library"` | entry point is not searched, generates `.h` + `.a`/`.so` |
| `"platform"` | platform profile — only `declare platform {}` and `declare module` |

```json
// explicit library
{
  "name": "mylib",
  "version": "1.0.0",
  "type": "library"
}

// explicit executable with entry point
{
  "name": "myapp",
  "version": "1.0.0",
  "type": "executable",
  "main": "src/main.tsc"
}
```

## Build config fields

Named configurations for different platforms in the `builds` field.

```json
{
  "builds": {
    "desktop": {},
    "avr": {
      "target": "avr",
      "mcu": "atmega328p",
      "defaultNumber": "f32"
    },
    "release": {
      "optimize": "O2"
    }
  }
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `target` | Target platform (`"avr"`, `"arm"`, `"x86-64"`) | current platform |
| `mcu` | Specific chip (`"atmega328p"`, `"stm32f103"`) | — |
| `arch` | Architecture (`"avr"`, `"arm"`, `"desktop"`, `"6502"`) | — |
| `toolchain` | Compiler (`"avr-gcc"`, `"cc65"`, `"arm-none-eabi-gcc"`) | — |
| `toolchainFile` | Path to CMake toolchain file | — |
| `profile` | Platform profile package (`"@nes/platform"`) | — |
| `optimize` | Optimization level (`"O0"`, `"O1"`, `"O2"`, `"O3"`, `"Os"`) | `O0` |
| `defaultNumber` | Type for `number` (`"f64"`, `"f32"`, `"i32"`) | `f64` |
| `binaryMode` | `"normal"` / `"small"` (type erasure) | `"normal"` |
| `emit` | Output type: `"c"`, `"binary"`, `"hex"`, `"lib"` | `"binary"` for desktop |
| `outDir` | Output directory | `./build/<name>` |
| `main` | Entry point file (override top-level) | inherited |
| `runtime` | Async runtime: `"libuv"`, `"io_uring"`, `"embedded"` | `"libuv"` for desktop |

### binaryMode: "small"

Mode for heavily constrained embedded platforms (AVR Arduino: 32 KB flash). Enables type erasure:

- `Array<T>` where T is pointer/complex type → single implementation via `void*`
- Monomorphization only for primitives (`Array<i32>`, `Array<u8>`)
- Enum string tables are not generated, `.toString()` returns number
- Tradeoff: less flash, but no type-safe runtime checks for erased types

> Type erasure is a code generation optimization, not a language feature. Borrow checker works on AST before code generation with full types.

### toolchain: value variants

| Value | Behavior |
|-------|----------|
| `"avr-gcc"` | looks for binary in PATH |
| `"avr-gcc@12.1"` | pinned version — `~/.tsc/toolchains/avr-gcc@12.1/bin/`, then PATH |
| `"/opt/avr/bin/avr-gcc"` | absolute path |
| `"./tools/cc65/bin/cl65"` | path relative to project root |

### Toolchain resolution

```
toolchain field in config
    ↓ no?
declare platform { toolchain } in profile
    ↓ no?
default by arch from internal table:
    x86-64  → clang, fallback gcc
    arm     → arm-none-eabi-gcc
    avr     → avr-gcc
    wasm32  → clang (wasm target)
    other   → error: "specify toolchain or profile"
```

## platformSettings

Code generation settings on top of the platform profile. Set at the top level of `tsc.package.json`.

```json
{
  "platformSettings": {
    "defaultAlignment": 16
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultAlignment` | `number` (power of two) | platform default | Global alignment of all structs. Useful for SIMD (`defaultAlignment: 16` → `__attribute__((aligned(16)))`). |

> `platformSettings.defaultAlignment` — project developer decision. `declare platform` describes hardware capabilities (independent of decision).

## devDependencies

Development dependencies — not included in the published package, not installed with `--production`.

**Typical contents:**
- Test frameworks (`@tsc/test`)
- Lint tools (`@tsc/lint`)
- Typings for C libraries
- Build tools

| Command | Installs |
|---------|----------|
| `tsclang install` | `dependencies` + `devDependencies` |
| `tsclang install -p` / `--production` | only `dependencies` |
| `tsclang install -d` / `--dev` | only `devDependencies` |

## C-output

C-wrapper dependency generates CMake configuration in the consumer:

```cmake
# build/desktop/CMakeLists.txt — from @tsc/sqlite3
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_include_directories(myapp PRIVATE ${SQLITE3_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

## Errors

| Error | Cause |
|-------|-------|
| `cannot determine entry point` | Executable without `"main"` field |
| `main file not found: src/main.tsc` | File from `"main"` does not exist |
| `unknown target arch '6502': specify a platform profile` | Unknown architecture without `profile` |
| `toolchain 'avr-gcc@12.1' not found` | Pinned toolchain not installed |
| `version conflict for @myco/utils` | Incompatible semver constraints |
| `@myco/async requires "heap" but platform has heap: false` | Library and platform incompatibility |

## See also

- [Project types](./projects.md) — Executable, library, C-wrapper, platform profile
- [CLI](./cli.md) — build, run, init commands
- [Package manager](./packages.md) — install, lock file, overrides
- [Embedded build](./embedded.md) — binaryMode, AVR, ARM
