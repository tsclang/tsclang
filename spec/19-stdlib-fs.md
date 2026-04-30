# TSClang — std/fs: реализация

> Детальная спецификация реализации `std/fs`. Реализовано.

## Зависимости

- Sync: `<stdio.h>`, `<sys/stat.h>`, `<dirent.h>`, Windows `<io.h>`/`<direct.h>`
- Async (шаг 3b): libuv `uv_fs_*` family
- Desktop only — `#[target(avr)]` → ошибка компилятора

## Типы

```c
/* Запись директории */
typedef struct {
    String  name;           /* имя файла/директории без пути */
    String  path;           /* полный путь */
    bool    isFile;
    bool    isDirectory;
} TscDirEntry;

typedef struct { TscDirEntry *data; size_t length; size_t capacity; } TscDirEntryArray;

/* Метаданные файла */
typedef struct {
    int64_t size;           /* байты */
    bool    isFile;
    bool    isDirectory;
    int64_t mtime;          /* Unix timestamp последнего изменения */
} TscFileStat;

/* Awaitable structs (для async-версий) */
typedef struct { bool _done; String          _result; } TscFsReadAwaitable;
typedef struct { bool _done; Array_u8        _result; } TscFsReadBytesAwaitable;
typedef struct { bool _done; }                           TscFsVoidAwaitable;
typedef struct { bool _done; bool            _result; }  TscFsBoolAwaitable;
typedef struct { bool _done; TscFileStat     _result; }  TscFsStatAwaitable;
typedef struct { bool _done; TscDirEntryArray _result; } TscFsReaddirAwaitable;
```

## Async-функции

Используются внутри `async function` через `await`. Генерируют state machine.

| TSClang | C-async | C-poll | C-зависимость |
|---------|---------|--------|--------------|
| `await fs.readFile(path)` | `tsc_fs_read_async(path)` | `tsc_fs_read_poll` | `fopen+fread` / `uv_fs_read` |
| `await fs.readFileBytes(path)` | `tsc_fs_read_bytes_async(path)` | `tsc_fs_read_bytes_poll` | то же |
| `await fs.writeFile(path, data)` | `tsc_fs_write_async(path, data)` | `tsc_fs_write_poll` | `fopen("w")+fwrite` |
| `await fs.appendFile(path, data)` | `tsc_fs_append_async(path, data)` | `tsc_fs_append_poll` | `fopen("a")+fwrite` |
| `await fs.remove(path)` | `tsc_fs_remove_async(path)` | `tsc_fs_remove_poll` | `remove()` / `unlink()` |
| `await fs.rename(from, to)` | `tsc_fs_rename_async(from, to)` | `tsc_fs_rename_poll` | `rename()` |
| `await fs.mkdir(path)` | `tsc_fs_mkdir_async(path)` | `tsc_fs_mkdir_poll` | `mkdir()` |
| `await fs.exists(path)` | `tsc_fs_exists_async(path)` | `tsc_fs_exists_poll` | `stat()` |
| `await fs.stat(path)` | `tsc_fs_stat_async(path)` | `tsc_fs_stat_poll` | `stat()` |
| `await fs.readDir(path)` | `tsc_fs_readdir_async(path)` | `tsc_fs_readdir_poll` | `opendir+readdir` |
| `fs.watch(path, cb)` | `tsc_fs_watch(path, cb)` | — (sync cb) | `uv_fs_event` |

`TscFsVoidAwaitable` не имеет `_result` (нет полезной нагрузки).

## Sync-функции

Используются вне `async function`. Прямой вызов без state machine — проще в скриптовых контекстах.

| TSClang | C-функция | Возвращает | C-зависимость |
|---------|-----------|-----------|--------------|
| `fs.readFileSync(path)` | `tsc_fs_read_sync(path)` | `String` | `fopen+fread+fclose` |
| `fs.readFileBytesSync(path)` | `tsc_fs_read_bytes_sync(path)` | `Array_u8` | то же |
| `fs.writeFileSync(path, data)` | `tsc_fs_write_sync(path, data)` | `void` | `fopen("w")+fwrite` |
| `fs.appendFileSync(path, data)` | `tsc_fs_append_sync(path, data)` | `void` | `fopen("a")+fwrite` |
| `fs.removeSync(path)` | `tsc_fs_remove_sync(path)` | `void` | `remove()` |
| `fs.renameSync(from, to)` | `tsc_fs_rename_sync(from, to)` | `void` | `rename()` |
| `fs.mkdirSync(path)` | `tsc_fs_mkdir_sync(path)` | `void` | `mkdir()` |
| `fs.existsSync(path)` | `tsc_fs_exists_sync(path)` | `bool` | `stat()` |
| `fs.statSync(path)` | `tsc_fs_stat_sync(path)` | `TscFileStat` | `stat()` |
| `fs.readDirSync(path)` | `tsc_fs_readdir_sync(path)` | `TscDirEntryArray` | `opendir+readdir` |

Sync-функции недоступны внутри `async function` — ошибка компилятора (блокируют event loop).

## Реализация

```c
/* readFileSync: fopen → fseek(SEEK_END) → ftell → malloc → fread → fclose */
String tsc_fs_read_sync(String path) {
    char _p[512]; memcpy(_p, path.data, path.length); _p[path.length] = '\0';
    FILE *f = fopen(_p, "rb");
    if (!f) return (String){0};
    fseek(f, 0, SEEK_END); long sz = ftell(f); fseek(f, 0, SEEK_SET);
    char *buf = malloc(sz + 1);
    fread(buf, 1, sz, f); fclose(f);
    buf[sz] = '\0';
    return (String){ .data = buf, .length = sz };
}

/* existsSync: stat() → проверить код возврата */
bool tsc_fs_exists_sync(String path) {
    char _p[512]; memcpy(_p, path.data, path.length); _p[path.length] = '\0';
    struct stat st; return stat(_p, &st) == 0;
}

/* statSync: stat() → заполнить TscFileStat */
TscFileStat tsc_fs_stat_sync(String path) {
    char _p[512]; memcpy(_p, path.data, path.length); _p[path.length] = '\0';
    struct stat st; if (stat(_p, &st) != 0) return (TscFileStat){0};
    return (TscFileStat){
        .size = st.st_size,
        .is_file = S_ISREG(st.st_mode),
        .is_dir  = S_ISDIR(st.st_mode)
    };
}

/* readDirSync: opendir → readdir loop → closedir */
TscDirEntryArray tsc_fs_readdir_sync(String path) { /* ... */ }
```

Windows: `CreateFile`/`ReadFile`, `GetFileAttributes`, `FindFirstFile`/`FindNextFile`.

Async-версии — обёртки вокруг sync (выполняют sync внутри `_async`, poll ставит `_done = true` немедленно).

## Тесты

### Async-тесты

| Тест | Файл | Статус |
|------|------|--------|
| watch | `doc/phase19/fs/watch` | ✓ проходит |
| read-file | `doc/phase19/fs/read-file` | ✓ проходит |
| read-file-bytes | `doc/phase19/fs/read-file-bytes` | ✓ проходит |
| write-file | `doc/phase19/fs/write-file` | ✓ проходит |
| append-file | `doc/phase19/fs/append-file` | ✓ проходит |
| remove | `doc/phase19/fs/remove` | ✓ проходит |
| rename | `doc/phase19/fs/rename` | ✓ проходит |
| mkdir | `doc/phase19/fs/mkdir` | ✓ проходит |
| exists | `doc/phase19/fs/exists` | ✓ проходит |
| stat | `doc/phase19/fs/stat` | ✓ проходит |
| readdir | `doc/phase19/fs/readdir` | ✓ проходит |
| err-fs-embedded | `doc/phase19/fs/err-fs-embedded` | ✓ проходит |

### Sync-тесты

| Тест | Файл | Статус |
|------|------|--------|
| read-file-sync | `doc/phase19/fs/read-file-sync` | ✓ проходит |
| read-file-bytes-sync | `doc/phase19/fs/read-file-bytes-sync` | ✓ проходит |
| write-file-sync | `doc/phase19/fs/write-file-sync` | ✓ проходит |
| append-file-sync | `doc/phase19/fs/append-file-sync` | ✓ проходит |
| remove-sync | `doc/phase19/fs/remove-sync` | ✓ проходит |
| rename-sync | `doc/phase19/fs/rename-sync` | ✓ проходит |
| mkdir-sync | `doc/phase19/fs/mkdir-sync` | ✓ проходит |
| exists-sync | `doc/phase19/fs/exists-sync` | ✓ проходит |
| stat-sync | `doc/phase19/fs/stat-sync` | ✓ проходит |
| readdir-sync | `doc/phase19/fs/readdir-sync` | ✓ проходит |

> `doc/phase19/fs/file-info` и `doc/phase19/fs/read-dir` — пустые директории, тесты не написаны.
