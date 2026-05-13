# Project Types

[← Up](./index.md) | [Next →](./config.md) | [Previous ←](./index.md)

---

TSClang supports four project types, differing in directory structure, `tsc.package.json` fields, and compiler behavior. Type is determined by the `"type"` field.

## Executable (application)

Application with an entry point — top-level code of the entry file becomes the body of `main()` in C.

### Structure

```
myapp/
  tsc.package.json
  src/
    main.tsc
```

### tsc.package.json

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc"
}
```

**Required fields:**
- `name` — package name
- `version` — version (semver)
- `main` — entry point

### Example

```typescript
// src/main.tsc
console.log("Hello world");
```

```c
int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## TSClang library

Library in TSClang — generates `.h` files and `.a`/`.so`, without `main()`.

### Structure

```
mylib/
  tsc.package.json
  index.tsc
  src/
    foo.tsc
    bar.tsc
```

### tsc.package.json

```json
{
  "name": "@myco/mylib",
  "version": "1.0.0",
  "type": "library"
}
```

**Required fields:**
- `name`
- `version`
- `type: "library"`

### index.tsc

```typescript
export { foo } from "./src/foo.tsc";
export { bar } from "./src/bar.tsc";
```

`index.tsc` — re-export of public API. Consumer imports:

```typescript
import { foo, bar } from "@myco/mylib";
```

> If `"main"` is not specified, the compiler looks for `index.tsc` by convention.

## C-wrapper (wrapper over C library)

Package with declarations of C functions and types — metadata, not code. Official C-wrappers are published in the `@tsc/` scope.

### Structure

```
sqlite3/
  tsc.package.json
  index.d.tsc
```

### tsc.package.json

```json
{
  "name": "@tsc/sqlite3",
  "version": "1.0.0",
  "type": "library"
}
```

### index.d.tsc

```typescript
declare link {
    libs: ["sqlite3"];
    pkg_config: "sqlite3";
}

declare opaque type SqliteDb {
    destructor: sqlite3_close;
}

declare function sqlite3_open(path: string): SqliteDb throws SqliteError;
declare function sqlite3_step(stmt: Ref<SqliteStmt>): i32;

declare const SQLITE_OK: i32 = 0;
declare const SQLITE_ROW: i32 = 100;
```

### What is allowed in .d.tsc

| Allowed | Forbidden |
|---------|-----------|
| `declare function` | Functions with body `{ ... }` |
| `declare const` | `let` / `const` with initialization |
| `declare opaque type` | Classes with methods |
| `declare link` | `native {}` blocks |
| `declare type` | Regular code |

### Imports in .d.tsc

Side-effect import loads declarations into compilation context without exporting:

```typescript
// index.d.tsc
import "./types.d.tsc";
import "./functions.d.tsc";
```

```typescript
// types.d.tsc
declare opaque type SqliteDb { destructor: sqlite3_close }
declare opaque type SqliteStmt { destructor: sqlite3_finalize }
```

### Local declarations

For extending or replacing library declarations — local `.d.tsc` file with relative import:

```typescript
// types/sqlite3-ext.d.tsc — extension (declaration merging)
declare module "@tsc/sqlite3" {
    function sqlite3_backup_init(
        dest: Ref<SqliteDb>,
        src: Ref<SqliteDb>
    ): SqliteBackup
}
```

```typescript
// src/main.tsc
import { sqlite3_open } from "@tsc/sqlite3"
import "../types/sqlite3-ext"  // side-effect import adds sqlite3_backup_init

const backup = sqlite3_backup_init(db, db)
```

### How compilation works

C-wrapper is not compiled separately — it is metadata. When compiling the consumer:

**1. C-output:**

```c
typedef struct SqliteDb SqliteDb;
typedef struct SqliteStmt SqliteStmt;

extern SqliteDb* sqlite3_open(const char* path);
extern int sqlite3_step(SqliteStmt* stmt);
```

**2. CMakeLists.txt (in consumer):**

```cmake
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

**3. Automatic cleanup:**

```c
void myFunction() {
    SqliteDb* db = sqlite3_open("test.db");
    SqliteStmt* stmt = NULL;
    sqlite3_prepare_v2(db, "SELECT ...", &stmt);

cleanup:
    if (stmt) sqlite3_finalize(stmt);
    if (db) sqlite3_close(db);
}
```

### Ownership in FFI

| Annotation | Semantics | Destructor |
|-----------|-----------|------------|
| `T` (without Ref/Mut) | owned — destructor called automatically | yes |
| `Ref<T>` | borrowed — destructor is not called | no |
| `Mut<T>` | mutable borrow | no |

### Link configuration

Linking modes in `tsc.package.json`:

| Mode | Description |
|------|-------------|
| `system` | Library installed in the system (pkg-config) |
| `bundled` | Sources/library inside the package |
| `fetch` | Download by URL/git on install |

**System:**

```json
{
  "link": {
    "mode": "system",
    "pkg_config": "openssl"
  }
}
```

**Bundled:**

```json
{
  "link": {
    "mode": "bundled",
    "sources": ["lib/sqlite3.c"],
    "includes": ["lib"]
  }
}
```

**Fetch:**

```json
{
  "link": {
    "mode": "bundled",
    "fetch": {
      "url": "https://www.sqlite.org/2024/sqlite-amalgamation-3450000.zip",
      "strip": 1
    },
    "sources": ["sqlite3.c"],
    "includes": ["."]
  }
}
```

Fetch variants:

| Field | Description | Example |
|-------|-------------|---------|
| `url` | Archive URL | `"https://..."` |
| `git` | Git repository | `"https://github.com/user/repo.git"` |
| `tag` | Git tag | `"v1.0.0"` |
| `commit` | Git commit | `"a1b2c3d"` |
| `subdir` | Subfolder in repository | `"src"` |
| `strip` | Strip folder levels from archive | `1` |

**Build (source compilation):**

```json
{
  "link": {
    "mode": "bundled",
    "fetch": { "git": "https://github.com/example/lib.git", "tag": "v1.0.0" },
    "build": { "commands": ["./configure", "make"] },
    "sources": ["lib/libfoo.a"],
    "includes": ["include"]
  }
}
```

| Library type | `build` | Example |
|--------------|---------|---------|
| Amalgamation | not needed | SQLite |
| Makefile | `["make"]` | simple ones |
| CMake | `["cmake -B build", "cmake --build build"]` | complex ones |
| Configure + Make | `["./configure", "make"]` | autoconf |

**Platform-specific linking:**

```json
{
  "link": {
    "platforms": {
      "desktop": { "system": { "pkg_config": "openssl" } },
      "avr": { "sources": ["embedded/tinycrypt.c"], "includes": ["embedded"] },
      "arm": {
        "mcus": {
          "stm32f103": { "sources": ["embedded/mbedtls.c"], "includes": ["embedded"] }
        }
      }
    }
  }
}
```

## Platform profile

Platform profile — `.d.tsc` package declaring hardware capabilities: toolchain, heap, FPU, `usize` size, available libc functions.

### Structure

```
@nes/platform/
  tsc.package.json
  index.d.tsc
  toolchain.cmake
  include/
    std/
      hal.h
```

### tsc.package.json

```json
{
  "name": "@nes/platform",
  "version": "1.0.0",
  "type": "platform"
}
```

**Required fields:**
- `name`
- `version`
- `type: "platform"`

### Example index.d.tsc

```typescript
declare platform {
    toolchain: "cc65"
    toolchainFile: "toolchain.cmake"
    allocator: "static"
    scheduler: "cooperative"
    fpu: false
    bits: 8
    address_bits: 16
    stack_size: 256
    ram_size: 2048
    no_recursion: true
}
```

## Separation of responsibilities

| Aspect | Who is responsible |
|--------|------------------|
| `toolchain` | Platform profile / Project |
| `target` / `mcu` | Project |
| `heap`, `fpu`, `stack_size` | Platform profile |
| `sources`, `cflags`, `libs` | Library (C-wrapper) |

**Library** does not define: which compiler to use, platform parameters, toolchain file.

**Platform profile** defines: which toolchain, platform capabilities, available std/libc subset.

**Project** chooses: which profile to use, which target / mcu.

## Summary table

| Aspect | Executable | Library | C-wrapper | Platform profile |
|--------|------------|---------|-----------|------------------|
| `"type"` | not specified | `"library"` | `"library"` | `"platform"` |
| `"main"` | **required** | optional | optional | not needed |
| Entry file | `src/main.tsc` | `index.tsc` | `index.d.tsc` | `index.d.tsc` |
| Content | code + top-level | code + export | only declare | `declare platform {}` |
| Publish | `.exe` | `.tsc` + `.a` | only `.d.tsc` | `.d.tsc` + toolchain |

## C-output

Example of C-wrapper compilation by consumer:

```c
// build/c/main.c — consumer of @tsc/sqlite3
#include <stdint.h>

typedef struct SqliteDb SqliteDb;
typedef struct SqliteStmt SqliteStmt;

extern SqliteDb* sqlite3_open(const char* path);
extern int sqlite3_prepare_v2(SqliteDb* db, const char* sql, SqliteStmt** stmt);
extern int sqlite3_step(SqliteStmt* stmt);
extern const char* sqlite3_column_text(SqliteStmt* stmt, int col);
```

## Errors

| Error | Cause |
|-------|-------|
| `.d.tsc cannot contain function bodies` | Function with body in declaration file |
| `all declare opaque type must have destructor` | Opaque type without cleanup function |
| `unknown target arch '6502': specify a platform profile` | Unknown architecture without profile |
| `toolchain 'avr-gcc' not found in PATH` | Compiler not installed in system |
| `@myco/async requires "heap" but platform has heap: false` | Library and platform incompatibility |

## See also

- [Configuration](./config.md) — `tsc.package.json` fields
- [Embedded build](./embedded.md) — AVR, ARM, retro platforms
- [Modules: .d.tsc](../08-modules/d-tsc.md) — declaration file syntax
- [Memory: ownership](../05-memory/ownership-types.md) — owned/borrow at FFI
