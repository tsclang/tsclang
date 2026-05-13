# Standard Library

[← Up](../index.md) | [Next →](./globals.md)

---

The TSClang standard library is a set of modules with the unified namespace `std/`. All modules are available via `import { ... } from "std/<module>"`.

## Principles

| Principle | Description |
|-----------|-------------|
| **Unified API** | Everything via `std/`, no public separation into levels |
| **Lazy loading** | Compiler loads modules on demand, does not parse entire `std/` at startup |
| **Tree-shaking** | Only used code goes into the binary |

```typescript
import { parse } from "std/json"   // ok
import { serve } from "std/net"    // ok
import { Regex } from "std/regex"  // ok
```

Packages `@tsc/*` — C-wrappers only, not stdlib modules:

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // ok — C-wrapper
import { parse } from "@tsc/json"            // error — use std/json
```

## Short import

All `std/` modules can be imported without prefix:

```typescript
import { Thread } from "std/threads"   // explicit form (recommended)
import { Thread } from "threads"       // short form
```

Resolution order: `./name.tsc` → `std/name` → error.

## Platform compatibility

| Module | Desktop | Embedded (ARM) | Embedded (AVR) | Note |
|--------|---------|----------------|----------------|------|
| Global objects | ✅ | ✅ | ✅ | `console`, `Math`, timers |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA, ≈5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — embedded with RNG only |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM: without wall clock |
| `std/io` | ✅ | ❌ | ❌ | requires heap and OS |
| `std/fs` | ✅ | ❌ | ❌ | requires file system |
| `std/net` | ✅ | ❌ | ❌ | requires TCP/IP stack |
| `std/ws` | ✅ | ❌ | ❌ | on top of `std/net` |
| `std/threads` | ✅ | ❌ | ❌ | requires OS threads |
| `std/reactive` | ✅ | ❌ | ❌ | on top of `std/threads` |
| `std/hal` | ✅ | ✅ | ✅ | GPIO, UART, SPI, I2C; desktop — mock |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`, `pointer<T>`, `HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | atomics without OS |
| `std/avr` | ❌ | ✅ | ✅ | AVR-specific |

**Legend:** ✅ — full support, 🟡 — partial, ❌ — unavailable.

Compiler checks compatibility on import:

```typescript
// target: avr
import { readFile } from "std/fs"   // error: std/fs is not supported on AVR
import { gpio } from "std/embedded"  // ok
```

## Subpages

| Page | Description |
|------|-------------|
| [Global objects](./globals.md) | `console`, `Math`, `process`, timers, `performance` |
| [console](./console.md) | Logging: `log`, `error`, `warn`, `time`, `timeEnd`, `assert` |
| [Math](./math.md) | Constants and mathematical functions |
| [std/io](./io.md) | Streams: `Reader`, `Writer`, `Stream` |
| [std/fs](./fs.md) | File system: reading, writing, directories |
| [std/net](./net.md) | Network: `fetch`, HTTP server, TCP/UDP |
| [std/ws](./ws.md) | WebSocket: client and server |
| [std/string](./string.md) | Unicode, encoding, formatting |
| [std/json](./json.md) | JSON: `parse` and `stringify` |
| [std/regex](./regex.md) | NFA regular expressions |
| [std/hal and embedded](./hal.md) | HAL, embedded modules, `std/random`, `std/temporal`, `std/reactive` |

## See also

- [Memory model](../05-memory/index.md) — ownership, `Ref<T>`, `Mut<T>`
- [Error handling](../06-errors/index.md) — `throws`, `try`/`catch`
- [Modules](../08-modules/index.md) — `import`/`export`, `.d.tsc`, native
- [Build](../09-build/index.md) — platforms, `tsc.package.json`
