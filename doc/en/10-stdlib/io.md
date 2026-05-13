# std/io

[← Up](./index.md) | [Next →](./fs.md) | [Previous ←](./math.md)

---

Stream abstraction — base interfaces `Reader` and `Writer`. Used for building on top: files, network, serial.

Desktop/server only — on embedded compiler error for `process.stdin`.

## Import

```typescript
import { Reader, Writer, Stream } from "std/io"
```

## Reader

```typescript
interface Reader {
    read(buf: Mut<u8[]>): i32 | null throws IOError  // read into buffer, null = EOF
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

`process.stdin` implements `Reader`, `process.stdout` / `process.stderr` — `Writer`.

```typescript
const line = await process.stdin.readLine()   // string | null (null = EOF)
const all  = await process.stdin.readAll()     // string

await process.stdout.write("hello")
await process.stderr.write("error\n")
```

## Example: stream copy

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

## Errors

| Error | Cause |
|-------|-------|
| `process.stdin is not available on target "avr"` | `process.stdin`/`stdout`/`stderr` requires OS |
| `pipe is not available on target "avr"` | `pipe`/`readAll` requires heap and OS |

## See also

- [Global objects](./globals.md) — `process.stdin`/`stdout`/`stderr`
- [std/fs](./fs.md) — file operations
- [std/net](./net.md) — TCP/UDP sockets
- [Error handling](../06-errors/index.md) — `throws IOError`
