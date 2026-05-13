# std/io

[← Вверх](./index.md) | [Следующий →](./fs.md) | [Предыдущий ←](./math.md)

---

Абстракция потоков — базовые интерфейсы `Reader` и `Writer`. Используются для построения поверх них: файлы, сеть, serial.

Только desktop/server — на embedded ошибка компилятора при `process.stdin`.

## Импорт

```typescript
import { Reader, Writer, Stream } from "std/io"
```

## Reader

```typescript
interface Reader {
    read(buf: Mut<u8[]>): i32 | null throws IOError  // прочитать в буфер, null = EOF
    readLine(): string | null throws IOError
    readAll(): string throws IOError
}
```

## Writer

```typescript
interface Writer {
    write(data: string): void throws IOError
    write(data: u8[]): void throws IOError
    flush(): void throws IOError
}
```

## Stream

```typescript
interface Stream extends Reader, Writer {}
```

## process.stdin / stdout / stderr

`process.stdin` реализует `Reader`, `process.stdout` / `process.stderr` — `Writer`.

```typescript
const line = await process.stdin.readLine()   // string | null (null = EOF)
const all  = await process.stdin.readAll()     // string

await process.stdout.write("hello")
await process.stderr.write("error\n")
```

## Пример: копирование потока

```typescript
async function main(): Promise<void> {
    const line = await process.stdin.readLine()
    if (line != null) {
        await process.stdout.write(`echo: ${line}\n`)
    }
}
```

C-output:

```c
typedef struct { int32_t _fd; } TscReader;
typedef struct { int32_t _fd; } TscWriter;
typedef struct { bool _done; String _result; bool _eof; } TscReadLineAwaitable;
typedef struct { bool _done; } TscWriteStrAwaitable;
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `process.stdin is not available on target "avr"` | `process.stdin`/`stdout`/`stderr` требует OS |
| `pipe is not available on target "avr"` | `pipe`/`readAll` требует heap и OS |

## См. также

- [Глобальные объекты](./globals.md) — `process.stdin`/`stdout`/`stderr`
- [std/fs](./fs.md) — файловые операции
- [std/net](./net.md) — TCP/UDP сокеты
- [Обработка ошибок](../06-errors/index.md) — `throws IOError`
