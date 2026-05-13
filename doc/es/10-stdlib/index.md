# Biblioteca estándar

[← Arriba](../index.md) | [Siguiente →](./globals.md)

---

La biblioteca estándar de TSClang es un conjunto de módulos con el espacio de nombres unificado `std/`. Todos los módulos están disponibles mediante `import { ... } from "std/<module>"`.

## Principios

| Principio | Descripción |
|-----------|-------------|
| **API unificada** | Todo pasa por `std/`, sin separación pública en niveles |
| **Carga perezosa** | El compilador carga módulos bajo demanda, no parsea todo `std/` al inicio |
| **Tree-shaking** | Solo el código usado va al binario |

```typescript
import { parse } from "std/json"   // ok
import { serve } from "std/net"    // ok
import { Regex } from "std/regex"  // ok
```

Los paquetes `@tsc/*` — wrappers C únicamente, no módulos de la stdlib:

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // ok — wrapper C
import { parse } from "@tsc/json"            // error — usar std/json
```

## Import corto

Todos los módulos `std/` pueden importarse sin prefijo:

```typescript
import { Thread } from "std/threads"   // forma explícita (recomendada)
import { Thread } from "threads"       // forma corta
```

Orden de resolución: `./name.tsc` → `std/name` → error.

## Compatibilidad por plataforma

| Módulo | Desktop | Embebido (ARM) | Embebido (AVR) | Nota |
|--------|---------|----------------|----------------|------|
| Objetos globales | ✅ | ✅ | ✅ | `console`, `Math`, timers |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA, ≈5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — embebido con RNG solo |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM: sin reloj de pared |
| `std/io` | ✅ | ❌ | ❌ | requiere heap y OS |
| `std/fs` | ✅ | ❌ | ❌ | requiere sistema de archivos |
| `std/net` | ✅ | ❌ | ❌ | requiere pila TCP/IP |
| `std/ws` | ✅ | ❌ | ❌ | sobre `std/net` |
| `std/threads` | ✅ | ❌ | ❌ | requiere threads del OS |
| `std/reactive` | ✅ | ❌ | ❌ | sobre `std/threads` |
| `std/hal` | ✅ | ✅ | ✅ | GPIO, UART, SPI, I2C; desktop — mock |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`, `pointer<T>`, `HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | atómicos sin OS |
| `std/avr` | ❌ | ✅ | ✅ | específico AVR |

**Leyenda:** ✅ — soporte completo, 🟡 — parcial, ❌ — no disponible.

El compilador verifica la compatibilidad al importar:

```typescript
// target: avr
import { readFile } from "std/fs"   // error: std/fs no está soportado en AVR
import { gpio } from "std/embedded"  // ok
```

## Subpáginas

| Página | Descripción |
|------|-------------|
| [Objetos globales](./globals.md) | `console`, `Math`, `process`, timers, `performance` |
| [console](./console.md) | Registro: `log`, `error`, `warn`, `time`, `timeEnd`, `assert` |
| [Math](./math.md) | Constantes y funciones matemáticas |
| [std/io](./io.md) | Flujos: `Reader`, `Writer`, `Stream` |
| [std/fs](./fs.md) | Sistema de archivos: lectura, escritura, directorios |
| [std/net](./net.md) | Red: `fetch`, servidor HTTP, TCP/UDP |
| [std/ws](./ws.md) | WebSocket: cliente y servidor |
| [std/string](./string.md) | Unicode, codificación, formato |
| [std/json](./json.md) | JSON: `parse` y `stringify` |
| [std/regex](./regex.md) | Expresiones regulares NFA |
| [std/hal y embedded](./hal.md) | HAL, módulos embebidos, `std/random`, `std/temporal`, `std/reactive` |

## Ver también

- [Modelo de memoria](../05-memory/index.md) — propiedad, `Ref<T>`, `Mut<T>`
- [Manejo de errores](../06-errors/index.md) — `throws`, `try`/`catch`
- [Módulos](../08-modules/index.md) — `import`/`export`, `.d.tsc`, native
- [Build](../09-build/index.md) — plataformas, `tsc.package.json`
