---
"@tsclang/ast": minor
"@tsclang/shared": minor
"@tsclang/compiler": minor
"@tsclang/cli": minor
"@tsclang/pm": minor
---

Extract @tsclang/shared as cross-cutting constants package and eliminate cross-package duplication.

- Created `@tsclang/shared` leaf package with 12 modules: emit, package-type, targets, allocators, async-models, optimize-levels, number-types, strict-rules, filenames, defaults, toolchain
- Wired toolchain constants (C_STANDARD_FLAG, GCC_LINK_FLAGS, GCC_WARN_FLAGS, RUNTIME_HEADER, RUNTIME_WASM_HEADER, DEFAULT_AVR_MCU, DEFAULT_AVR_FREQ) across all consumers
- Extracted TSC preprocessor defines (TSC_DEFINES: EMBEDDED, WASM, SCHEDULER_LIBUV, NO_POSIX, NO_STRTOLL)
- Fixed: CLI build/run/test now link -lm (was missing on Linux)
- Consolidated DESKTOP_CAPABILITIES, normalizeC, toWslPath, capabilityDefines into single sources
- Added E009 to error catalog
