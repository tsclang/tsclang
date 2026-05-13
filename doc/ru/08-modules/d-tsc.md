# .d.tsc файлы — декларации для C interop

[← Вверх](./index.md) | [Следующий →](./native.md) | [Предыдущий ←](./import-export.md)

---

`.d.tsc` — аналог `.d.ts` из TypeScript. Содержит только объявления без тел — компилятор использует их для type checking и кодогенерации. Предназначен для типизации C-библиотек и бинарных TSClang-пакетов.

## Виды деклараций

### 1. C struct с известным layout

Обычный `type` — поля и их типы известны:

```typescript
// time.d.tsc
declare type Timespec = { tv_sec: i64; tv_nsec: i64 }
declare function clock_gettime(clockid: i32, ts: Mut<Timespec>): i32
```

Компилятор генерирует C struct:

```c
typedef struct { int64_t tv_sec; int64_t tv_nsec; } Timespec;
int clock_gettime(int32_t clockid, Timespec* ts);
```

### 2. Opaque C handle

Структура неизвестна — доступна только через указатель. Указывается `destructor` для автоматического освобождения:

```typescript
// sqlite3.d.tsc
declare opaque type SqliteDb {
    destructor: sqlite3_close
}
declare opaque type SqliteStmt {
    destructor: sqlite3_finalize
}
```

`destructor` — C-функция, которую компилятор вставляет в `goto cleanup` при выходе из scope.

### 3. C функции

Ownership выражается через систему типов:

```typescript
declare function sqlite3_open(path: string): SqliteDb              // owned
declare function sqlite3_exec(db: Ref<SqliteDb>, sql: string): i32 // db borrowed
declare function sqlite3_prepare(db: Ref<SqliteDb>, sql: string): SqliteStmt
declare function sqlite3_step(stmt: Ref<SqliteStmt>): i32
declare function sqlite3_errmsg(db: Ref<SqliteDb>): Ref<string>    // borrowed — не освобождать
```

- `T` (без обёртки) — **owned**: деструктор вызовётся при drop
- `Ref<T>` — **borrowed**: деструктор не вызывается

### 4. C константы

```typescript
declare const SQLITE_OK: i32 = 0
declare const SQLITE_ROW: i32 = 100
declare const SQLITE_DONE: i32 = 101
```

### 5. MMIO-регистры (embedded)

Memory-mapped регистры микроконтроллеров. Тип определяет права доступа:

| Тип | Права | Пример |
|-----|-------|--------|
| `Mut<u8>` | Read/Write | `PORTB` — порт вывода |
| `Ref<u8>` | Read-only | `PINB` — порт ввода |

```typescript
// avr/io.d.tsc
declare const PORTB: Mut<u8>   // read/write register
declare const DDRB:  Mut<u8>   // direction register
declare const PINB:  Ref<u8>   // read-only input pin
```

Компилятор генерирует volatile C макрос:

```c
#define PORTB (*(volatile uint8_t*)0x25)
#define DDRB  (*(volatile uint8_t*)0x24)
#define PINB  (*(const volatile uint8_t*)0x23)
```

## Полный пример — sqlite3.d.tsc

```typescript
declare opaque type SqliteDb   { destructor: sqlite3_close    }
declare opaque type SqliteStmt { destructor: sqlite3_finalize }

declare function sqlite3_open(path: string): SqliteDb
declare function sqlite3_exec(db: Ref<SqliteDb>, sql: string): i32
declare function sqlite3_prepare(db: Ref<SqliteDb>, sql: string): SqliteStmt
declare function sqlite3_step(stmt: Ref<SqliteStmt>): i32
declare function sqlite3_errmsg(db: Ref<SqliteDb>): Ref<string>
declare function sqlite3_column_text(stmt: Ref<SqliteStmt>, col: i32): Ref<string>
```

Использование:

```typescript
import { SqliteDb, sqlite3_open, sqlite3_exec, sqlite3_prepare } from "./sqlite3.d"

function saveUser(name: string): void {
    let db = sqlite3_open("app.db")
    sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS users (name TEXT)")
    let stmt = sqlite3_prepare(db, `INSERT INTO users VALUES ('${name}')`)
    sqlite3_step(stmt)
    // stmt → sqlite3_finalize(stmt) автоматически
    // db   → sqlite3_close(db) автоматически
}
```

## Разделение на несколько файлов

Через side-effect imports:

```typescript
// index.d.tsc
import "./types.d.tsc"
import "./functions.d.tsc"
```

```typescript
// types.d.tsc
declare opaque type SqliteDb { destructor: sqlite3_close }
declare opaque type SqliteStmt { destructor: sqlite3_finalize }
```

```typescript
// functions.d.tsc
declare function sqlite3_open(path: string): SqliteDb
declare function sqlite3_step(stmt: Ref<SqliteStmt>): i32
```

## Declaration Merging

`declare module "foo" { }` добавляет к существующим декларациям, не заменяя:

```typescript
import "@myco/mylib"
declare module "@myco/mylib" {
    interface Request {
        user?: User
    }
}
```

Конфликт типов при мёрдже (одно имя, разные сигнатуры) — ошибка компилятора.

## Link configuration

Подключение C-библиотек к проекту — через конфигурацию в `tsc.package.json`:

| Тип | Описание |
|-----|---------|
| `system` | Системная библиотека (уже установлена, `-l<name>`) |
| `bundled` | Исходники библиотеки в проекте, компилируются вместе |
| `fetch` | Загрузка из реестра при сборке |

## Variadic C функции — тип Scalar

C variadic функции (`printf`, `fprintf`) типизируются через `Scalar`:

```typescript
// std/libc.d.tsc
export type Scalar = i8 | u8 | i16 | u16 | i32 | u32 | i64 | u64
                   | f32 | f64 | number | usize | string | Ref<u8[]>

declare function printf(fmt: string, ...args: Scalar[]): i32
```

```typescript
import { printf } from "std/libc"

printf("%d", 42)             // ✅
printf("%s %d", "age:", 25)  // ✅
printf("%d", user)           // ❌ User не Scalar
printf("%d", [1, 2, 3])     // ❌ i32[] не Scalar
```

`Scalar` допустим **только как тип параметра**. Как тип переменной — ошибка:

```typescript
const x: Scalar = 42    // ❌ Scalar как тип переменной запрещён
function log(fmt: string, ...args: Scalar[]): void { /* ... */ }  // ✅
```

## C-output

### Автоматический cleanup

```c
void saveUser(String name) {
    sqlite3* db = NULL;
    sqlite3_stmt* stmt = NULL;

    db = sqlite3_open("app.db");
    sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS users (name TEXT)");
    stmt = sqlite3_prepare_v2(db, ..., -1, NULL, NULL);
    sqlite3_step(stmt);

cleanup:
    if (stmt) sqlite3_finalize(stmt);
    if (db)   sqlite3_close(db);
}
```

### Variadic обёртка

```typescript
function log(level: string, fmt: string, ...args: Scalar[]): void {
    printf("[%s] ", level)
    printf(fmt, ...args)
}
```

```c
void log(const char* level, const char* fmt, ...) {
    printf("[%s] ", level);
    va_list args;
    va_start(args, fmt);
    vprintf(fmt, args);
    va_end(args);
}
```

## Ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `User не является Scalar` | Нескалярный тип в variadic C-функции | Передайте только Scalar-типы |
| `Scalar как тип переменной запрещён` | `const x: Scalar = 42` | Scalar допустим только как тип параметра |
| `conflict in declaration merge` | Одинаковое имя, разные сигнатуры | Устраните конфликт в декларациях |
| `cannot determine ownership` | C API с непоследовательным ownership | Используйте `any` и управляйте вручную |

## См. также

- [Импорт / экспорт](./import-export.md) — `import type`, path aliases
- [native — inline C](./native.md) — вербатимная вставка C-кода
- [Callbacks и FnPtr\<T\>](./callbacks.md) — function pointers для C callbacks
- [Память: Ref\<T\> / Mut\<T\>](../05-memory/ref.md) — borrowed vs owned в `.d.tsc`
- [Auto Drop](../05-memory/auto-drop.md) — `goto cleanup` для opaque деструкторов
