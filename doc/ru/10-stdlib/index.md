# Стандартная библиотека

[← Вверх](../index.md) | [Следующий →](./globals.md)

---

Стандартная библиотека TSClang — набор модулей с единым пространством имён `std/`. Все модули доступны через `import { ... } from "std/<module>"`.

## Принципы

| Принцип | Описание |
|---------|----------|
| **Единый API** | Всё через `std/`, никакого публичного разделения на уровни |
| **Lazy loading** | Компилятор загружает модули по требованию, не парсит весь `std/` при старте |
| **Tree-shaking** | В бинарник попадает только используемое |

```typescript
import { parse } from "std/json"   // ok
import { serve } from "std/net"    // ok
import { Regex } from "std/regex"  // ok
```

Пакеты `@tsc/*` — только C-wrapper'ы, не модули stdlib:

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // ok — C-wrapper
import { parse } from "@tsc/json"            // ошибка — используйте std/json
```

## Короткий импорт

Все `std/`-модули можно импортировать без префикса:

```typescript
import { Thread } from "std/threads"   // явная форма (рекомендуется)
import { Thread } from "threads"       // краткая форма
```

Порядок резолюции: `./name.tsc` → `std/name` → ошибка.

## Совместимость с платформами

| Модуль | Desktop | Embedded (ARM) | Embedded (AVR) | Примечание |
|--------|---------|----------------|----------------|------------|
| Глобальные объекты | ✅ | ✅ | ✅ | `console`, `Math`, таймеры |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA, ≈5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — только embedded с RNG |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM: без wall clock |
| `std/io` | ✅ | ❌ | ❌ | требует heap и OS |
| `std/fs` | ✅ | ❌ | ❌ | требует файловую систему |
| `std/net` | ✅ | ❌ | ❌ | требует TCP/IP стек |
| `std/ws` | ✅ | ❌ | ❌ | поверх `std/net` |
| `std/threads` | ✅ | ❌ | ❌ | требует OS-потоки |
| `std/reactive` | ✅ | ❌ | ❌ | поверх `std/threads` |
| `std/hal` | ✅ | ✅ | ✅ | GPIO, UART, SPI, I2C; desktop — mock |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`, `pointer<T>`, `HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | атомики без ОС |
| `std/avr` | ❌ | ✅ | ✅ | AVR-specific |

**Легенда:** ✅ — полная поддержка, 🟡 — частичная, ❌ — недоступно.

Компилятор проверяет совместимость при импорте:

```typescript
// target: avr
import { readFile } from "std/fs"   // ошибка: std/fs не поддерживается на AVR
import { gpio } from "std/embedded"  // ok
```

## Подстраницы

| Страница | Описание |
|----------|----------|
| [Глобальные объекты](./globals.md) | `console`, `Math`, `process`, таймеры, `performance` |
| [console](./console.md) | Логирование: `log`, `error`, `warn`, `time`, `timeEnd`, `assert` |
| [Math](./math.md) | Константы и математические функции |
| [std/io](./io.md) | Потоки: `Reader`, `Writer`, `Stream` |
| [std/fs](./fs.md) | Файловая система: чтение, запись, директории |
| [std/net](./net.md) | Сеть: `fetch`, HTTP-сервер, TCP/UDP |
| [std/ws](./ws.md) | WebSocket: клиент и сервер |
| [std/string](./string.md) | Unicode, кодирование, форматирование |
| [std/json](./json.md) | JSON: `parse` и `stringify` |
| [std/regex](./regex.md) | NFA-регулярные выражения |
| [std/hal и embedded](./hal.md) | HAL, embedded-модули, `std/random`, `std/temporal`, `std/reactive` |

## См. также

- [Модель памяти](../05-memory/index.md) — ownership, `Ref<T>`, `Mut<T>`
- [Обработка ошибок](../06-errors/index.md) — `throws`, `try`/`catch`
- [Модули](../08-modules/index.md) — `import`/`export`, `.d.tsc`, native
- [Сборка](../09-build/index.md) — платформы, `tsc.package.json`
