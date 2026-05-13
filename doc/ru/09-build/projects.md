# Типы проектов

[← Вверх](./index.md) | [Следующий →](./config.md) | [Предыдущий ←](./index.md)

---

TSClang поддерживает четыре типа проектов, отличающихся структурой каталогов, полями `tsc.package.json` и поведением компилятора. Тип определяется полем `"type"`.

## Executable (приложение)

Приложение с точкой входа — top-level код entry-файла становится телом `main()` в C.

### Структура

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

**Обязательные поля:**
- `name` — имя пакета
- `version` — версия (semver)
- `main` — точка входа

### Пример

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

## TSClang-библиотека

Библиотека на TSClang — генерирует `.h`-файлы и `.a`/`.so`, без `main()`.

### Структура

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

**Обязательные поля:**
- `name`
- `version`
- `type: "library"`

### index.tsc

```typescript
export { foo } from "./src/foo.tsc";
export { bar } from "./src/bar.tsc";
```

`index.tsc` — реэкспорт публичного API. Потребитель импортирует:

```typescript
import { foo, bar } from "@myco/mylib";
```

> Если `"main"` не указан, компилятор ищет `index.tsc` по конвенции.

## C-wrapper (обёртка над C-библиотекой)

Пакет с декларациями C-функций и типов — metadata, не код. Официальные C-wrapper'ы публикуются в scope `@tsc/`.

### Структура

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

### Что разрешено в .d.tsc

| Разрешено | Запрещено |
|-----------|-----------|
| `declare function` | Функции с телом `{ ... }` |
| `declare const` | `let` / `const` с инициализацией |
| `declare opaque type` | Классы с методами |
| `declare link` | `native {}` блоки |
| `declare type` | Обычный код |

### Импорты в .d.tsc

Side-effect import загружает декларации в контекст компиляции без экспорта:

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

### Локальные декларации

Для расширения или замены деклараций библиотек — локальный `.d.tsc` файл с относительным импортом:

```typescript
// types/sqlite3-ext.d.tsc — расширение (declaration merging)
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
import "../types/sqlite3-ext"  // side-effect import добавляет sqlite3_backup_init

const backup = sqlite3_backup_init(db, db)
```

### Как работает компиляция

C-wrapper не компилируется отдельно — это metadata. При компиляции потребителя:

**1. C-output:**

```c
typedef struct SqliteDb SqliteDb;
typedef struct SqliteStmt SqliteStmt;

extern SqliteDb* sqlite3_open(const char* path);
extern int sqlite3_step(SqliteStmt* stmt);
```

**2. CMakeLists.txt (у потребителя):**

```cmake
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

**3. Автоматический cleanup:**

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

### Ownership в FFI

| Аннотация | Семантика | Деструктор |
|-----------|-----------|------------|
| `T` (без Ref/Mut) | owned — деструктор вызывается автоматически | да |
| `Ref<T>` | borrowed — деструктор не вызывается | нет |
| `Mut<T>` | mutable borrow | нет |

### Link конфигурация

Режимы линковки в `tsc.package.json`:

| Режим | Описание |
|-------|----------|
| `system` | Библиотека установлена в системе (pkg-config) |
| `bundled` | Исходники/библиотека внутри пакета |
| `fetch` | Скачать по URL/git при установке |

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

Варианты `fetch`:

| Поле | Описание | Пример |
|------|----------|--------|
| `url` | URL архива | `"https://..."` |
| `git` | Git репозиторий | `"https://github.com/user/repo.git"` |
| `tag` | Git тег | `"v1.0.0"` |
| `commit` | Git коммит | `"a1b2c3d"` |
| `subdir` | Подпапка в репозитории | `"src"` |
| `strip` | Убрать уровней папок из архива | `1` |

**Build (сборка исходников):**

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

| Тип библиотеки | `build` | Пример |
|----------------|---------|--------|
| Amalgamation | не нужен | SQLite |
| Makefile | `["make"]` | простые |
| CMake | `["cmake -B build", "cmake --build build"]` | сложные |
| Configure + Make | `["./configure", "make"]` | автоconf |

**Платформо-специфичная линковка:**

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

Профиль платформы — `.d.tsc` пакет, декларирующий возможности железа: toolchain, heap, FPU, размер `usize`, доступные libc-функции.

### Структура

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

**Обязательные поля:**
- `name`
- `version`
- `type: "platform"`

### Пример index.d.tsc

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

## Разделение ответственности

| Аспект | Кто отвечает |
|--------|--------------|
| `toolchain` | Platform profile / Проект |
| `target` / `mcu` | Проект |
| `heap`, `fpu`, `stack_size` | Platform profile |
| `sources`, `cflags`, `libs` | Библиотека (C-wrapper) |

**Библиотека** не определяет: какой компилятор использовать, параметры платформы, toolchain file.

**Platform profile** определяет: какой toolchain, возможности платформы, доступный subset std/libc.

**Проект** выбирает: какой profile использовать, какой target / mcu.

## Сводная таблица

| Аспект | Executable | Библиотека | C-wrapper | Platform profile |
|--------|------------|-----------|-----------|------------------|
| `"type"` | не указан | `"library"` | `"library"` | `"platform"` |
| `"main"` | **обязательно** | опционально | опционально | не нужно |
| Entry файл | `src/main.tsc` | `index.tsc` | `index.d.tsc` | `index.d.tsc` |
| Содержимое | код + top-level | код + export | только declare | `declare platform {}` |
| Публикация | `.exe` | `.tsc` + `.a` | только `.d.tsc` | `.d.tsc` + toolchain |

## C-output

Пример компиляции C-wrapper потребителем:

```c
// build/c/main.c — потребитель @tsc/sqlite3
#include <stdint.h>

typedef struct SqliteDb SqliteDb;
typedef struct SqliteStmt SqliteStmt;

extern SqliteDb* sqlite3_open(const char* path);
extern int sqlite3_prepare_v2(SqliteDb* db, const char* sql, SqliteStmt** stmt);
extern int sqlite3_step(SqliteStmt* stmt);
extern const char* sqlite3_column_text(SqliteStmt* stmt, int col);
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `.d.tsc cannot contain function bodies` | Функция с телом в declaration-файле |
| `all declare opaque type must have destructor` | Opaque type без cleanup-функции |
| `unknown target arch '6502': specify a platform profile` | Неизвестная архитектура без профиля |
| `toolchain 'avr-gcc' not found in PATH` | Компилятор не установлен в системе |
| `@myco/async requires "heap" but platform has heap: false` | Несовместимость библиотеки и платформы |

## См. также

- [Конфигурация](./config.md) — поля `tsc.package.json`
- [Embedded-сборка](./embedded.md) — AVR, ARM, ретро-платформы
- [Модули: .d.tsc](../08-modules/d-tsc.md) — синтаксис declaration-файлов
- [Память: ownership](../05-memory/ownership-types.md) — owned/borrow при FFI
