# std/json

[← Вверх](./index.md) | [Следующий →](./regex.md) | [Предыдущий ←](./string.md)

---

Парсинг и сериализация JSON. На embedded может быть недоступен — зависит от размера flash.

## Импорт

```typescript
import { JSON, ParseError } from "std/json"
```

## Функции

```typescript
JSON.parse<T>(s: string): T throws ParseError
JSON.stringify(val: T): string
JSON.stringify(val: T, indent: i32): string  // pretty-print
```

## JSON.parse\<T\>

Десериализует строку в тип `T`. Тип `T` должен быть:

- примитивом (`string`, `bool`, `i32`, `f64`, ...)
- классом с публичными полями (компилятор генерирует десериализатор)
- массивом или `Map<string, V>` из поддерживаемых типов

При невалидном JSON бросает `ParseError`:

```typescript
try {
    const user = JSON.parse<User>('{"name":"Alice","age":30}')
    console.log(user.name)  // Alice
} catch (e: ParseError) {
    console.log("bad json:", e.message)
}
```

## JSON.stringify

```typescript
const user = new User("Alice", 30)

const json = JSON.stringify(user)          // '{"name":"Alice","age":30}'
const pretty = JSON.stringify(user, 2)    // форматированный с отступом 2
```

## Пример: чтение конфигурации

```typescript
import { JSON, ParseError } from "std/json"
import fs from "std/fs"

interface Config {
    host: string
    port: i32
    debug: boolean
}

async function loadConfig(path: string): Config throws ParseError {
    const text = await fs.readFile(path)
    return JSON.parse<Config>(text)
}

async function main(): Promise<void> {
    try {
        const config = loadConfig("config.json")
        console.log(format("server at %s:%d", config.host, config.port))
    } catch (e: ParseError) {
        console.error("bad config:", e.message)
    }
}
```

## Ограничения типов

- `undefined` отсутствует — поля с `null` в JSON маппятся в `null`
- Приватные поля класса в JSON не включаются
- Цикличные ссылки (`Shared<T>`) — runtime error при `stringify`

## Платформы

| Платформа | Доступность |
|-----------|------------|
| Desktop/server | Всегда доступен |
| Embedded (flash ≥ 16KB) | Доступен |
| Embedded (flash < 16KB) | Ошибка компилятора — использовать `@tsc/json-nano` |

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `ParseError: unexpected token at position N` | Невалидный JSON |
| `ParseError: unexpected end of input` | Неполный JSON |
| `std/json requires flash ≥ 16KB` | Недостаточно flash на embedded |
| `circular reference in JSON.stringify` | Цикличный `Shared<T>` |

## См. также

- [std/string](./string.md) — кодирование, форматирование
- [std/net](./net.md) — `res.json<T>()`, HTTP-запросы
- [std/fs](./fs.md) — чтение JSON-файлов
- [Обработка ошибок](../06-errors/index.md) — `throws ParseError`, `try`/`catch`
