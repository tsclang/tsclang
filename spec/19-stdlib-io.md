# TSClang — std/io: реализация

> Детальная спецификация реализации `std/io`.
> Шаг 3 в плане: документация → тесты → реализация.

## Зависимости

- Desktop sync: `<stdio.h>`, `<unistd.h>`
- Desktop async: libuv `uv_stream_t`, `uv_read_start`, `uv_write`
- Embedded: ошибка компилятора при `process.stdin`

## Типы

```c
typedef struct { int32_t _fd; } TscReader;
typedef struct { int32_t _fd; } TscWriter;

typedef struct { bool _done; }                             TscPipeAwaitable;
typedef struct { bool _done; Array_u8 _result; }           TscReadAllAwaitable;
typedef struct { bool _done; }                             TscWriteAllAwaitable;
typedef struct { bool _done; String _result; bool _eof; }  TscReadLineAwaitable;
typedef struct { bool _done; }                             TscWriteStrAwaitable;
```

## Функции

| TSClang | C-функция | Возвращает | Примечание |
|---------|-----------|-----------|-----------|
| `process.stdin` | `tsc_stdin()` | `TscReader` | fd=0 |
| `process.stdout` | `tsc_stdout()` | `TscWriter` | fd=1 |
| `process.stderr` | `tsc_stderr()` | `TscWriter` | fd=2 |
| `await pipe(r, w)` | `tsc_pipe_async(r, w)` / `tsc_pipe_poll` | `TscPipeAwaitable` | read loop |
| `await readAll(r)` | `tsc_read_all_async(r)` / `tsc_read_all_poll` | `TscReadAllAwaitable` | heap buf |
| `await writeAll(w, bytes)` | `tsc_write_all_async(w, buf, len)` / `tsc_write_all_poll` | `TscWriteAllAwaitable` | — |
| `await reader.readLine()` | `tsc_read_line_async(r)` / `tsc_read_line_poll` | `TscReadLineAwaitable` | `\n` stripped |
| `await writer.write(s)` | `tsc_write_str_async(w, s)` / `tsc_write_str_poll` | `TscWriteStrAwaitable` | string |

Статус: `pipe`, `readAll`, `writeAll` — уже в codegen. `readLine`, `write` — NEW (шаг 3).

## Реализация (шаг 3)

- `tsc_stdin/stdout/stderr` → `(TscReader/Writer){ ._fd = 0/1/2 }`
- `tsc_read_line_async`: POSIX `fgets` на fd / libuv `uv_read_start` на `uv_tty_t`; частичный буфер в poll state
- `tsc_read_all_async`: читает в динамический буфер до EOF
- `tsc_write_all_async`: POSIX `write` loop / libuv `uv_write` request
- `tsc_write_str_async`: оборачивает `tsc_write_all_async(w, s.data, s.length)`
- `tsc_pipe_async`: композитный awaitable (readLine → write → repeat до EOF)

## Ограничения платформ

```
process.stdin  → ❌ embedded (нет OS)
process.stdout → ❌ embedded
pipe / readAll → ❌ embedded
readLine       → ❌ embedded
```

## Тесты

| Тест | Файл | Статус |
|------|------|--------|
| stdin/stdout/stderr | `doc/phase19/io/stdin`, `stdout`, `stderr` | ✓ проходит |
| pipe | `doc/phase19/io/pipe` | ✓ проходит |
| readAll | `doc/phase19/io/read-all` | ✓ проходит |
| writeAll | `doc/phase19/io/write-all` | ✓ проходит |
| readLine | `doc/phase19/io/read-line` | ✗ ждёт шага 3 |
| write (str) | `doc/phase19/io/write-str` | ✗ ждёт шага 3 |
| err-stdin-embedded | `doc/phase19/io/err-stdin-embedded` | ✓ проходит |
