# console

[← Вверх](./index.md) | [Следующий →](./math.md) | [Предыдущий ←](./globals.md)

---

Глобальный объект для вывода в стандартные потоки. Импорт не нужен. Доступен на всех платформах.

## Методы вывода

```typescript
console.log(...args)    // stdout
console.error(...args)  // stderr
console.warn(...args)   // stderr, с пометкой WARN
console.info(...args)   // stdout, с пометкой INFO
console.debug(...args)  // stdout, с пометкой DEBUG
```

Все методы принимают произвольное число аргументов, разделяемых пробелами:

```typescript
console.log("user:", user.name, "age:", user.age)
console.error("failed:", err.message)
```

C-output:

```c
// console.log("hello", 42)
tsc_console_log("hello %d", 42);
```

## console.time / timeEnd

Измерение времени — удобный сахар над `performance.mark`/`measure`:

```typescript
console.time("parse")
parseData(buf)
console.timeEnd("parse")    // выводит: "parse: 12.3ms"
```

C-output:

```c
// console.time("parse") → tsc_console_time("parse")
// console.timeEnd("parse") → tsc_console_time_end("parse")
```

## console.assert

Условный вывод ошибки:

```typescript
console.assert(condition, "message")
// если condition == false → выводит: "Assertion failed: message"
```

## console.trace — только desktop

Упрощённый трейс — место вызова:

```typescript
console.trace("reached here")
// выводит: "reached here (__FILE__:__LINE__)"
```

Полный call stack недоступен — только место вызова. На embedded — ошибка компилятора.

## Пример

```typescript
async function main(): Promise<void> {
    console.log("starting...")

    console.time("load")
    const data = await fs.readFile("data.json")
    console.timeEnd("load")  // "load: 3.2ms"

    console.assert(data.length > 0, "empty data")

    const users = JSON.parse<User[]>(data)
    console.info("loaded", users.length, "users")
}
```

C-output:

```c
void main(void) {
    tsc_console_log("starting...");
    tsc_console_time("load");
    String data = tsc_fs_read_sync("data.json");
    tsc_console_time_end("load");
    // ...
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `console.trace is not available on target "avr"` | `console.trace` только desktop |

## См. также

- [Глобальные объекты](./globals.md) — `console`, `Math`, `process`, таймеры
- [Math](./math.md) — математические функции
- [std/io](./io.md) — `Reader`/`Writer`, `process.stdin`/`stdout`
- [Обработка ошибок](../06-errors/index.md) — `console.assert` и AssertError
