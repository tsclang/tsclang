# What is TSClang

[← Up](./index.md) | [Next →](./design-philosophy.md)

---

TSClang is a compiled language with TypeScript syntax that translates `.tsc` files into readable C code and automatically generates `CMakeLists.txt`.

## Why

Many developers move from TypeScript to C — and it hurts. C lacks a decent ecosystem: no package manager, no convenient cross-compilation, no built-in memory safety checks.

TSClang solves this:

- **Familiar syntax** — a TS developer recognizes the constructs and is immediately productive
- **Safe memory** — ownership and borrow checker at compile time, no GC
- **Unified ecosystem** — dependencies, cross-compilation, out-of-the-box builds
- **Readable C output** — can be inspected, debugged, and combined with hand-written C

## For What

**Now:**

- Server code — HTTP, sockets, backends
- Desktop — CLI/TUI, file managers, office applications

**Important:**

- System level — drivers, OS
- Embedded — Arduino, ESP, Raspberry Pi
- Games — via OpenGL, DirectX

**Dream:**

- Cross-platform — Windows, Linux, Mac, Android, iOS
- Retro platforms — ZX Spectrum, NES, Sega, MS-DOS

## File Extension

`.tsc` — TSClang source file.

```typescript
// hello.tsc
console.log("Hello world")
```

Compiles to:

```c
// hello.c
#include "runtime.h"
int main(void) {
    tsc_console_log(tsc_string_from_cstr("Hello world"));
    return 0;
}
```

## See Also

- [Design Philosophy](./design-philosophy.md) — three priorities of the language
- [Quick Start](./quick-start.md) — installation and first project
- [Memory Model](../05-memory/index.md) — ownership and borrow checker
