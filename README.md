# TSClang

TypeScript-like language that compiles to C — for server, desktop, embedded, and retro platforms.

## What is it?

TSClang lets TypeScript developers write systems code using familiar TS syntax, while compiling to clean, readable C. It targets:

- **Server / desktop** — async/await, TCP/UDP/WebSocket, filesystem, HTTP
- **Embedded** — AVR (Arduino), ARM Cortex-M, ESP32 — no heap, no async, real hardware registers
- **Retro / consoles** — NES (cc65), Sega Genesis (SGDK), PS1, PS2, MS-DOS, ZX Spectrum

## Install

```bash
npm install -g tsclang
```

Requires: Node.js ≥ 18, GCC or Clang, CMake (for embedded targets).

## Quick start

```bash
tsclang init my-project
cd my-project
tsclang build src/main.tsc
tsclang run src/main.tsc
```

## Language features

- TypeScript syntax: `const`/`let`, arrow functions, classes, generics, enums, interfaces
- Ownership and borrow checker (Rust-inspired): `Ref<T>`, `Mut<T>`, `Arc<T>` (ARC)
- Async/await → C state machine (no runtime, no heap required for embedded)
- Threads, channels, atomics
- `std/fs`, `std/net`, `std/ws`, `std/io` — real POSIX/BSD sockets implementation
- Decorators, extension methods, `match` with exhaustiveness check
- Embedded: `@embedded.pool`, `@embedded.isr`, cooperative scheduler, `Volatile<T>`

## Safety-critical & IEC 61508

TSClang supports a **strict mode** with granular rules that make generated C code compliant with IEC 61508 (SIL 1–4) and MISRA C:2012 requirements:

```json
{
  "strict": [
    "no-any", "no-unsafe", "no-native", "safe-div",
    "no-lossy-cast", "no-dynamic-alloc",
    "no-closures", "no-interfaces", "no-threads", "no-sort",
    "switch-default", "no-abort"
  ]
}
```

| Rule | Enforces |
|------|----------|
| `no-any` | No `void*` / dynamic types |
| `no-unsafe` | No unsafe blocks |
| `no-native` | No inline C injection |
| `safe-div` | No integer division without guard |
| `no-lossy-cast` | No lossy type casts |
| `no-dynamic-alloc` | No `malloc`/`realloc` with runtime size |
| `no-closures` | No `void*` in function pointers |
| `no-interfaces` | No `void*` in vtable dispatch |
| `no-threads` | No `void*` in thread entry points |
| `no-sort` | No `void*` in `qsort` comparators |
| `switch-default` | Auto `default: break;` in all switch |
| `no-abort` | Configurable panic handler instead of `abort()` |

See [spec/13-build/13-strict-mode.md](spec/13-build/13-strict-mode.md) for full documentation.

## CLI commands

```
tsclang build <file.tsc>          Compile to C + binary
tsclang run <file.tsc>            Compile and run
tsclang init <name>               Create new project
tsclang build-cmake <package>     Generate CMakeLists.txt (embedded/cross-compile)
tsclang install [package]         Install dependencies
tsclang update                    Update dependencies
tsclang search <query>            Search package registry
tsclang publish                   Publish package (.tspkg)
tsclang lint [--fix]              Lint source files
tsclang format                    Format source files (WIP)
tsclang emit-dts <file.tsc>       Emit .d.tsc declaration file
tsclang lsp                       Start Language Server (JSON-RPC)
tsclang explain <E001>            Show error code explanation
```

## Supported targets

| Target | Toolchain | Notes |
|--------|-----------|-------|
| desktop | gcc/clang | default, full stdlib |
| avr | avr-gcc | ATmega, no heap |
| arm | arm-none-eabi-gcc | Cortex-M |
| nes | cc65 | 6502, 2KB RAM |
| genesis | m68k-elf-gcc | SGDK, no heap |
| ps1 | mipsel-unknown-elf-gcc | psn00bsdk |
| ps2 | ee-gcc | ps2dev |
| dos | djgpp | DPMI heap |
| spectrum | z88dk/sccz80 | Z80, 48KB |
| wasm | emcc (Emscripten) | `--emit wasm` |

## License

Apache-2.0
