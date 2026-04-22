# TSClang — std/fs: реализация

> Детальная спецификация реализации `std/fs`.
> Шаг 3 в плане: документация → тесты → реализация.

## Зависимости

- Sync: `<stdio.h>`, `<sys/stat.h>`, `<dirent.h>`, Windows `<io.h>`/`<direct.h>`
- Async (шаг 3b): libuv `uv_fs_*` family
- Desktop only — `#[target(avr)]` → ошибка компилятора

## Типы

```c
/* Запись директории */
typedef struct {
    String  name;      /* имя файла/директории без пути */
    String  path;      /* полный путь */
    bool    is_file;
    bool    is_dir;
} TscDirEntry;

typedef struct { TscDirEntry *data; size_t length; size_t capacity; } TscDirEntryArray;

/* Метаданные файла */
typedef struct {
    int64_t size;      /* байты */
    bool    is_file;
    bool    is_dir;
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

## Реализация (шаг 3a — POSIX)

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

### Async-обёртка (шаг 3a)

Async-версии — обёртки вокруг sync для desktop (выполняют sync внутри `_async`, poll ставит `_done`):

```c
TscFsReadAwaitable tsc_fs_read_async(String path) {
    TscFsReadAwaitable a = {0};
    a._result = tsc_fs_read_sync(path);
    return a;   // _done = false, poll завершит немедленно
}
void tsc_fs_read_poll(TscFsReadAwaitable *a) { a->_done = true; }
```

### Реализация async (шаг 3b — libuv)

Заменяет sync-обёртку настоящим async I/O:
- `uv_fs_open` → `uv_fs_fstat` → `uv_fs_read` (loop) → `uv_fs_close`
- Callback сохраняет результат в awaitable; `_poll` проверяет флаг готовности

## Тесты

### Async-тесты

| Тест | Файл | Статус |
|------|------|--------|
| watch | `doc/phase19/fs/watch` | ✗ ждёт шага 3 |
| read-file | `doc/phase19/fs/read-file` | ✗ ждёт шага 3 |
| read-file-bytes | `doc/phase19/fs/read-file-bytes` | ✗ ждёт шага 3 |
| write-file | `doc/phase19/fs/write-file` | ✗ ждёт шага 3 |
| append-file | `doc/phase19/fs/append-file` | ✗ ждёт шага 3 |
| remove | `doc/phase19/fs/remove` | ✗ ждёт шага 3 |
| rename | `doc/phase19/fs/rename` | ✗ ждёт шага 3 |
| mkdir | `doc/phase19/fs/mkdir` | ✗ ждёт шага 3 |
| exists | `doc/phase19/fs/exists` | ✗ ждёт шага 3 |
| stat | `doc/phase19/fs/stat` | ✗ ждёт шага 3 |
| readdir | `doc/phase19/fs/readdir` | ✗ ждёт шага 3 |
| err-fs-embedded | `doc/phase19/fs/err-fs-embedded` | ✗ ждёт шага 3 |

### Sync-тесты

| Тест | Файл | Статус |
|------|------|--------|
| read-file-sync | `doc/phase19/fs/read-file-sync` | ✗ ждёт шага 3 |
| read-file-bytes-sync | `doc/phase19/fs/read-file-bytes-sync` | ✗ ждёт шага 3 |
| write-file-sync | `doc/phase19/fs/write-file-sync` | ✗ ждёт шага 3 |
| append-file-sync | `doc/phase19/fs/append-file-sync` | ✗ ждёт шага 3 |
| remove-sync | `doc/phase19/fs/remove-sync` | ✗ ждёт шага 3 |
| rename-sync | `doc/phase19/fs/rename-sync` | ✗ ждёт шага 3 |
| mkdir-sync | `doc/phase19/fs/mkdir-sync` | ✗ ждёт шага 3 |
| exists-sync | `doc/phase19/fs/exists-sync` | ✗ ждёт шага 3 |
| stat-sync | `doc/phase19/fs/stat-sync` | ✗ ждёт шага 3 |
| readdir-sync | `doc/phase19/fs/readdir-sync` | ✗ ждёт шага 3 |
