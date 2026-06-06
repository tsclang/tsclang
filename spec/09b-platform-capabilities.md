# TSClang — Platform Capabilities Design

> Дата: 2026-06-05 (создание), 2026-06-06 (обновление v3)
> Статус: APPROVED (все открытые вопросы закрыты)

## Приоритет

Этот документ имеет **приоритет** над всеми остальными файлами спецификации (`spec/*.md`) в вопросах platform capabilities: поля `declare platform`, значения `allocator`, `async` (ранее `scheduler`), `usize` (ранее `address_bits`), поведение `Shared<T>`/`Weak<T>`, runtime level, обязательные поля. При расхождении — считать верным этот документ.

## Принцип

Компилятор **не хардкодит** свойства таргетов. Все решения принимаются на основе **capabilities**, которые читаются из `declare platform` в profile-пакете.

## Модель capabilities — финал v3

```
declare platform {
    // Обязательные (с профилем)
    allocator: "heap" | "static"
    async: "libuv" | "state_machine" | "none"

    // Build
    toolchain: "avr-gcc"          // capability профиля, НЕ переопределяется в builds.*
    toolchainFile: "toolchain.cmake"
    include: "include"

    // Hardware
    fpu: false                    // false → f32/f64 запрещены, number требует integer defaultNumber
    bits: 8                       // разрядность CPU
    unaligned_access: false

    // Types
    usize: "u16"                  // явное поле, НЕ выводится из bits

    // Memory
    heap_size: 4096               // опционально: при allocator: "heap"
    stack_size: 256               // компилятор проверяет call graph + stack usage
    ram_size: 2048
    flash_size: 32768

    // Runtime
    os: false                     // false → std/fs, std/net, std/ws запрещены
}
```

### Desktop default (без профиля)

```
allocator: "heap", async: "libuv", fpu: true, bits: 64,
usize: "u64", unaligned_access: true, os: true
```

### Профиль-пакет — self-contained

Один `import "@tsclang/avr-platform"` даёт всё: capabilities + build config + C-runtime + TSC-обёртки.

```
@tsclang/avr-platform/
  index.d.tsc          — declare platform { ... }
  include/             — C-заголовки (runtime, HAL)
  src/                 — опционально: TSC-обёртки (import { pinMode } from "avr/gpio")
```

`declare platform` — единый блок: capabilities + build config вместе. Не разделяем.

## Референс полей `declare platform`

### Обязательные поля (с профилем)

| Поле | Тип | Допустимые значения | Описание |
|------|-----|--------------------|----------|
| `allocator` | `string` | `"heap"`, `"static"` | Стратегия аллокации памяти. `"heap"` — стандартный `malloc`/`free`. `"static"` — все объекты в BSS, размеры должны быть compile-time. При `"static"`: `Shared<T>`, `Weak<T>` → compile error; `new X()` без capacity → compile error; `new X(N)` с compile-time N → BSS |
| `async` | `string` | `"libuv"`, `"state_machine"`, `"none"` | Модель async-выполнения. `"libuv"` — event loop через libuv (desktop). `"state_machine"` — C switch-based state machine (embedded). `"none"` — `async function` запрещена |

### Build

| Поле | Тип | Дефолт | Описание |
|------|-----|--------|----------|
| `toolchain` | `string` | — | Имя компилятора (`"avr-gcc"`, `"cc65"`, `"arm-none-eabi-gcc"`). Capability профиля, не переопределяется в `builds.*`. |
| `toolchainFile` | `string` | — | Путь к CMake toolchain file внутри пакета (без `./`). |
| `include` | `string` | `"include"` если директория существует | Путь к директории с C-заголовками внутри пакета. TSClang добавляет `include_directories(BEFORE ...)` в CMakeLists.txt. |

### Hardware

| Поле | Тип | Desktop default | Допустимые значения | Описание |
|------|-----|----------------|--------------------|----------|
| `fpu` | `boolean` | `true` | `true`, `false` | Есть ли FPU. `false` → `f32`/`f64` запрещены; `number` без integer `defaultNumber` → compile error с подсказкой. Warning "slow software float" при `fpu: true` + `bits <= 8`. |
| `bits` | `u8` | `64` | `8`, `16`, `32`, `64` | Разрядность CPU. Влияет на defaultNumber auto-detect, warning про медленный float. |
| `unaligned_access` | `boolean` | `true` | `true`, `false` | Поддерживает ли CPU невыровненный доступ к памяти. `false` → компилятор генерирует побайтовые helper'ы для `@packed`-структур вместо прямого cast. x86-64: `true`; ARM Cortex-M0, AVR, 6502: `false`. **[NOT YET IMPLEMENTED]** |

### Types

| Поле | Тип | Desktop default | Допустимые значения | Описание |
|------|-----|----------------|--------------------|----------|
| `usize` | `string` | `"u64"` | `"u8"`, `"u16"`, `"u32"`, `"u64"` | Тип для `usize`. Явное поле, не выводится из `bits`. Покрывает краевые случаи (8086: 16-бит CPU с 20-битной адресацией). |

### Memory

| Поле | Тип | Обязательное | Описание |
|------|-----|-------------|----------|
| `heap_size` | `u32` | нет (только при `allocator: "heap"`) | Лимит heap в байтах для compile-time проверки: BSS + heap_size + stack ≤ ram_size. |
| `stack_size` | `u32` | нет | Размер стека в байтах. Если задан — компилятор проверяет call graph, рекурсия → error с подсказкой про `@stack`. Если не задан — рекурсия разрешена. |
| `ram_size` | `u32` | нет | Общий размер RAM в байтах. Компилятор проверяет суммарный BSS + stack ≤ ram_size. |
| `flash_size` | `u32` | нет | Размер Flash/ROM в байтах. Компилятор проверяет размер сгенерированного кода. |

### Runtime

| Поле | Тип | Desktop default | Описание |
|------|-----|----------------|----------|
| `os` | `boolean` | `true` | Доступна ли ОС. `false` → `import "std/fs"`, `"std/net"`, `"std/ws"` → compile error. |

### Runtime level (выводится из `async`, не отдельное поле)

| `async` | Runtime level | Доступно |
|---------|--------------|----------|
| `"libuv"` | Full | `Error.stack`, `console.trace`, `performance.now()`, full console formatting, libuv event loop |
| `"state_machine"` | Minimal | `console.log` без форматирования, `Error.message` без стека, C switch-based state machine |
| `"none"` | Bare | Только что компилятор сам генерирует. `async function` запрещена. |

## Что удалено / переименовано

| Было | Стало | Почему |
|------|-------|--------|
| `scheduler` | `async` | Точнее отражает суть: модель async-выполнения, не планировщик |
| `"cooperative"` | `"state_machine"` | Точнее: C switch-based state machine |
| `"pool"` allocator | удалён | Pool — реализация heap, не отдельный режим |
| `"none"` allocator | удалён (слит с `"static"`) | Разницы нет: value types не требуют malloc |
| `address_bits` | `usize` (явное поле) | `address_bits` использовался только для usize |
| `no_recursion: true` | удалён | Автоматическая проверка `stack_size` |
| `heap: boolean` | удалён | Дублировал `allocator` |
| `_noFloatTargets` хардкод | → `fpu: false` из профиля | |
| `_noHeapTargets` хардкод | → `allocator: "static"` из профиля | |
| `_retroTargets` хардкод | → комбинация `async`, `os`, `fpu` | |
| `EMBEDDED_TARGETS` хардкод | → capabilities из профиля | |

## Решения компилятора из capabilities

| Capability | Решение компилятора |
|-----------|-------------------|
| `fpu: false` | Запрещает `f32`/`f64` TypeRef. Если `defaultNumber` не integer → ошибка с точным указанием места и подсказкой |
| `allocator: "static"` | `new` только с compile-time capacity → BSS. `Shared<T>`, `Weak<T>` → compile error |
| `allocator: "heap"` | Все виды `new`, `Shared<T>`, `Weak<T>` разрешены |
| `allocator: "heap"` + `heap_size` | Как heap, но compile-time проверка BSS + heap_size + stack ≤ ram_size |
| `async: "none"` | Запрещает `async function` |
| `async: "state_machine"` | Async через C switch-based state machine |
| `async: "libuv"` | Async через libuv event loop |
| `os: false` | Запрещает `import "std/fs"`, `"std/net"`, `"std/ws"` |
| `usize: "u16"` | `usize` → `uint16_t` |
| `stack_size` задан | Проверяет call graph, рекурсия → ошибка с подсказкой про `@stack` |
| `stack_size` не задан | Рекурсия разрешена, warning для async (heap) |

### Runtime level — выводится из `async`

| `async` | Runtime level |
|---------|--------------|
| `"libuv"` | Full: `Error.stack`, `console.trace`, `performance.now()`, full console formatting |
| `"state_machine"` | Minimal: `console.log` без форматирования, `Error.message` без стека |
| `"none"` | Bare: только что компилятор сам генерирует |

Отдельное поле `runtime` не нужно.

### `toolchain` — capability профиля

`toolchain` и `toolchainFile` — часть профиля, не переопределяются в `builds.*` из `tsc.package.json`. Если нужен другой toolchain — форкаешь профиль.

### `builds.*` в `tsc.package.json` — проектные настройки

Поля типа `optimize`, `outDir`, `emit`, `defaultNumber`, `binaryMode`, `stringBufferSize` — это настройки проекта, не capabilities. Они живут в `builds.*` и **не могут** переопределять capabilities из профиля.

## Источники конфигурации и приоритет

### Четыре источника

1. **Desktop default** — встроенный дефолт компилятора (`allocator: "heap"`, `async: "libuv"`, `fpu: true`, `bits: 64`, `usize: "u64"`, `os: true`)
2. **Profile-пакет** — `declare platform` в `index.d.tsc` профиля
3. **`builds.*` в `tsc.package.json`** — проектные настройки
4. **CLI флаги** — `--platform`, `--build`, `--optimize`, и т.д.

### Два способа подключить профиль

```bash
# CLI — quick test
tsclang build main.tsc --platform @tsclang/avr-platform
```

```json
// tsc.package.json — проект
{
  "builds": {
    "avr": {
      "profile": "@tsclang/avr-platform",
      "optimize": "Os",
      "outDir": "build/avr"
    }
  }
}
```

```bash
# Выбор named build
tsclang build main.tsc --build avr
```

Оба способа эквивалентны. CLI удобен для quick tests, `builds.*.profile` — для проектов.

### Правило приоритета

```
CLI флаги  >  profile capabilities  >  builds.*  >  desktop default
```

**Capabilities — неизменны.** Если профиль задаёт `allocator: "static"`:
- CLI `--allocator heap` → **ошибка** (конфликт с профилем)
- `builds.avr.allocator: "heap"` → **ошибка** (конфликт с профилем)

CLI может задать только **проектные настройки** (не capabilities): `--optimize`, `--outDir`, `--emit`, `--default-number` (если не конфликтует с `fpu`).

### Таблица — что где можно задать

| Поле | Profile | `builds.*` | CLI | Переопределяемо? |
|------|---------|-----------|-----|-----------------|
| `allocator` | ✅ (обязательное) | ❌ | ❌ | Нет |
| `async` | ✅ (обязательное) | ❌ | ❌ | Нет |
| `fpu` | ✅ | ❌ | ❌ | Нет |
| `bits` | ✅ | ❌ | ❌ | Нет |
| `usize` | ✅ | ❌ | ❌ | Нет |
| `unaligned_access` | ✅ | ❌ | ❌ | Нет |
| `os` | ✅ | ❌ | ❌ | Нет |
| `heap_size` | ✅ | ❌ | ❌ | Нет |
| `stack_size` | ✅ | ❌ | ❌ | Нет |
| `ram_size` | ✅ | ❌ | ❌ | Нет |
| `flash_size` | ✅ | ❌ | ❌ | Нет |
| `toolchain` | ✅ | ❌ | ❌ | Нет |
| `toolchainFile` | ✅ | ❌ | ❌ | Нет |
| `include` | ✅ | ❌ | ❌ | Нет |
| `optimize` | ❌ | ✅ | ✅ | Да |
| `outDir` | ❌ | ✅ | ✅ | Да |
| `emit` | ❌ | ✅ | ✅ | Да |
| `defaultNumber` | ❌ | ✅ | ✅ | Да (если не конфликтует с `fpu`) |
| `binaryMode` | ❌ | ✅ | ✅ | Да |
| `stringBufferSize` | ❌ | ✅ | ✅ | Да |

## Build flow

### Путь пакетов

TSClang использует **flat `tsc_packages/`** (как Cargo/Go), не вложенные `node_modules/`:

```
myapp/
  tsc_packages/
    @tsclang/avr-platform/
      index.d.tsc           ← declare platform { ... }
      include/              ← C-заголовки
      src/                  ← TSC-обёртки (опционально)
      toolchain.cmake
  tsc.package.json
  src/
    main.tsc
```

### Профиль resolution

1. CLI: `--platform @tsclang/avr-platform` → ищет `tsc_packages/@tsclang/avr-platform/index.d.tsc`
2. `tsc.package.json`: `builds.avr.profile: "@tsclang/avr-platform"` → тот же путь
3. Локальный путь: `builds.avr.profile: "./profiles/my-platform.d.tsc"` → относительный путь от проекта

### TSC-обёртки из профиля

Компилируются вместе с основным кодом через обычный `import`:

```typescript
// main.tsc
import { pinMode, digitalWrite } from "@tsclang/avr-platform/hal"
```

Компилятор резолвит `tsc_packages/@tsclang/avr-platform/src/hal.tsc`, компилирует как библиотечный модуль, линкует с основным кодом.

### Pipeline

```
tsclang build main.tsc --platform @tsclang/avr-platform
     ↓
1. Найти профиль → tsc_packages/@tsclang/avr-platform/index.d.tsc
2. Парсить declare platform → { allocator: "static", async: "none", fpu: false, ... }
3. Проверить обязательные поля (allocator, async)
4. Парсить основной файл → AST
5. Codegen(ast, { capabilities }) → C-код
6. Записать .c файл в outDir
7. Если emit: "binary" / "hex":
   - Вызвать toolchain из профиля (avr-gcc)
   - Добавить -I из include
   - Скомпилировать и слинковать
```

### Выходные файлы

```
build/avr/
  main.c              — C-код (от компилятора)
  CMakeLists.txt      — с toolchain из профиля
  main.hex            — если emit: "hex" (после компиляции toolchain'ом)
```

`CMakeLists.txt` генерируется с учётом профиля:

```cmake
cmake_minimum_required(VERSION 3.16)
project(myapp C)
set(CMAKE_C_COMPILER avr-gcc)           # из профиля
add_compile_options(-mmcu=atmega328p)    # из builds.*.mcu
add_compile_options(-Os)                 # из builds.*.optimize
target_include_directories(myapp PRIVATE
  tsc_packages/@tsclang/avr-platform/include  # из профиля
)
```

## `@stack` декоратор + `stack.*` builtin

### Семантика

- `@stack(name, N)` — **built-in декоратор** (как `@static`, `@readonly`). Создаёт статический массив в BSS.
- `stack.push(name, value)` — **compile-time expression** (builtin, не функция). Push в стек.
- `stack.pop<T>(name)` — **compile-time expression**. Pop из стека, возвращает `T`.
- `stack.empty(name)` — **compile-time expression**. Проверка `top == 0`.

### Пример

```typescript
@stack("nodes", 64)
async function traverse(root: Node): Promise<void> {
    stack.push("nodes", root)
    while (!stack.empty("nodes")) {
        const n: Node = stack.pop<Node>("nodes")
        await process(n)
        if (n.left)  stack.push("nodes", n.left)
        if (n.right) stack.push("nodes", n.right)
    }
}
```

### C-вывод

```c
static Node nodes_stack[64];
static uint8_t nodes_stack_top = 0;

void traverse_poll(Traverse_SM* sm) {
    switch (sm->_state) {
        case 0:
            nodes_stack[nodes_stack_top++] = sm->root;
            sm->_state = 1; break;
        case 1:
            if (nodes_stack_top == 0) { sm->_done = true; return; }
            sm->n = nodes_stack[--nodes_stack_top];
            process_poll(&sm->n_state);
            sm->_state = 2; break;
    }
}
```

### Роль в рекурсии

`@stack` — это **исключение** из запрета рекурсии. Если функция annotated `@stack`, компилятор:
1. Превращает рекурсивный вызов в итеративный цикл с push/pop
2. Размер стека известен на compile-time: `N * sizeof(T)`
3. Проверяет что BSS-потребление не превышает `ram_size`

## defaultNumber auto-detect

| `fpu` | `bits` | `defaultNumber` задан? | Результат |
|-------|--------|----------------------|-----------|
| не задан (desktop) | любой | нет | `f64` |
| `true` | любой | нет | `f64` (если `bits <= 8` → warning: "f64 on 8-bit target is slow") |
| `true` | любой | `"f32"` | `f32` (если `bits <= 8` → warning) |
| `false` | любой | нет | **Ошибка**: "no-fpu target requires `defaultNumber` to be an integer type" |
| `false` | любой | `"i32"` / `"u32"` / др. integer | OK |
| `false` | любой | `"f32"` / `"f64"` | **Ошибка**: "fpu: false conflicts with float defaultNumber" |

Warning про медленный float выводится из комбинации `fpu: true` + `bits <= 8`, без отдельного поля.

## Ошибки компиляции — формат

Все ошибки должны **точно указывать место** и **подсказывать решение**:

```
input.tsc:5:14  TypeError: "number" resolves to "f64" but target has no FPU (fpu: false)
  → Set "defaultNumber" to an integer type (e.g. "i32") in declare platform or build config
  5 | let x: number = 42;
                ^^^^^^
```

```
input.tsc:1:20  TypeError: float type "f32" is not supported (fpu: false)
  1 | function brightness(r: f32, g: f32, b: f32): f32 {
                          ~~
```

```
input.tsc:3:5  TypeError: function `traverse()` is recursive and stack usage cannot be verified
  → Use @stack to convert to bounded iteration, or rewrite iteratively
  3 |     await traverse(left)
         ^^^^^^^^^^^^^^^^^^^^
```

## Закрытые вопросы

### 1. `allocator` — РЕШЕНО

Два режима: `"heap"` | `"static"`.

| `allocator` | `new X()` | `new X(N)` | `Shared<T>` / `Weak<T>` | Генерирует |
|-------------|-----------|------------|--------------------------|-----------|
| `"heap"` | malloc | malloc | malloc + ARC | `malloc`/`free` |
| `"heap"` + `heap_size` | malloc (лимит) | malloc (лимит) | malloc + ARC | `malloc`/`free` + compile-time check |
| `"static"` | ошибка | BSS | **ошибка** | static arrays |

`"pool"` удалён — pool это реализация heap, не режим.
`"none"` слит с `"static"` — разницы нет, value types не требуют malloc.
`Shared<T>` и `Weak<T>` при `allocator: "static"` → compile error. Нет heap → нет ARC → нет shared ownership. На embedded: `@static let` + `Ref<T>`/`Mut<T>`.

### 2. Migration path — РЕШЕНО

За один раз. Хардкод удаляется полностью, capabilities становятся единственным источником.

`meta.json` в тестах обновляется:

```json
{
  "target": "avr",
  "fpu": true,
  "bits": 8,
  "allocator": "heap",
  "async": "none",
  "os": false,
  "stack_size": 256,
  "usize": "u16"
}
```

Все ~90 существующих `meta.json` обновляются с явными capabilities.

### 3. `Shared<T>` / `Weak<T>` без heap — РЕШЕНО

**Compile error.** `Shared<T>` требует ARC (refcount + free). При `allocator: "static"` нет heap → нет `free()` → refcount бессмысленен. String работает без heap потому что immutable + ring buffer, но `Shared<T>` — mutable shared state, ring buffer не подходит.

### 4. Runtime level — РЕШЕНО

Выводится из `async`:
- `"libuv"` → full runtime
- `"state_machine"` → minimal
- `"none"` → bare

Отдельное поле не нужно.

### 5. `usize` — РЕШЕНО

Явное поле `usize: "u16"` в профиле. `address_bits` удалён — использовался только для usize. Явное поле покрывает краевые случаи (8086: 16-бит CPU с 20-битной адресацией).

### 6. `declare platform` — self-contained — РЕШЕНО

`declare platform` содержит и capabilities, и build config (`toolchain`, `toolchainFile`, `include`). Не разделяем. Профиль-пакет — одна сущность, один импорт.

### 7. `toolchain` — capability профиля — РЕШЕНО

`toolchain` не переопределяется в `builds.*`. Хочешь другой toolchain — форкаешь профиль.

### 8. Обязательные поля — РЕШЕНО

С профилем: `allocator` и `async` — **обязательны**. Никаких дефолтов, программист явно выбирает модель. Без профиля (desktop) — встроенный дефолт.

## Текущий хардкод (для замены)

```
codegen.js:9     EMBEDDED_TARGETS = {avr, arm, stm32}
codegen.js:10    ALL_EMBEDDED_TARGETS = {avr, arm, stm32, nes, genesis, ps1, spectrum}
program.js:106   _retroTargets = [nes, genesis, ps1, ps2, dos, spectrum]
program.js:112   _noFloatTargets = [nes, genesis, ps1, spectrum]
program.js:119   _noHeapTargets = [nes, genesis, ps1, spectrum]
program.js:99    _autoDefaultNumber = _isEmbedded() ? 'f32' : 'f64'
resolve.js:14    usize → uint16_t для nes/spectrum (хардкод)
```

## Этапы реализации

1. ~~Обновить `spec/09-build.md`~~ — DONE (устаревшие поля заменены, примеры обновлены)
2. ~~Обновить все ~90 `meta.json` тестов~~ — DONE (72 мигрировано на `profile`, 20 используют legacy)
3. ~~Обновить компилятор~~ — DONE (capabilities + fallback в codegen.js, program.js, resolve.js)
4. ~~Обновить CLI~~ — DONE (`--platform`, `--build`, `node_modules` → `tsc_packages`)
5. ~~Создать встроенные профили~~ — DONE (`src/profiles/` — 12 JSON-профилей)
6. Добавить тесты на новые ошибки (fpu:false + float, Shared+static, async:none + async function)
7. Удалить fallback-хардкод (когда capabilities передаются через `opts.capabilities` везде)
8. Превратить JSON-профили в полноценные profile-пакеты (`index.d.tsc` + `include/` + `toolchain.cmake`)
