# TSClang — Модульная система

- Синтаксис как в TypeScript: именованные `export` / `import { } from ""`
- Один файл = один модуль
- **Циклические импорты разрешены** — компилятор автоматически генерирует forward declarations в C

## Конвенции

2. **`index.tsc`** — публичный API для TSClang-библиотек
3. **`index.d.tsc`** — декларации для C-wrapper
4. **`std/` prefix** — стандартная библиотека (встроена, без `@`)
5. **`@tsc/` scope** — официальные пакеты в реестре (включая C-wrappers)
6. **`@scope/` scope** — для пользовательских библиотек и C-wrappers
7. **`.d.tsc`** — консистентно с `.d.ts` (declarations only)

## Export

Только именованные экспорты. `export default` запрещён — **осознанный разрыв с TS**.

Причина: C требует явного имени для каждого символа. Анонимные и default-экспорты не имеют имени для генерации C-кода. Кроме того, `import X from "./module"` в TSC означает namespace-импорт (см. ниже) — переопределение семантики default-импорта устраняет неоднозначность.

```typescript
export class User { ... }
export interface Drawable { ... }
export type UserId = i32;
export type Nullable<T> = T | null;
export function helper(): void { ... }
export const MAX: i32 = 100;

// реэкспорт
export { User, helper } from "./user";
```

Запрещено:
```typescript
export default class UserService { }    // ❌ — default запрещён
export default { x: 1, y: 2 }          // ❌ — нет имени для C-символа
export default function() { ... }       // ❌ — анонимная функция без имени
```

## Import

Два варианта импорта:

```typescript
// 1. Именованный — конкретные символы
import { User, createUser } from "./user";

// 2. Namespace — весь модуль как объект (аналог import * as X)
import User from "./user";   // все экспорты доступны через User.X
User.UserService
User.getUser()

// type-only импорт — только compile-time, генерирует forward declaration в C
import type { UserId, Drawable } from "./user";
```

> **Осознанный разрыв с TS:** в TypeScript `import X from "./module"` означает импорт default-экспорта. В TSClang это namespace-импорт всего модуля — эквивалент `import * as X from "./module"`. Default-экспортов нет, поэтому переопределение семантики не создаёт конфликта.

Запрещено:
```typescript
import AnyName from "./user"   // ❌ если нет экспорта с именем AnyName —
                               //    используй import { X } или namespace-импорт
```

`import type` важен для кодогена — позволяет избежать лишних `#include` в C:
```c
// import { User } → в .c файле:
#include "user.h"

// import type { UserId } → в .h файле:
typedef int32_t UserId;  // или forward declaration
```

## Порядок инициализации модулей

Каждый модуль с module-level переменными получает `_init()` функцию в C. Порядок вызовов определяется **топологической сортировкой** графа импортов — зависимости инициализируются раньше.

Для правильного порядка компилятор строит граф зависимостей и делает топологическую сортировку. Результат — одна функция `tsc_init_all()` с правильным порядком:

```c
// сгенерировано компилятором
static void tsc_init_all() {
    a_type_init();  // нет зависимостей — первый
    bar_init();     // зависит от a_type
    foo_init();     // зависит от a_type и bar
}

int main() {
    tsc_init_all();
    // ... код пользователя
}
```

Два случая циклических зависимостей:

- **Цикл через типы и функции** — разрешён, компилятор генерирует forward declarations в .h файлах
- **Цикл через module-level переменные** — физически неразрешимо, ошибка компилятора:
  ```
  error: circular initialization dependency detected
    src/a.tsc:2  aValue depends on bValue
    src/b.tsc:2  bValue depends on aValue
  hint: move one of these values into a function
  ```
  Пример в коде:
  ```typescript
  a.tsc: const aVal = bFunc()   // нужен b
  b.tsc: const bVal = aFunc()   // нужен a
  // кто инициализируется первым?
  ```

## Path Aliases

Path aliases — короткие имена для путей, избавляют от `../../..` в импортах:

```typescript
// Без aliases
import { utils } from "../../../shared/utils";

// С aliases
import { utils } from "#shared/utils";
```

### Символы для aliases

`@` зарезервирован для scopes пакетного реестра (`@mycompany/mylib`). Если использовать `@` для aliases — импорт `@lib/utils` становится неоднозначным (alias или пакет?). Поэтому aliases используют `#` или `~`:

| Символ | Назначение | Пример |
|--------|------------|--------|
| `@` | Scopes реестра | `@mycompany/mylib`, `@tsc/sqlite3` |
| `#` | Path aliases (рекомендуется) | `#/components/Button`, `#shared/utils` |
| `~` | Path aliases (альтернатива) | `~/components/Button` |

### Конфигурация

В `tsc.package.json`, поле `paths`:

```json
{
  "name": "my-project",
  "main": "src/main.tsc",
  "paths": {
    "#/*": ["./src/*"],
    "#shared/*": ["./src/shared/*"],
    "#ui/*": ["./src/components/ui/*"]
  }
}
```

Прямые aliases без префикса тоже допустимы, но могут конфликтовать со stdlib:

```json
{
  "paths": {
    "components/*": ["./src/components/*"],
    "shared/*": ["./src/shared/*"]
  }
}
```

> **Предупреждение:** если есть прямой alias `io/*`, то `import ... from "io"` резолвится в alias, а не в `std/io`. При прямых aliases всегда используйте явный `std/` для stdlib.

### Wildcard `*`

`*` в ключе заменяется на совпавшую часть в значении. Только один `*` на alias:

```json
{ "paths": { "#components/*": ["./src/components/*"] } }
```

```typescript
import { Button } from "#components/Button";      // → ./src/components/Button
import { Input } from "#components/forms/Input";  // → ./src/components/forms/Input
```

### Разрешённые символы в ключах

Только кросс-платформенные символы: `a-z A-Z 0-9 - _ . # $ % + = ( ) [ ] { } ; , ! ~ '`

Запрещены: `:` `\` `<` `>` `|` `"` `\0` `@` и `/` в роли не разделителя пути.

В отличие от TypeScript, который разрешает любые символы, TSClang ограничивает символы для кросс-платформенности.

### Стили aliases — сравнение

| Стиль | Пример | Конфликты со stdlib | Явность |
|-------|--------|---------------------|---------|
| `#/` (рекомендуется) | `#/components/Button` | Нет | Высокая |
| `~/` | `~/components/Button` | Нет | Средняя |
| Прямой | `components/Button` | Возможны | Низкая |

### Монорепозиторий

```json
// apps/web/tsc.package.json
{
  "paths": {
    "#core/*": ["../../packages/core/*"],
    "#ui/*": ["../../packages/ui/*"]
  }
}
```

## Точка входа

### Определение entry point

Компилятор ищет entry point по полю `"main"` в `tsc.package.json`:

```json
{
  "name": "mylib",
  "main": ""
}
```

Несколько точек входа — через `builds`:
```json
{
  "name": "myapp",
  "builds": {
    "server": { "main": "src/server.tsc" },
    "cli":    { "main": "src/cli.tsc" }
  }
}
```

`index.tsc`, `main.tsc` и др. **не являются** специальными именами.

## Определение проекта как библиотеки

Нужно явно зафиксировать намерение — указать в `tsc.package.json`:

```json
{
  "name": "mylib",
  "type": "library"
}
```

Обычно в библиотеке все файлы содержат только `export` — ни один не подходит как entry point. Компилятор собирает библиотеку: генерирует `.h`-файлы и `.a`/`.so`, без `main()`.

Поле `"type": "library"` гарантирует, что компилятор не будет искать entry point, ошибки не будет, библиотека останется библиотекой.

Для библиотек **рекомендуется** размещать файл декларации в корне проекта `index.d.tsc`.

## Генерация C main

Весь top-level код entry-файла автоматически становится телом `main()` в C. Писать функцию `main` не нужно:

```typescript
// main.tsc
const a: i32 = 1
console.log(a)
```
```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

Если в top-level коде есть хотя бы один `await` или вызов `async`-функции — компилятор автоматически запускает event loop:

```typescript
// main.tsc — async top-level
const res = await fetch("https://api.example.com")
console.log(res.status)
```
```c
static void tsc_main(EventLoop* loop) {
    // state machine из top-level кода
}

int main(void) {
    tsc_init_all();
    tsc_event_loop_run(tsc_main);
    return 0;
}
```

**Ошибки:**

- `"main"` не указан:
  ```
  error: cannot determine entry point
  hint: add "main" field to tsc.package.json:
    { "main": "src/main.tsc" }
  ```

- `"main"` указан, файл не существует:
  ```
  error: main file not found: src/main.tsc
  ```

- Типы импортов по источнику:
  - `"./path"` — локальный файл
  - `"std/libc"`, `"std/math"` и др. — встроенные декларации + генерирует `#include <...>` в C (краткая форма без `std/` тоже работает)
    ```typescript
    import { printf } from "std/libc";  // или просто "libc" — эквивалентно
    // компилятор знает сигнатуру printf — есть встроенный std/libc.d.tsc
    // генерирует в C: #include <stdio.h>
    ```
  - остальное — внешние пакеты из реестра
- **Файлы деклараций `.d.tsc`** — типизация внешнего кода:
  - Для C-библиотек без встроенных деклараций
  - Для `.tsc` модулей без исходников (бинарные пакеты)
  - Сообщество публикует `.d.tsc` для популярных C-либ в реестре
- **Если деклараций нет** — тип `any`, компилятор не ругается

## Executable (приложение)

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

### main.tsc

```typescript
console.log("Hello world");
```

Top-level код → тело `main()` в C.

## TSClang-библиотека

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

**Примечание:** `"main"` опционален. Если не указан, компилятор ищет `index.tsc` по конвенции.

## C-wrapper (обёртка над C-библиотекой)

### Имя в реестре

Официальные C-wrapper публикуются в scope `@tsc/`:

```
@tsc/sqlite3    — декларации для SQLite3
@tsc/openssl    — декларации для OpenSSL
@tsc/libcurl    — декларации для libcurl
```

Пользователь может опубликовать альтернативы в своём scope:

```
@vasya/sqlite3     — альтернативные декларации
@company/openssl   — корпоративные декларации
```

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

declare opaque type SqliteStmt {
    destructor: sqlite3_finalize;
}

declare function sqlite3_open(path: string): SqliteDb throws SqliteError;
declare function sqlite3_errmsg(db: Ref<SqliteDb>): Ref<string>;

declare function sqlite3_prepare_v2(
    db: Ref<SqliteDb>,
    sql: string,
    out stmt: Mut<SqliteStmt>
): i32;

declare function sqlite3_step(stmt: Ref<SqliteStmt>): i32;
declare function sqlite3_column_int(stmt: Ref<SqliteStmt>, col: i32): i32;
declare function sqlite3_column_text(stmt: Ref<SqliteStmt>, col: i32): Ref<string>;

declare const SQLITE_OK: i32 = 0;
declare const SQLITE_ROW: i32 = 100;
declare const SQLITE_DONE: i32 = 101;
```

**Содержимое:**
- `declare link` — информация о линковке (`libs`, `pkg_config`, `c_sources`, `c_includes`)
- `declare opaque type` — непрозрачные C-типы с деструкторами
- `declare function` — сигнатуры C-функций
- `declare const` — константы

**Ownership в FFI:**
- `T` (без Ref/Mut) — owned, деструктор вызовется автоматически
- `Ref<T>` — borrowed, деструктор не вызывается
- `Mut<T>` — mutable borrow

### Импорты в .d.tsc файлах

`.d.tsc` файлы содержат только декларации — они добавляют типы в окружение, но не экспортируют значения.

Для разделения declarations по файлам используется **side-effect import**:

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

```typescript
// functions.d.tsc
declare function sqlite3_open(path: string): SqliteDb throws SqliteError
declare function sqlite3_step(stmt: Ref<SqliteStmt>): i32
```

**Side-effect import** (`import "./file"`) загружает декларации в контекст компиляции без экспорта.

Это стандартный паттерн для `.d.tsc`:
- `declare platform {}` — декларация в глобальное окружение
- `declare module "std/libc" {}` — декларация в окружение модуля
- `declare opaque type` / `declare function` — декларации типов и функций

### Локальные декларации

Для переопределения или расширения деклараций библиотек — локальный `.d.tsc` файл и относительный импорт.

**Структура**:

```
myproject/
  tsc.package.json
  src/
    main.tsc
  types/
    sqlite3.d.tsc         ← своя декларация
    sqlite3-ext.d.tsc     ← расширение (declaration merging)
```

**Полная замена**:

```typescript
// types/sqlite3.d.tsc
declare link {
    libs: ["sqlite3"]
    pkg_config: "sqlite3"
}

declare opaque type SqliteDb {
    destructor: sqlite3_close
}

declare function sqlite3_open(path: string): SqliteDb throws SqliteError
declare function sqlite3_my_custom_func(db: Ref<SqliteDb>): i32
```

```typescript
// src/main.tsc
import { sqlite3_open, sqlite3_my_custom_func } from "./types/sqlite3"
```

**Расширение (declaration merging)**:

```typescript
// types/sqlite3-ext.d.tsc
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

**C-wrapper не компилируется отдельно.** Это metadata, не код.

При компиляции потребителя:

**1. C-output (у потребителя):**

```c
// build/c/main.c
#include <stdint.h>

typedef struct SqliteDb SqliteDb;
typedef struct SqliteStmt SqliteStmt;

extern SqliteDb* sqlite3_open(const char* path);
extern int sqlite3_prepare_v2(SqliteDb* db, const char* sql, SqliteStmt** stmt);
extern int sqlite3_step(SqliteStmt* stmt);
extern const char* sqlite3_column_text(SqliteStmt* stmt, int col);
```

**2. CMakeLists.txt (у потребителя):**

```cmake
# из declare link { libs: ["sqlite3"]; pkg_config: "sqlite3" }
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_include_directories(myapp PRIVATE ${SQLITE3_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

**3. Автоматический cleanup:**

```c
void myFunction() {
    SqliteDb* db = sqlite3_open("test.db");
    SqliteStmt* stmt = NULL;
    sqlite3_prepare_v2(db, "SELECT ...", &stmt);
    sqlite3_step(stmt);
    
cleanup:  // сгенерировано автоматически
    if (stmt) sqlite3_finalize(stmt);
    if (db) sqlite3_close(db);
}
```

### Публикация C-wrapper

#### Команда

```bash
tsclang publish
```

#### Что проверяется

1. `name` в формате `@scope/package`
2. `version` в формате semver
3. `index.d.tsc` существует
4. Все `declare opaque type` имеют `destructor`
5. Все `declare function` используют корректные типы

#### Что публикуется

```
@tsc/sqlite3@1.0.0/
  tsc.package.json
  index.d.tsc
```

Только два файла — никакого C-кода.

#### Использование

**Установка:**

```bash
tsclang install @tsc/sqlite3
```

**tsc.package.json потребителя:**

```json
{
  "dependencies": {
    "@tsc/sqlite3": "^1.0.0"
  }
}
```

**Импорт:**

```typescript
import { sqlite3_open, sqlite3_prepare_v2, sqlite3_step, 
         sqlite3_column_text, SQLITE_ROW, SqliteDb, SqliteStmt } from "@tsc/sqlite3";

const db = sqlite3_open("test.db");

let stmt: SqliteStmt;
sqlite3_prepare_v2(db, "SELECT name FROM users", stmt);

while (sqlite3_step(stmt) === SQLITE_ROW) {
    const name = sqlite3_column_text(stmt, 0);
    console.log(name);
}
```

### Link конфигурация

C-wrapper должен указать, откуда брать C-библиотеку. Конфигурация в `tsc.package.json` в поле `link`.

#### Режимы линковки

| Режим | Описание |
|-------|----------|
| `system` | Библиотека установлена в системе (pkg-config, libs) |
| `bundled` | Исходники/библиотека внутри пакета |
| `fetch` | Скачать по URL/git при установке |

#### System (системная библиотека)

```json
{
  "name": "@tsc/openssl",
  "version": "1.0.0",
  "type": "library",
  "link": {
    "mode": "system",
    "pkg_config": "openssl"
  }
}
```

Генерирует в CMakeLists.txt потребителя:
```cmake
find_package(PkgConfig REQUIRED)
pkg_check_modules(OPENSSL REQUIRED openssl)
target_include_directories(myapp PRIVATE ${OPENSSL_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${OPENSSL_LIBRARIES})
```

#### Bundled (исходники в пакете)

```json
{
  "name": "@tsc/sqlite3",
  "version": "1.0.0",
  "type": "library",
  "link": {
    "mode": "bundled",
    "sources": ["lib/sqlite3.c"],
    "includes": ["lib"]
  }
}
```

Исходники компилируются вместе с проектом потребителя.

#### Fetch (скачать при установке)

```json
{
  "name": "@tsc/sqlite3",
  "version": "1.0.0",
  "type": "library",
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

При `tsclang install`:
1. Скачать по URL/git в кэш
2. Распаковать
3. При сборке использовать `sources`

#### Build (сборка исходников)

Для библиотек, требующих сборку (configure/make/cmake):

```json
{
  "link": {
    "mode": "bundled",
    "fetch": {
      "git": "https://github.com/example/lib.git",
      "tag": "v1.0.0"
    },
    "build": {
      "commands": ["./configure", "make"]
    },
    "sources": ["lib/libfoo.a"],
    "includes": ["include"]
  }
}
```

| Тип библиотеки | `build` | Пример |
|----------------|---------|--------|
| Amalgamation (один .c) | не нужен | SQLite |
| Makefile | `["make"]` | простые |
| CMake | `["cmake -B build", "cmake --build build"]` | сложные |
| Configure + Make | `["./configure", "make"]` | автоconf |

#### Стандартные платформы для link

#### Embedded с разными чипами

```json
{
  "link": {
    "platforms": {
      "avr": {
        "mcus": {
          "atmega328p": {
            "sources": ["src/avr/atmega328.c"],
            "cflags": ["-mmcu=atmega328p", "-DF_CPU=16000000UL"]
          },
          "atmega2560": {
            "sources": ["src/avr/atmega2560.c"],
            "cflags": ["-mmcu=atmega2560", "-DF_CPU=16000000UL"]
          }
        }
      },
      "arm": {
        "mcus": {
          "stm32f103": {
            "sources": ["src/arm/stm32f1.c"],
            "cflags": ["-mcpu=cortex-m3", "-mthumb"]
          },
          "stm32f407": {
            "sources": ["src/arm/stm32f4.c"],
            "cflags": ["-mcpu=cortex-m4", "-mthumb", "-mfpu=fpv4-sp-d16"]
          }
        }
      }
    }
  }
}
```

При сборке проекта с `"target": "avr"`, `"mcu": "atmega328p"` — берётся соответствующая конфигурация.

#### Полный пример

```json
{
  "name": "@tsc/openssl",
  "version": "1.0.0",
  "type": "library",
  "link": {
    "platforms": {
      "desktop": {
        "system": {
          "pkg_config": "openssl"
        }
      },
      "windows": {
        "system": {
          "libs": ["libssl", "libcrypto"],
          "includes": ["C:/OpenSSL/include"]
        }
      },
      "arm": {
        "mcus": {
          "stm32f103": {
            "sources": ["embedded/mbedtls.c"],
            "includes": ["embedded"]
          },
          "stm32f407": {
            "sources": ["embedded/mbedtls.c"],
            "includes": ["embedded"],
            "cflags": ["-mfpu=fpv4-sp-d16"]
          }
        }
      },
      "avr": {
        "sources": ["embedded/tinycrypt.c"],
        "includes": ["embedded"]
      }
    }
  }
}
```

#### declare link в index.d.tsc

При наличии `link` в `tsc.package.json`, `declare link` в `index.d.tsc` можно убрать или оставить для документации:

```typescript
// index.d.tsc — без declare link, всё в tsc.package.json

declare opaque type SqliteDb {
    destructor: sqlite3_close;
}

declare function sqlite3_open(path: string): SqliteDb throws SqliteError;
// ...
```

## Platform profile

### Структура

```
platform/
  tsc.package.json
  index.d.tsc
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

---

## Разделение ответственности

| Аспект | Кто отвечает |
|--------|--------------|
| `toolchain` | Platform profile / Проект |
| `target` / `mcu` | Проект |
| `heap`, `fpu`, `stack_size` | Platform profile |
| `sources`, `cflags`, `libs` | Библиотека (C-wrapper) |

**Библиотека** не определяет:
- Какой компилятор использовать
- Параметры платформы
- Toolchain file

**Platform profile** определяет:
- Какой toolchain
- Возможности платформы
- Доступный subset std/libc

**Проект** выбирает:
- Какой profile использовать
- Какой target / mcu

---

## Что НЕ входит в ответственность библиотеки

| Аспект | Ответственность | Где настраивается |
|--------|-----------------|-------------------|
| `toolchain` | Проект / Platform profile | `tsc.package.json` проекта или `@scope/platform` |
| `target` / `mcu` | Проект | `tsc.package.json` → `builds.*.target` |
| Platform profile | Отдельный пакет | `@nes/platform`, `@spectrum/platform`, локальный `.d.tsc` |

Библиотека декларирует:
- Какие `sources` / `includes` использовать
- Какие `cflags` нужны
- Какие `libs` линковать

Библиотека **не** определяет:
- Какой компилятор использовать (`avr-gcc`, `cc65`, `clang`)
- Параметры платформы (`heap`, `fpu`, `stack_size`)
- Toolchain file для CMake

Это разделяет ответственности:
- **Библиотека** = "вот мой код, вот мои флаги"
- **Проект** = "я собираюсь под AVR, использую avr-gcc"
- **Platform profile** = "для NES нужен cc65 + этот toolchain.cmake"

---

## Сводная таблица

| Аспект | Executable | TSClang-библиотека | C-wrapper | Platform profile |
|--------|------------|-------------------|-----------|------------------|
| `"type"` | не указан | `"library"` | `"library"` | `"platform"` |
| `"name"` | любое | `@scope/name` | `@scope/name` | `@scope/name` |
| `"main"` | **обязательно** | опционально | опционально | не нужно |
| Entry файл | `src/main.tsc` | `index.tsc` | `index.d.tsc` | `index.d.tsc` |
| Содержимое | код + top-level | код + export | только declare, `declare opaque type`, `declare function` | `declare platform {}`, subset std/libc |
| Публикация | `.exe` | `.tsc` + `.a` | только `.d.tsc` | `.d.tsc` + toolchain |

## Declaration Merging — расширение без замены

Стандартный TypeScript-паттерн: `declare module "foo" { }` добавляет к существующим декларациям, не заменяя их. Работает идентично TS:

```typescript
// @types/sqlite3 уже объявляет SqliteDb, sqlite3_open, ...

// types/sqlite3-ext.d.tsc — добавляем недостающее
declare module "sqlite3" {
    // функция которой нет в @types/sqlite3:
    function sqlite3_backup_init(
        dest: Ref<SqliteDb>,
        src:  Ref<SqliteDb>
    ): SqliteBackup
}
```

```typescript
// расширение interface из установленного пакета — тот же паттерн что в TS
import "@myco/mylib"
declare module "@myco/mylib" {
    interface Request {
        user?: User   // добавляем своё поле
    }
}
```

Компилятор мержит все `declare module "foo"` из всех найденных файлов. Конфликт типов при мёрдже (одно и то же имя, разные сигнатуры) → ошибка компилятора.

## Variadic C функции — тип Scalar

C variadic функции (`printf`, `fprintf` и др.) принимают произвольное число аргументов. Для их типизации `std/libc` экспортирует тип `Scalar` — объединение всех C-совместимых скалярных типов:

```typescript
// std/libc.d.tsc
export type Scalar = i8 | u8 | i16 | u16 | i32 | u32 | i64 | u64
                   | f32 | f64 | number | usize | string | Ref<u8[]>

declare function printf(fmt: string, ...args: Scalar[]): i32
declare function fprintf(stream: Ref<FILE>, fmt: string, ...args: Scalar[]): i32
declare function sprintf(buf: Mut<u8[]>, fmt: string, ...args: Scalar[]): i32
declare function snprintf(buf: Mut<u8[]>, n: usize, fmt: string, ...args: Scalar[]): i32
```

```typescript
import { printf, Scalar } from "std/libc"

// ✅ правильное использование
printf("%d", 42)
printf("%s %d", "age:", 25)
printf("%.2f", 3.14)
printf("%zu", buf.length)          // usize

// ❌ ошибки компилятора
printf("%d", user)                 // error: User не является Scalar
printf("%d", [1, 2, 3])           // error: i32[] не является Scalar
printf("%d", () => 42)            // error: замыкание не является Scalar
printf("%d", null)                // error: null не является Scalar
```

`Scalar` — обычный тип, его можно импортировать и использовать в пользовательских обёртках:

```typescript
import { printf, Scalar } from "std/libc"

// обычная TSClang-функция — не declare
function log(level: string, fmt: string, ...args: Scalar[]): void {
    printf("[%s] ", level)
    printf(fmt, ...args)    // компилятор разворачивает в vprintf-вызов
}

log("INFO", "connected on port %d", 8080)   // ✅
log("ERROR", "user: %s", user)              // ❌ User не Scalar
```

C-output для пользовательской обёртки:

```c
void log(const char* level, const char* fmt, ...) {
    printf("[%s] ", level);
    va_list args;
    va_start(args, fmt);
    vprintf(fmt, args);
    va_end(args);
}
```

**`Scalar` допустим только как тип параметра в функциях.** Как тип переменной — ошибка компилятора (это union, C-представления нет):

```typescript
const x: Scalar = 42    // ❌ Scalar как тип переменной запрещён
function log(fmt: string, ...args: Scalar[]): void { ... }  // ✅ только параметр
```

**Проверка формат-строки** (`%d` vs тип аргумента) — не компилятор, только линтер (аналог `-Wformat` в clang).

## Inline C — `native`

Последний resort когда `.d.tsc` недостаточно: C макросы, прямой доступ к регистрам, inline asm, platform ifdefs. Вставляет C-код verbatim в сгенерированный output.

```typescript
// простая вставка
native `PORTB |= (1 << PB5);`

// с интерполяцией TSClang-переменных — компилятор подставляет C-имя
const pin: u8 = 5
native `PORTB |= (1 << ${pin});`

// многострочно
native `
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        counter++;
    }
`

// inline asm через C — отдельного unsafe asm нет, используем native
native `asm volatile("nop");`
native `asm volatile("sei");`   // enable interrupts (AVR)
native `asm volatile("cli");`   // disable interrupts (AVR)

// GCC inline asm с input/output операндами
const val: u8 = 0xFF
native `
    asm volatile(
        "out %0, %1"
        :
        : "I" (_SFR_IO_ADDR(PORTB)), "r" (${val})
    );
`

// platform ifdef
native `
    #ifdef __AVR__
    power_usart0_disable();
    #endif
`
```

Компилятор и линтер выдают предупреждение на каждый `native` блок:
```
warning: native block — C code inserted verbatim, memory management is manual
```

Подавление:
```typescript
// tsc.package.json — глобально для проекта
{ "allowNative": true }
```

**Ограничения:**
- Как expression — требует явную аннотацию типа (вывести из C невозможно):
  ```typescript
  const val: i32 = native `read_register(PINB)`      // ✅
  const ptr: Ref<u8[]> = native `get_buffer_ptr()`   // ✅
  const val = native `read_register(PINB)`            // ❌ error: native expression requires explicit type annotation
  ```
- TSClang-переменные объявленные внутри — невидимы type checker'у
- Borrow checker отключён — управление памятью ручное
- `${expr}` — только простые переменные, не произвольные выражения

**Ассемблерные вставки** — через `native` с C's `asm volatile()`. Отдельного синтаксиса для asm нет: TSClang компилирует в C, поэтому asm всё равно проходит через GCC/clang inline asm. `native` покрывает этот кейс полностью.

**Это escape hatch, не стандартный инструмент.** Для всего что можно выразить через `declare function` — используй `.d.tsc`.

## `unsafe {}` — отключение проверок TSClang

Отключает borrow checker и ownership checks для блока TSClang-кода. Используется когда система типов мешает, но inline C не нужен.

```typescript
unsafe {
    const x = doRiskyThing()       // borrow checker выключен
    const y = value as Ref<u8[]>   // опасный каст — разрешён внутри unsafe
    const z = ptr                  // move после использования — без ошибки
}
```

Компилятор и линтер предупреждают:
```
warning: unsafe block — ownership and type checks disabled
```

Подавление:
```typescript
// tsc.package.json — глобально
{ "allowUnsafe": true }
```

**Различие между `native` и `unsafe {}`:**

| | `native` | `unsafe {}` |
|---|---|---|
| Код внутри | C (verbatim) | TSClang |
| Назначение | вызов C кода, макросы, asm | обход borrow checker |
| Borrow checker | отключён (C не знает о нём) | отключён явно |
| Type checker | отключён | отключён |
| Предупреждение | ✅ | ✅ |
| Подавить | `allowNative` | `allowUnsafe` |

## Синтаксис `.d.tsc` файлов — C interop

Аналог `.d.ts` в TypeScript. Содержит только объявления без тел — компилятор использует их для type checking и кодогенерации.

**Четыре вида деклараций:**

**1. C struct с известным layout** — обычный `type`, без изменений:
```typescript
// time.d.tsc
declare type Timespec = { tv_sec: i64; tv_nsec: i64 }
declare function clock_gettime(clockid: i32, ts: Mut<Timespec>): i32
```

**2. Opaque C handle** — структура неизвестна, только указатель:
```typescript
// sqlite3.d.tsc
declare opaque type SqliteDb {
    destructor: sqlite3_close    // функция вызываемая при drop (owned)
}
declare opaque type SqliteStmt {
    destructor: sqlite3_finalize
}
```

`destructor` — C-функция которую компилятор вставляет в `goto cleanup` при выходе из scope.

**3. C функции** — ownership через существующую систему типов:
```typescript
// bare T = owned (деструктор вызовется при drop)
// Ref<T>  = borrowed (деструктор не вызывается)

declare function sqlite3_open(path: string): SqliteDb          // owned — ты отвечаешь
declare function sqlite3_exec(db: Ref<SqliteDb>, sql: string): i32  // db borrowed
declare function sqlite3_prepare(db: Ref<SqliteDb>, sql: string): SqliteStmt  // owned
declare function sqlite3_step(stmt: Ref<SqliteStmt>): i32
declare function sqlite3_errmsg(db: Ref<SqliteDb>): Ref<string> // borrowed — не освобождать
```

**4. C константы:**
```typescript
declare const SQLITE_OK: i32 = 0
declare const SQLITE_ROW: i32 = 100
declare const SQLITE_DONE: i32 = 101
```

**5. MMIO-регистры (embedded)** — для аппаратных регистров микроконтроллеров. Тип определяет права доступа:

| Тип | Права | Пример |
|-----|-------|--------|
| `Mut<u8>` | Read/Write | `PORTB` — порт вывода |
| `Ref<u8>` | Read-only | `PINB` — порт ввода |

Прямой доступ к memory-mapped регистрам через типобезопасные декларации.

```typescript
// avr/io.d.tsc
declare const PORTB: Mut<u8>   // read/write register — 0x25
declare const DDRB:  Mut<u8>   // direction register  — 0x24
declare const PINB:  Ref<u8>   // read-only input pin — 0x23
```

Компилятор генерирует volatile C макрос:
```c
#define PORTB (*(volatile uint8_t*)0x25)
#define DDRB  (*(volatile uint8_t*)0x24)
#define PINB  (*(const volatile uint8_t*)0x23)
```

Адрес регистра берётся из поля `address` в `link.platforms` конфигурации пакета платформы. TSC-код работает с регистрами через типобезопасный API — компилятор гарантирует, что `Ref<u8>` нельзя записать.

**Сравнение с `native`:**

| Подход | Плюсы | Минусы |
|--------|-------|--------|
| `declare const PORTB` | Типобезопасность, autocomplete | Только простые регистры |
| `native "PORTB |= ..."` | Произвольный C, макросы | Нет проверки типов |

```typescript
// ✅ Типобезопасно
declare const PORTB: Mut<u8>
PORTB |= (1 << 5)  // Компилятор проверит типы

// ✅ Гибко (для сложных случаев)
native `PORTB |= (1 << PB5) | (1 << PB4)`
native `ATOMIC_BLOCK(ATOMIC_RESTORESTATE) { counter++ }`
```

**Разделение `.d.tsc` на несколько файлов** — через side-effect imports:
```typescript
// index.d.tsc
import "./types.d.tsc";     // side-effect: загружает декларации в контекст
import "./functions.d.tsc";
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

Side-effect import (`import "./file"`) загружает декларации в контекст компиляции без экспорта значений.

**Полный пример — sqlite3.d.tsc:**
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

**Использование:**
```typescript
import { SqliteDb, sqlite3_open, sqlite3_exec, sqlite3_prepare } from "./sqlite3.d"

function saveUser(name: string): void {
    let db = sqlite3_open("app.db")        // SqliteDb — owned
    sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS users (name TEXT)")
    let stmt = sqlite3_prepare(db, `INSERT INTO users VALUES ('${name}')`)
    sqlite3_step(stmt)
    // stmt → sqlite3_finalize(stmt) автоматически
    // db   → sqlite3_close(db) автоматически
}
```

**C-output** — компилятор генерирует `goto cleanup` с деструкторами:
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

**Ограничение:** C API с непоследовательным ownership (функция иногда возвращает owned, иногда borrowed в зависимости от аргументов) не может быть выражен точно — используй `any` и управляй вручную.
