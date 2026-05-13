# std/fs

[← Вверх](./index.md) | [Следующий →](./net.md) | [Предыдущий ←](./io.md)

---

Файловая система — чтение, запись, директории, метаинформация. Все операции имеют async и sync варианты.

Только desktop/server. Реализация зависит от платформы: POSIX/Windows API на desktop, FatFS/LittleFS на embedded (SD/Flash).

## Импорт

```typescript
import fs from "std/fs"
```

## Async-операции

Используются внутри `async function` через `await`:

```typescript
const text = await fs.readFile("data.txt")            // string throws IOError
const raw  = await fs.readFileBytes("data.bin")       // u8[] throws IOError
await fs.writeFile("out.txt", "hello")                // void throws IOError
await fs.writeFileBytes("out.bin", bytes)             // void throws IOError
await fs.appendFile("log.txt", "new line\n")          // void throws IOError
await fs.deleteFile("old.txt")                        // void throws IOError
await fs.copyFile("src.txt", "dst.txt")               // void throws IOError
await fs.moveFile("old.txt", "new.txt")               // void throws IOError

await fs.mkdir("mydir")                               // void throws IOError
await fs.mkdir("a/b/c", { recursive: true })          // создать вложенные
await fs.rmdir("mydir")                               // void throws IOError
await fs.rmdir("mydir", { recursive: true })          // удалить со содержимым
const entries = await fs.readDir(".")                 // DirEntry[] throws IOError

const exists = await fs.exists("file.txt")            // boolean
const info   = await fs.stat("file.txt")              // FileStat throws IOError
const isFile = await fs.isFile("file.txt")            // boolean
const isDir  = await fs.isDir("mydir")                // boolean
```

## Sync-операции

Используются вне `async function`. Прямой вызов, без state machine. Недоступны внутри `async function` — ошибка компилятора (блокируют event loop).

```typescript
const text = fs.readFileSync("data.txt")              // string
const raw  = fs.readFileBytesSync("data.bin")         // u8[]
fs.writeFileSync("out.txt", "hello")                  // void
fs.appendFileSync("log.txt", "new line\n")            // void
fs.removeSync("old.txt")                              // void
fs.renameSync("old.txt", "new.txt")                   // void
fs.mkdirSync("mydir")                                 // void

const exists = fs.existsSync("file.txt")              // boolean
const info   = fs.statSync("file.txt")                // FileStat
const entries = fs.readDirSync(".")                   // DirEntry[]
```

## Типы

```typescript
interface DirEntry {
    name: string        // имя файла/директории
    path: string        // полный путь
    isFile: boolean
    isDir: boolean
}

interface FileStat {
    size: i64           // размер в байтах
    createdAt: Date
    modifiedAt: Date
    isFile: boolean
    isDir: boolean
}
```

## Пример

```typescript
import fs from "std/fs"
import { JSON } from "std/json"

async function main(): Promise<void> {
    const config = await fs.readFile("config.json")
    const settings = JSON.parse<Settings>(config)

    await fs.mkdir("output", { recursive: true })
    await fs.writeFile("output/result.txt", process(settings))
}
```

C-output:

```c
typedef struct {
    String  name;
    String  path;
    bool    isFile;
    bool    isDirectory;
} TscDirEntry;

typedef struct {
    int64_t size;
    bool    isFile;
    bool    isDirectory;
    int64_t mtime;
} TscFileStat;

typedef struct { bool _done; String _result; } TscFsReadAwaitable;
typedef struct { bool _done; } TscFsVoidAwaitable;
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `std/fs is not available on target "avr"` | `std/fs` требует файловую систему |
| `sync function inside async context` | Sync-операции блокируют event loop |
| `IOError: No such file or directory` | Файл не найден |
| `IOError: Permission denied` | Нет прав доступа |

## См. также

- [std/io](./io.md) — `Reader`/`Writer`, потоки
- [std/net](./net.md) — сетевые операции
- [std/json](./json.md) — JSON-парсинг файлов конфигурации
- [Обработка ошибок](../06-errors/index.md) — `throws IOError`, `try`/`catch`
