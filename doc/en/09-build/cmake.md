# CMake: Generation and Configuration

[← Up](./index.md) | [Previous ←](./embedded.md)

---

TSClang generates `CMakeLists.txt` automatically — manual writing is not required. The file is created in `outDir` and includes all necessary settings: compiler, optimization flags, header paths, dependency linking.

## outDir Structure

```
build/desktop/
  c/              ← generated .c and .h
  CMakeLists.txt  ← generated automatically
  myapp           ← binary (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## Automatic Generation

### Desktop

```cmake
cmake_minimum_required(VERSION 3.16)
project(myapp C)

set(CMAKE_C_STANDARD 99)

add_executable(myapp
    c/main.c
    c/user.c
)

target_include_directories(myapp PRIVATE c/)

# runtime headers
target_include_directories(myapp PRIVATE ${TSCLANG_RUNTIME}/std/)

# dependencies (from @tsc/sqlite3)
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_include_directories(myapp PRIVATE ${SQLITE3_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

### Embedded (AVR)

```cmake
cmake_minimum_required(VERSION 3.16)
project(myapp C)

set(CMAKE_C_COMPILER avr-gcc)
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR avr)

add_compile_options(-mmcu=atmega328p -Os)

add_executable(myapp
    c/main.c
)

target_include_directories(myapp PRIVATE c/)
target_include_directories(BEFORE myapp PRIVATE ${TSCLANG_RUNTIME}/platforms/avr)
```

### Retro (NES + cc65)

```cmake
cmake_minimum_required(VERSION 3.16)
project(mygame C)

set(CMAKE_C_COMPILER cc65)
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR 6502)
set(CMAKE_TOOLCHAIN_FILE ".../tsc_packages/@nes/platform/toolchain.cmake")

add_compile_options(-t nes)

include_directories(BEFORE ".../tsc_packages/@nes/platform/include")

add_executable(mygame ${SOURCES})
```

## Toolchain file

For standard compilers (gcc, clang, avr-gcc) CMake knows them out of the box. Non-standard ones (cc65, z88dk, djgpp) require a CMake toolchain file.

### Toolchain resolution

```
toolchain field in config
    ↓ no?
declare platform { toolchain } in profile
    ↓ no?
default by arch:
    x86-64  → clang, fallback gcc
    arm     → arm-none-eabi-gcc
    avr     → avr-gcc
    wasm32  → clang (wasm target)
    other   → error: "specify toolchain or profile"
```

### Path conventions

| Field | Value | Source |
|-------|-------|--------|
| `toolchainFile` | `"toolchain.cmake"` | inside profile package |
| `toolchainFile` | `"./my-toolchain.cmake"` | local project path |
| `include` | `"include"` | inside profile package |
| `include` | `"./platform/include"` | local project path |

`./` = local path relative to project root, without `./` = path inside package.

### Example toolchain.cmake (cc65)

```cmake
# @nes/platform/toolchain.cmake
set(CMAKE_C_COMPILER cc65)
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR 6502)

# platform-specific flags
add_compile_options(-t nes -Cl)

# include platform headers before runtime
include_directories(BEFORE "${CMAKE_CURRENT_SOURCE_DIR}/include")
```

## Optimization

Optimization levels are set via `optimize` in `builds`:

| Value | C Flag | When to use |
|-------|--------|-------------|
| `O0` | `-O0` | Debugging, no optimization |
| `O1` | `-O1` | Basic optimization |
| `O2` | `-O2` | Release, maximum speed |
| `O3` | `-O3` | Aggressive optimization (may increase size) |
| `Os` | `-Os` | Size optimization — critical for embedded |

```json
{
  "builds": {
    "debug": {
      "optimize": "O0",
      "outDir": "build/debug"
    },
    "release": {
      "optimize": "O2",
      "outDir": "build/release"
    },
    "avr": {
      "optimize": "Os",
      "target": "avr",
      "mcu": "atmega328p"
    }
  }
}
```

### Compilation flags (reference)

| Flag | Purpose |
|------|---------|
| `-Os` | Size optimization — critical for `avr`, `nes`, `gb` |
| `-fPIC` | Position-independent code — for `linux`/`android` libraries |
| `-nostdlib` | Exclude standard libraries — almost always needed for retro and embedded |

## Platform header resolution

Standard libraries have two levels of implementation:

```
src/runtime/
  std/                        ← desktop stubs (no-op, fallback)
    hal.h, hal_types.h
  platforms/
    avr/
      std/
        hal.h                 ← real AVR: DDRx/PORTx, TWI, SPI
    arm/
      std/
        hal.h                 ← ARM CMSIS calls
    esp32/
      std/
        hal.h                 ← ESP-IDF: gpio_set_direction, ...
```

Toolchain file adds the platform path **before** the standard one:

```cmake
include_directories(BEFORE "${TSCLANG_RUNTIME}/platforms/avr")
```

Codegen is unchanged — always emits `#include "std/hal.h"`. Implementation selection logic is entirely in the build system.

### Adding a new platform

1. Create `src/runtime/platforms/<name>/std/` with required headers
2. Add `cmake/toolchain-<name>.cmake` with `include_directories(BEFORE ...)`
3. Optionally — platform profile `.d.tsc` for type-checking

## C-wrapper and CMakeLists.txt

`declare link` in C-wrapper generates linking instructions in the consumer:

```typescript
declare link {
    libs: ["sqlite3"];
    pkg_config: "sqlite3";
}
```

```cmake
# generated in consumer's CMakeLists.txt
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_include_directories(myapp PRIVATE ${SQLITE3_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

## Debug / release profiles

```bash
tsclang build debug      # optimize: O0, debug symbols
tsclang build release    # optimize: O2
```

CLI `--optimize` flag overrides config:

```bash
tsclang build --optimize Os
tsclang build --clean    # full rebuild
```

## C-output

Full CMakeLists.txt example for a desktop project with dependencies:

```cmake
cmake_minimum_required(VERSION 3.16)
project(myapp C)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wall -Wextra")

add_executable(myapp
    c/main.c
    c/database.c
    c/user.c
)

target_include_directories(myapp PRIVATE c/)
target_include_directories(myapp PRIVATE ${TSCLANG_RUNTIME}/std/)

# @tsc/sqlite3
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_include_directories(myapp PRIVATE ${SQLITE3_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})

# @tsc/openssl (system link)
pkg_check_modules(OPENSSL REQUIRED openssl)
target_include_directories(myapp PRIVATE ${OPENSSL_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${OPENSSL_LIBRARIES})
```

## Errors

| Error | Cause |
|-------|-------|
| `toolchain 'avr-gcc' not found in PATH` | Compiler not installed |
| `toolchain 'avr-gcc@12.1' not found` | Pinned toolchain not found |
| `unknown target arch '6502': specify a platform profile` | Unknown architecture |
| `pkg-config: sqlite3 not found` | System library not installed |
| `specify toolchain or profile` | Unknown arch without toolchain and profile |

## See also

- [Configuration](./config.md) — builds, optimize, toolchain, toolchainFile
- [Embedded build](./embedded.md) — AVR, ARM, retro platforms
- [Project types](./projects.md) — C-wrapper link configuration
- [Modules: .d.tsc](../08-modules/d-tsc.md) — declare link, declare platform
