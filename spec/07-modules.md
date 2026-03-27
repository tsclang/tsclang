# TSClang — Модульная система

- Синтаксис как в TypeScript: именованные `export` / `import { } from ""`
- Один файл = один модуль
- **Циклические импорты разрешены** — компилятор автоматически генерирует forward declarations в C

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

## Точка входа

### Определение entry point

Компилятор ищет entry point по полю `"main"` в `tsc.packages.json`:

```json
{
  "name": "mylib",
  "main": "src/main.tsc"
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

Нужно явно зафиксировать намерение — указать в `tsc.packages.json`:

```json
{
  "name": "mylib",
  "type": "library"
}
```

Обычно в библиотеке все файлы содержат только `export` — ни один не подходит как entry point. Компилятор собирает библиотеку: генерирует `.h`-файлы и `.a`/`.so`, без `main()`.

Поле `"type": "library"` гарантирует, что компилятор не будет искать entry point, ошибки не будет, библиотека останется библиотекой.

Для библиотек рекомендуется размещать файл декларации в корне проекта `index.d.tsc`.

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
  hint: add "main" field to tsc.packages.json:
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

## Источники `.d.tsc` файлов

**1. Пользователь создаёт сам** — для C-библиотек которые использует в проекте. Рекомендуемое расположение — папка `types/` в корне проекта:

```
myproject/
  src/
    main.tsc
  types/               ← рекомендуется
    sqlite3.d.tsc
    openssl.d.tsc
  tsc.packages.json
```

Путь к папке деклараций указывается в `tsc.packages.json`:

```json
{
  "declarations": ["types/"]
}
```

**2. Встроены в компилятор** — для стандартных C-библиотек. Компилятор автоматически добавляет нужный `#include` в C-output:

```typescript
import { printf, fprintf } from "std/libc"   // → #include <stdio.h>
import { sin, cos, sqrt }  from "std/math"   // → #include <math.h>
import { malloc, free }    from "std/libc"
```

### Variadic C функции — тип Scalar

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

**3. Пакеты из реестра** — аналог `@types` в TypeScript. Декларации без C-кода, scope `@types` зарезервирован для declaration-only пакетов:

```bash
tsclang install @types/sqlite3   # только .d.tsc, без C-кода
tsclang install @types/openssl
```

После установки импорт по имени библиотеки — компилятор находит `@types/sqlite3` автоматически:

```typescript
import { sqlite3_open } from "sqlite3"  // резолвится через @types/sqlite3
```

## Импорт C-библиотек — два сценария

C-библиотека и её TSClang-декларации — это два разных аспекта. В отличие от JS/TS, C-код не поставляется вместе с типами автоматически.

**Сценарий А: декларация библиотеки**

Предполагается, что библиотека установлена на системе (`apt install libsqlite3-dev`, `brew install sqlite3`). TSClang только добавляет декларации и информацию о линковке:

```bash
tsclang install @types/sqlite3   # только .d.tsc + declare link
```

```typescript
import { sqlite3_open } from "sqlite3"   // резолвится через @types/sqlite3
```

`@types/sqlite3` содержит `declare link` — компилятор добавляет `-lsqlite3` в CMakeLists.txt:

```typescript
// @types/sqlite3/index.d.tsc
declare link {
    libs: ["sqlite3"]            // → target_link_libraries(myapp sqlite3)
    pkg_config: "sqlite3"        // использует pkg-config если доступен
}

declare opaque type SqliteDb { destructor: sqlite3_close }
declare function sqlite3_open(path: string): SqliteDb
// ...
```

**Сценарий Б: бандлированная библиотека**

Пакет содержит и `.d.tsc` и сам C-код (`sqlite3.c`). Никакой системной зависимости — компилируется как часть проекта:

```bash
tsclang install @sqlite/sqlite3  # содержит sqlite3.c + index.d.tsc
```

```typescript
import { sqlite3_open } from "@sqlite/sqlite3"
```

Пакет содержит `sqlite3.c`, `sqlite3.h` и `index.d.tsc`. Вся информация о компиляции — в `declare link` внутри `.d.tsc`:

```typescript
// @sqlite/sqlite3/index.d.tsc
declare link {
    c_sources: ["sqlite3.c"]     // C-файлы компилируются как часть проекта
    c_includes: ["."]            // include директории
}

declare opaque type SqliteDb { destructor: sqlite3_close }
declare function sqlite3_open(path: string): SqliteDb
// ...
```

TSClang добавляет `sqlite3.c` в `CMakeLists.txt` как обычный source file. Для embedded — единственный практичный вариант (нет системного менеджера пакетов).

**Сравнение сценариев:**

| | Сценарий А (системная) | Сценарий Б (бандл) |
|---|---|---|
| Импорт | `from "sqlite3"` | `from "@sqlite/sqlite3"` |
| Установка | `tsclang install @types/sqlite3` + системный пакет | `tsclang install @sqlite/sqlite3` |
| Портабельность | зависит от системы | ✅ самодостаточен |
| Embedded | ❌ нет системного пакетного менеджера | ✅ |
| Большие библиотеки (OpenSSL) | ✅ не нужно vendorить | тяжело |

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

В `tsc.packages.json`, поле `paths`:

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
// apps/web/tsc.packages.json
{
  "paths": {
    "#core/*": ["../../packages/core/*"],
    "#ui/*": ["../../packages/ui/*"]
  }
}
```

## Резолюция импортов

| Синтаксис импорта | Резолюция (по порядку) |
|-------------------|------------------------|
| `"./foo"` | `foo.tsc` → `foo.d.tsc` |
| `"./foo.d"` | только `foo.d.tsc` |
| `"#/..."` / `"~/..."` | path alias из `paths` в `tsc.packages.json` → ошибка если не найден |
| `"std/foo"` | встроенная stdlib/C bindings |
| `"foo"` (без `./`, `@`, `#`, `~`) | `paths` alias → `std/foo` (stdlib) → `@types/foo` (если установлен) → ошибка |
| `"@scope/name"` | `tsc_packages/@scope/name/` — только точное совпадение |

`#` и `~` aliases **никогда** не ищутся в реестре — компилятор сразу выдаёт ошибку если alias не объявлен в `paths`.

## Авто-обнаружение деклараций

| Источник | Авто-обнаружение | Конфиг нужен? |
|----------|-----------------|---------------|
| `tsc_packages/@types/*` | ✅ всегда | нет |
| Встроенные (`libc`, `math`) | ✅ всегда | нет |
| Нестандартное расположение | ❌ | `"declarations": ["types/"]` в `tsc.packages.json` |

## Приоритет деклараций и переопределение

Приоритет при разрешении `import { x } from "sqlite3"` (высший → низший):

```
1. ./sqlite3.d.tsc          — рядом с импортирующим файлом
2. types/sqlite3.d.tsc      — папки, указанные в "declarations", например types/ в корне проекта
3. @types/sqlite3           — установленный пакет
4. встроенные               — libc, math и др.
```

Чтобы заменить `@types/sqlite3` своей версией — достаточно положить файл в `types/`:

```
types/
  sqlite3.d.tsc   ← перекрывает @types/sqlite3 целиком
```

## Настройки бандлированных библиотек

В декларации также может быть указано, откуда библиотеки нужно скачать, например из гит репозитория, из архива с последующей распаковкой и т.д.

Библиотека может содержать несколько файлов, а может разные файлы для разных платформ.

Для разных платформ могут быть свои параметры. *этот момент нужно обговорить отдельно. Брать параметры от сборки - может получиться не тот результат, например, библиотека не знает такой платформы. С другой стороны, мы можем сделать свою декларацию, отнаследованную от базовой.

Если в папке импорта лежит файл package.tsc.json, это означает, что библиотеку надо скомпилировать под проект. После компиляции, будет доступна декларация. Параметры компиляции ищутся в файле пакета.

Там могут быть флаги, путь в папке, куда библиотека будет скомпилирована и т.д.

Библиотеки устанавливаются во время установки проекта, tsclang install. Установщик смотрит на зависимости, устанавливает зависимости и устанавливает библиотеки под каждую зависимость и декларацию внутри них. Потом установщик смотрит в папки, которые прописаны в конфиге как папки зависимостей. Если там есть декларации, то он устанавливает библиотеки под каждую декларацию.

Например:

@sqlite/sqlite3
```
git = "github.com/sqlite/sqlite3@3.44.0";
```

@someuser/libfoo
```
git = "github.com/someuser/libfoo@1.0.0";
build = "make PREFIX={install_dir}";
headers = "include/";
lib = "libfoo.a";
```

@somevendor/libbaz
```
url = "https://some.site.com/download/lib_1.0.0.zip";
version = "1.0.0";
build = "make PREFIX={install_dir}";
headers = "include/";
lib = "libbaz.a";
```

- **URL** — версия задаётся обязательным полем `version:` (используется для кэша и lock-файла)

## URL-зависимости (zip-архив)

- Поле `url:` — прямая ссылка на `.zip` архив
- Поле `version:` — **обязательно**, используется для именования кэша и lock-файла
- Поддерживаемые форматы архивов: `.zip`, `.tar.gz`, `.tar.bz2`, `.tar.xz`
- Flow:

  ```bash
  # 1. Скачивает архив
  curl -L https://some.site.com/download/lib_1.0.0.zip \
       -o ~/.tsc/cache/libbaz@1.0.0.zip

  # 2. Распаковывает
  unzip ~/.tsc/cache/libbaz@1.0.0.zip -d ~/.tsc/cache/libbaz@1.0.0/
  ```

- Дальше — тот же порядок инструкций что и для git:
  1. **CMake** — есть `CMakeLists.txt` → auto-flow
  2. **`tsc.build.json`** — есть в архиве → используем
  3. **inline в `tsc.packages.json`** — описываем сами
  4. Ничего → ошибка компилятора
- В lock-файле фиксируется URL + `sha256` архива для воспроизводимости

## Git-зависимости

- Версия по тегу (`@2.28.0`), ветке (`@main`) или коммиту (`@a1b2c3d4`)
- Сборка скачанной либы — приоритет поиска инструкций:
  1. **CMake** — есть `CMakeLists.txt` в репо → поддерживается автоматически
  2. **`tsc.build.json`** — есть в репо библиотеки → используем его
  3. **inline в `tsc.packages.json`** — описываем сборку прямо в своём проекте
  4. Ничего из вышеперечисленного → ошибка компилятора
- `tsc.build.json` в корне репо библиотеки (удобство для авторов либ, чтобы пользователи не описывали сборку вручную):
  ```json
  {
    "build": "make PREFIX={install_dir}",
    "headers": "include/",
    "lib": "libfoo.a"
  }
  ```

### CMake auto-flow

Когда в репо есть `CMakeLists.txt`, компилятор запускает стандартный cmake pipeline:

```bash
# 1. Клонирует репо в кэш
git clone github.com/someuser/libfoo@1.0.0 ~/.tsc/cache/libfoo@1.0.0

# 2. Конфигурирует — cmake_options из tsc.packages.json пробрасываются как -D флаги
cmake -S ~/.tsc/cache/libfoo@1.0.0 \
      -B ~/.tsc/cache/libfoo@1.0.0/_build \
      -DCMAKE_INSTALL_PREFIX=~/.tsc/cache/libfoo@1.0.0/_install \
      -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_BUILD_TYPE=Release \
      -DFOO_BUILD_TESTS=OFF \      # ← из cmake_options
      -DFOO_USE_SSL=ON             # ← из cmake_options

# 3. Собирает
cmake --build ~/.tsc/cache/libfoo@1.0.0/_build --parallel

# 4. Устанавливает в _install/
cmake --install ~/.tsc/cache/libfoo@1.0.0/_build
```

После install — стандартная структура:

```
_install/
  include/        ← headers
  lib/            ← libfoo.a
  lib/cmake/      ← FooConfig.cmake (если есть)
```

Линковка в генерируемый `CMakeLists.txt` проекта — два варианта:

```cmake
# Вариант A: есть FooConfig.cmake / foo-config.cmake → используем find_package
find_package(Foo REQUIRED
    PATHS ~/.tsc/cache/libfoo@1.0.0/_install
    NO_DEFAULT_PATH)
target_link_libraries(myapp PRIVATE Foo::Foo)

# Вариант B: config-файла нет → прописываем пути напрямую
target_include_directories(myapp PRIVATE ~/.tsc/cache/libfoo@1.0.0/_install/include)
target_link_libraries(myapp PRIVATE ~/.tsc/cache/libfoo@1.0.0/_install/lib/libfoo.a)
```

### cmake_options

Опциональное поле для передачи `-D` флагов при конфигурации:

"@someuser/libfoo"
```
FOO_BUILD_TESTS = false;
FOO_USE_SSL = true;
FOO_MAX_CONNECTIONS = 128;
```

- `boolean` → `ON` / `OFF`
- `number` / `string` → передаётся как есть
- Компилятор всегда добавляет `BUILD_SHARED_LIBS=OFF`, `CMAKE_BUILD_TYPE=Release`, `CMAKE_INSTALL_PREFIX` — пользователь не переопределяет эти три

### Flow сборки для tsc.build.json / inline

```bash
# Запускает сборку, подставляет {install_dir}
make PREFIX=~/.tsc/cache/libfoo@1.0.0/out
# Забирает результат по путям из инструкций
#    headers: include/  →  ~/.tsc/cache/libfoo@1.0.0/include/
#    lib:     libfoo.a  →  ~/.tsc/cache/libfoo@1.0.0/libfoo.a
# Прописывает пути в генерируемый CMakeLists.txt проекта
target_include_directories(myapp PRIVATE ~/.tsc/cache/libfoo@1.0.0/include)
target_link_libraries(myapp ~/.tsc/cache/libfoo@1.0.0/libfoo.a)
```

## Настройки кастомных деклараций в проекте

Если у вас декларация в проекте, то мы предполагаем, что это переназначение декларации или библиотеки. Вам надо эту библиотеку прописать явно, см выше.

## Зависимость библиотек от платформ

Платформы — открытый вопрос. Предварительно: либо платформо-специфичные секции внутри declare library, либо наследование деклараций. Обсудим отдельно.

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

## Синтаксис `.d.tsc` файлов — C interop

Аналог `.d.ts` в TypeScript. Содержит только объявления без тел — компилятор использует их для type checking и кодогенерации.

**Три вида деклараций:**

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
// tsc.packages.json — глобально для проекта
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
// tsc.packages.json — глобально
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
