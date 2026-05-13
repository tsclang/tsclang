# Standardbibliothek

[Hoch](../index.md) | [Weiter](./globals.md)

---

Die TSClang-Standardbibliothek ist eine Sammlung von Modulen mit dem einheitlichen Namespace `std/`. Alle Module sind über `import { ... } from "std/<modul>"` verfügbar.

## Prinzipien

| Prinzip | Beschreibung |
|---------|--------------|
| **Einheitliche API** | Alles über `std/`, keine öffentliche Aufteilung in Ebenen |
| **Lazy Loading** | Der Compiler lädt Module bei Bedarf, parst nicht die gesamte `std/` beim Start |
| **Tree-Shaking** | Nur verwendeter Code landet im Binary |

```typescript
import { parse } from "std/json"   // ok
import { serve } from "std/net"    // ok
import { Regex } from "std/regex"  // ok
```

Pakete `@tsc/*` — nur C-Wrapper, keine Stdlib-Module:

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // ok — C-Wrapper
import { parse } from "@tsc/json"            // Fehler — std/json verwenden
```

## Kurzimport

Alle `std/`-Module können ohne Präfix importiert werden:

```typescript
import { Thread } from "std/threads"   // explizite Form (empfohlen)
import { Thread } from "threads"       // Kurzform
```

Auflösungsreihenfolge: `./name.tsc` → `std/name` → Fehler.

## Plattformkompatibilität

| Modul | Desktop | Embedded (ARM) | Embedded (AVR) | Hinweis |
|-------|---------|----------------|----------------|---------|
| Globale Objekte | ✅ | ✅ | ✅ | `console`, `Math`, Timer |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA, ≈5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — Embedded nur mit RNG |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM: ohne Wanduhr |
| `std/io` | ✅ | ❌ | ❌ | erfordert Heap und OS |
| `std/fs` | ✅ | ❌ | ❌ | erfordert Dateisystem |
| `std/net` | ✅ | ❌ | ❌ | erfordert TCP/IP-Stack |
| `std/ws` | ✅ | ❌ | ❌ | auf Basis von `std/net` |
| `std/threads` | ✅ | ❌ | ❌ | erfordert OS-Threads |
| `std/reactive` | ✅ | ❌ | ❌ | auf Basis von `std/threads` |
| `std/hal` | ✅ | ✅ | ✅ | GPIO, UART, SPI, I2C; Desktop — Mock |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`, `pointer<T>`, `HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | Atomics ohne OS |
| `std/avr` | ❌ | ✅ | ✅ | AVR-spezifisch |

**Legende:** ✅ — volle Unterstützung, 🟡 — teilweise, ❌ — nicht verfügbar.

Der Compiler prüft die Kompatibilität beim Import:

```typescript
// target: avr
import { readFile } from "std/fs"   // Fehler: std/fs wird auf AVR nicht unterstützt
import { gpio } from "std/embedded"  // ok
```

## Unterseiten

| Seite | Beschreibung |
|-------|--------------|
| [Globale Objekte](./globals.md) | `console`, `Math`, `process`, Timer, `performance` |
| [console](./console.md) | Logging: `log`, `error`, `warn`, `time`, `timeEnd`, `assert` |
| [Math](./math.md) | Konstanten und mathematische Funktionen |
| [std/io](./io.md) | Streams: `Reader`, `Writer`, `Stream` |
| [std/fs](./fs.md) | Dateisystem: Lesen, Schreiben, Verzeichnisse |
| [std/net](./net.md) | Netzwerk: `fetch`, HTTP-Server, TCP/UDP |
| [std/ws](./ws.md) | WebSocket: Client und Server |
| [std/string](./string.md) | Unicode, Kodierung, Formatierung |
| [std/json](./json.md) | JSON: `parse` und `stringify` |
| [std/regex](./regex.md) | NFA-reguläre Ausdrücke |
| [std/hal und embedded](./hal.md) | HAL, Embedded-Module, `std/random`, `std/temporal`, `std/reactive` |

## Siehe auch

- [Speichermodell](../05-memory/index.md) — Ownership, `Ref<T>`, `Mut<T>`
- [Fehlerbehandlung](../06-errors/index.md) — `throws`, `try`/`catch`
- [Module](../08-modules/index.md) — `import`/`export`, `.d.tsc`, native
- [Build](../09-build/index.md) — Plattformen, `tsc.package.json`
