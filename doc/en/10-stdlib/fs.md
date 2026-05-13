# std/fs

[← Up](./index.md) | [Next →](./net.md) | [Previous ←](./io.md)

---

File system — reading, writing, directories, metadata. All operations have async and sync variants.

Desktop/server only. Implementation depends on platform: POSIX/Windows API on desktop, FatFS/LittleFS on embedded (SD/Flash).

## Import

```typescript
import fs from "std/fs"
```

## Async operations

Used inside `async function` via `await`:

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
await fs.mkdir("a/b/c", { recursive: true })          // create nested
await fs.rmdir("mydir")                               // void throws IOError
await fs.rmdir("mydir", { recursive: true })          // delete with contents
const entries = await fs.readDir(".")                 // DirEntry[] throws IOError

const exists = await fs.exists("file.txt")            // boolean
const info   = await fs.stat("file.txt")              // FileStat throws IOError
const isFile = await fs.isFile("file.txt")            // boolean
const isDir  = await fs.isDir("mydir")                // boolean
```

## Sync operations

Used outside `async function`. Direct call, without state machine. Unavailable inside `async function` — compiler error (blocks event loop).

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

## Types

```typescript
interface DirEntry {
    name: string        // file/directory name
    path: string        // full path
    isFile: boolean
    isDir: boolean
}

interface FileStat {
    size: i64           // size in bytes
    createdAt: Date
    modifiedAt: Date
    isFile: boolean
    isDir: boolean
}
```

## Example

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

## Errors

| Error | Cause |
|-------|-------|
| `std/fs is not available on target "avr"` | `std/fs` requires file system |
| `sync function inside async context` | Sync operations block event loop |
| `IOError: No such file or directory` | File not found |
| `IOError: Permission denied` | No access rights |

## See also

- [std/io](./io.md) — `Reader`/`Writer`, streams
- [std/net](./net.md) — network operations
- [std/json](./json.md) — JSON parsing of config files
- [Error handling](../06-errors/index.md) — `throws IOError`, `try`/`catch`
