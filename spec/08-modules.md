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

## Module-level переменные

Переменные объявленные вне функций и классов — module-level. Компилируются в статическую память C.

```typescript
const MAX_CONNECTIONS: i32 = 100      // compile-time constant
let requestCount: i32 = 0             // mutable global
const defaultUser = new User("guest") // owned, инициализация при старте
```

**C-представление:**

| TSClang | C | Инициализация |
|---------|---|---------------|
| `const x: i32 = 5` | `static const int32_t x = 5` | compile-time |
| `let x: i32 = 0` | `static int32_t x = 0` | compile-time |
| `const arr: i32[4] = [...]` | `static int32_t arr[4] = {...}` | compile-time |
| `const x = new Foo()` | `static Foo* x = NULL` | в `_init()` при старте |

**Thread safety:** мутабельный `let` на уровне модуля небезопасен для многопоточного доступа — ошибка компилятора если `Thread.spawn` захватывает такую переменную. Используй `Atomic<T>`:
```typescript
let counter = 0                     // ⚠️ ошибка если Thread.spawn захватывает
const counter = new Atomic<i32>(0)  // ✅ thread-safe
```

**`heap: false` платформы:** module-level owned объекты (`new`, `Shared<T>`) запрещены — нет heap. Используй value types или фиксированные массивы:
```typescript
// AVR (heap: false)
const config = new Config()         // ❌ heap allocation запрещён
const config: Config = { ... }      // ✅ value type — статическая память
const buf: u8[256] = [0, ...]       // ✅ фиксированный массив — статическая память
```

**Паттерны по сценарию:**

| Сценарий | Решение |
|----------|---------|
| Конфигурация | `const CONFIG = { ... }` (value type) |
| Счётчик/флаг (многопоток) | `const n = new Atomic<T>(0)` |
| Singleton (desktop) | `const instance = new Foo()` |
| Singleton (embedded) | функция-геттер + статический буфер |
| Буфер (embedded) | `const buf: u8[N] = [...]` |

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

### Callbacks и closures в `native {}`

C-библиотеки ожидают функцию-указатель. TSClang closure — это struct с captures + function pointer. Их нельзя совместить напрямую.

**В `.d.tsc` для C callback используется `FnPtr<T>`** — чистый C function pointer без captures:

```typescript
// .d.tsc
declare type uv_timer_cb = FnPtr<(handle: Ref<uv_timer_t>) => void>

declare function uv_timer_start(
    timer: Ref<uv_timer_t>,
    cb:    uv_timer_cb,
    timeout: u64,
    repeat:  u64
): i32
```

`FnPtr<T>` принимает только функцию без captures — ошибка компилятора если передать capturing closure:

```typescript
uv_timer_start(timer, (h) => tick(), 1000, 0)         // ✅ нет captures
uv_timer_start(timer, [ctx](h) => process(ctx), ...)  // ❌ ошибка: FnPtr не поддерживает captures
                                                        //    hint: используй native {} для closure bridging
```

**Для capturing closures — `native {}`** с хелперами компилятора:

Компилятор предоставляет набор C-макросов для boxing/unboxing closures внутри `native {}` блоков. Эти макросы доступны автоматически — без `#include`.

| Макрос | Описание |
|--------|----------|
| `TSC_CLOSURE_BOX(closure_var)` | Аллоцировать captures на heap, вернуть `void*` |
| `TSC_CLOSURE_CALL(ptr)` | Вызвать boxed closure по `void*` |
| `TSC_CLOSURE_FREE(ptr)` | Освободить boxed closure |
| `TSC_CLOSURE_FN(ptr)` | Получить function pointer из boxed closure (thunk) |

Пример — `(cb, userdata)` паттерн:

```typescript
// .d.tsc — объявляем честно как (cb, void*)
declare function lib_on_event(
    cb:   FnPtr<(result: i32, ctx: void*) => void>,
    data: void*
): void

// usage в wrapper-пакете:
function onEvent(handler: (result: i32) => void): void {
    native `
        void* _boxed = TSC_CLOSURE_BOX(${handler});
        lib_on_event(TSC_CLOSURE_FN(_boxed), _boxed);
        // lib сам вызовет TSC_CLOSURE_CALL(_boxed) / TSC_CLOSURE_FREE(_boxed)
    `
}
```

Пример — libuv `handle->data` паттерн:

```typescript
// std/timer.tsc (внутри stdlib)
function _startTimer(cb: () => void, ms: u64): void {
    native `
        uv_timer_t* _t = (uv_timer_t*)malloc(sizeof(uv_timer_t));
        uv_timer_init(tsc_uv_loop(), _t);
        _t->data = TSC_CLOSURE_BOX(${cb});
        uv_timer_start(_t, _tsc_timer_thunk, ${ms}, 0);
    `
}

// thunk объявлен в рантайм-хедере:
// static void _tsc_timer_thunk(uv_timer_t* h) {
//     TSC_CLOSURE_CALL(h->data);
//     TSC_CLOSURE_FREE(h->data);
//     uv_close((uv_handle_t*)h, free);
// }
```

**Правила lifetime для boxed closures:**

- `TSC_CLOSURE_BOX` аллоцирует на heap и перемещает captures — исходная переменная closure после этого invalid
- `TSC_CLOSURE_FREE` должен быть вызван ровно один раз — двойной вызов UB
- Borrow checker не отслеживает boxed closure — ответственность на авторе `native {}` блока
- На платформах с `heap: false` — `TSC_CLOSURE_BOX` вызывает compile error

**Embedded:** на `heap: false` платформах `FnPtr<T>` без captures — единственный способ передать callback в C. Для ISR используется `@embedded.isr`, не `FnPtr<T>`.

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

## @platform — условная компиляция

Декоратор для платформозависимых реализаций одной функции/класса.

```typescript
@platform("avr")
@platform("avr", "arm")   // несколько платформ
@platform("desktop")
```

### Правила

| Ситуация | Результат |
|----------|-----------|
| Функция без `@platform` | Доступна везде |
| Функция с `@platform` | Только на указанных платформах |
| Вызов на неподдерживаемой платформе | Ошибка компиляции |

### Пример: разные реализации

```typescript
@platform("avr")
function delay(ms: u16): void {
    for (let i = 0; i < ms; i++) {
        _delay_ms(1)
    }
}

@platform("arm")
function delay(ms: u32): void {
    HAL_Delay(ms)
}

@platform("desktop")
async function delay(ms: u32): Promise<void> {
    await sleep(ms)
}
```

Компилятор включает в сборку только реализацию, соответствующую активной платформе. Вызов `delay()` на платформе без соответствующей `@platform`-реализации → ошибка компиляции.

### Структура пакета с несколькими платформами

Разные реализации в разных файлах:

```
@mylib/gpio/
  index.tsc       # export { pinMode } from "./platform"
  avr.tsc         # @platform("avr") implementation
  arm.tsc         # @platform("arm") implementation
  desktop.tsc     # @platform("desktop") mock for tests
```

```typescript
// index.tsc
export { pinMode, digitalWrite } from "./platform";
```

```typescript
// avr.tsc
@platform("avr")
export function pinMode(pin: u8, mode: PinMode): void {
    native `DDR${pin} |= (1 << ${pin});`
}
```

---
