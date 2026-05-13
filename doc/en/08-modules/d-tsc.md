# .d.tsc Files — Declarations for C Interop

[← Up](./index.md) | [Next →](./native.md) | [Previous ←](./import-export.md)

---

`.d.tsc` — analog of `.d.ts` from TypeScript. Contains only declarations without bodies — the compiler uses them for type checking and code generation. Intended for typing C libraries and binary TSClang packages.

## Kinds of Declarations

### 1. C struct with Known Layout

Regular `type` — fields and their types are known:

```typescript
// time.d.tsc
declare type Timespec = { tv_sec: i64; tv_nsec: i64 }
declare function clock_gettime(clockid: i32, ts: Mut<Timespec>): i32
```

The compiler generates a C struct:

```c
typedef struct { int64_t tv_sec; int64_t tv_nsec; } Timespec;
int clock_gettime(int32_t clockid, Timespec* ts);
```

### 2. Opaque C Handle

Structure is unknown — accessible only via pointer. `destructor` specified for automatic cleanup:

```typescript
// sqlite3.d.tsc
declare opaque type SqliteDb {
    destructor: sqlite3_close
}
declare opaque type SqliteStmt {
    destructor: sqlite3_finalize
}
```

`destructor` — C function that the compiler inserts into `goto cleanup` on scope exit.

### 3. C Functions

Ownership is expressed through the type system:

```typescript
declare function sqlite3_open(path: string): SqliteDb              // owned
declare function sqlite3_exec(db: Ref<SqliteDb>, sql: string): i32 // db borrowed
declare function sqlite3_prepare(db: Ref<SqliteDb>, sql: string): SqliteStmt
declare function sqlite3_step(stmt: Ref<SqliteStmt>): i32
declare function sqlite3_errmsg(db: Ref<SqliteDb>): Ref<string>    // borrowed — do not free
```

- `T` (no wrapper) — **owned**: destructor called on drop
- `Ref<T>` — **borrowed**: destructor not called

### 4. C Constants

```typescript
declare const SQLITE_OK: i32 = 0
declare const SQLITE_ROW: i32 = 100
declare const SQLITE_DONE: i32 = 101
```

### 5. MMIO Registers (Embedded)

Memory-mapped registers of microcontrollers. Type determines access rights:

| Type | Rights | Example |
|-----|-------|--------|
| `Mut<u8>` | Read/Write | `PORTB` — output port |
| `Ref<u8>` | Read-only | `PINB` — input port |

```typescript
// avr/io.d.tsc
declare const PORTB: Mut<u8>   // read/write register
declare const DDRB:  Mut<u8>   // direction register
declare const PINB:  Ref<u8>   // read-only input pin
```

The compiler generates volatile C macros:

```c
#define PORTB (*(volatile uint8_t*)0x25)
#define DDRB  (*(volatile uint8_t*)0x24)
#define PINB  (*(const volatile uint8_t*)0x23)
```

## Full Example — sqlite3.d.tsc

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

Usage:

```typescript
import { SqliteDb, sqlite3_open, sqlite3_exec, sqlite3_prepare } from "./sqlite3.d"

function saveUser(name: string): void {
    let db = sqlite3_open("app.db")
    sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS users (name TEXT)")
    let stmt = sqlite3_prepare(db, `INSERT INTO users VALUES ('${name}')`)
    sqlite3_step(stmt)
    // stmt → sqlite3_finalize(stmt) automatically
    // db   → sqlite3_close(db) automatically
}
```

## Splitting Across Multiple Files

Via side-effect imports:

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

`declare module "foo" { }` adds to existing declarations, does not replace:

```typescript
import "@myco/mylib"
declare module "@myco/mylib" {
    interface Request {
        user?: User
    }
}
```

Type conflict on merge (same name, different signatures) — compile error.

## Link Configuration

Connecting C libraries to the project — via configuration in `tsc.package.json`:

| Type | Description |
|-----|---------|
| `system` | System library (already installed, `-l<name>`) |
| `bundled` | Library sources in project, compiled together |
| `fetch` | Download from registry on build |

## Variadic C Functions — Scalar Type

C variadic functions (`printf`, `fprintf`) are typed via `Scalar`:

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
printf("%d", user)           // ❌ User is not Scalar
printf("%d", [1, 2, 3])     // ❌ i32[] is not Scalar
```

`Scalar` is allowed **only as a parameter type**. As a variable type — error:

```typescript
const x: Scalar = 42    // ❌ Scalar as variable type forbidden
function log(fmt: string, ...args: Scalar[]): void { /* ... */ }  // ✅
```

## C-output

### Automatic Cleanup

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

### Variadic Wrapper

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

## Errors

| Error | Cause | Solution |
|--------|---------|---------|
| `User is not Scalar` | Non-scalar type in variadic C function | Pass only Scalar types |
| `Scalar as variable type forbidden` | `const x: Scalar = 42` | Scalar is only allowed as parameter type |
| `conflict in declaration merge` | Same name, different signatures | Eliminate conflict in declarations |
| `cannot determine ownership` | C API with inconsistent ownership | Use `any` and manage manually |

## See Also

- [Import / Export](./import-export.md) — `import type`, path aliases
- [native — inline C](./native.md) — verbatim C code insertion
- [Callbacks and FnPtr\<T\>](./callbacks.md) — function pointers for C callbacks
- [Memory: Ref\<T\> / Mut\<T\>](../05-memory/ref.md) — borrowed vs owned in `.d.tsc`
- [Auto Drop](../05-memory/auto-drop.md) — `goto cleanup` for opaque destructors
