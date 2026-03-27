# TSClang — Система сборки

## Формат имён пакетов

Четыре формата импорта:

| Формат | Что это | Пример |
|--------|---------|--------|
| `"./foo"` | локальный файл — **всегда требует `./`** | `"./utils"` |
| `"std/foo"` или `"foo"` | stdlib / встроенные — эквиваленты | `"std/threads"` = `"threads"` |
| `"@types/foo"` или `"foo"` | декларации библиотек, если нет встроенной библиотеки | `"@types/sqlite3"` = `"sqlite3"` |
| `"@scope/name"` | реестр — **`@` обязателен** | `"@myco/db"` |

**Визуальное правило: `@` = пришло из реестра, нет `@` = встроенное или `@types/`.**

```typescript
// stdlib — два эквивалентных способа:
import { Thread } from "std/threads"  // явная форма (рекомендуется для читаемости)
import { Thread } from "threads"      // краткая форма

import { printf } from "std/libc"     // C bindings — тот же зонтик std/
import { printf } from "libc"         // краткая форма

// @types:
import { sqlite3_open } from "@types/sqlite3"  // ✅ явное имя пакета
import { sqlite3_open } from "sqlite3"          // ✅ тоже работает — компилятор найдёт @types/sqlite3

// реестр — @ обязателен:
import { open }       from "@myco/db"
```

Реестр требует `@scope/name` — плоские имена без `@` зарезервированы для stdlib и `@types/`. Попытка `tsclang install sqlite3` → поиск в `@types/sqlite3`, если не найден — ошибка: *"registry packages not found in @types? may be require a scope: @scope/sqlite3"*.

**`@types` — зарезервированный scope** только для declaration-only пакетов (`.d.tsc` без `.tsc`-кода):

```bash
tsclang install @types/sqlite3    # ✅ только .d.tsc — ok
tsclang install sqlite3           # ✅ тоже работает — CLI найдёт @types/sqlite3 — ok
tsclang install @myco/mylib       # ✅ библиотека с .tsc кодом — ok
tsclang install @types/mylib      # ❌ ошибка при публикации: @types/ содержит .tsc код
```

Lock-файл `tsc.packages.lock` — фиксирует точные версии библиотек для воспроизводимости.

## Build Profiles

Именованные профили сборки в `tsc.packages.json`:

```json
{
  "builds": {
    "desktop": {},
    "avr": {
      "target": "avr",
      "mcu": "atmega328p",
      "defaultNumber": "f32"
    },
    "release": {
      "optimize": "O2"
    }
  }
}
```

## Поля верхнего уровня `tsc.packages.json`

| Поле | Описание | Дефолт |
|------|----------|--------|
| `"name"` | имя пакета (обязательное) | — |
| `"version"` | версия в формате semver (обязательное) | — |
| `"description"` | описание пакета | — |
| `"author"` | автор пакета | — |
| `"license"` | вид лицензии | — |
| `"type"` | `"executable"` или `"library"` — тип пакета | `"executable"` |
| `"main"` | явный entry point файл | — |
| `"builds"` | именованные профили сборки | — |
| `"dependencies"` | зависимости пакета | `{}` |
| `"declarations"` | дополнительные папки с `.d.tsc` файлами (нестандартные пути) | `[]` |

`"type"` управляет поведением автодетекта:

| Значение | Поведение |
|----------|-----------|
| не указан | то же, что `"executable"` |
| `"executable"` | компилятор ищет entry point, ошибка если не найден |
| `"library"` | entry point не ищется, генерируются только `.h` + `.a`/`.so` |

```json
// явная библиотека
{
  "name": "mylib",
  "version": "1.0.0",
  "type": "library"
}

// явный executable с entry point
{
  "name": "myapp",
  "version": "1.0.0",
  "type": "executable",
  "main": "src/main.tsc"
}

// нестандартное расположение деклараций
{
  "name": "myapp",
  "version": "1.0.0",
  "declarations": ["types/"]
}
```

## Поля build конфига

| Поле | Описание | Дефолт |
|------|----------|--------|
| `"main"` | entry point файл (override верхнего уровня) | наследует |
| `"emit"` | тип вывода: `"c"`, `"binary"`, `"hex"`, `"lib"` | `"binary"` для desktop, `"hex"` для embedded |
| `"outDir"` | директория вывода | `./build/<name>` |
| `"target"` | целевая платформа | текущая платформа |
| `"mcu"` | модель MCU (только для embedded) | — |
| `"optimize"` | уровень оптимизации (`O0`..`O3`, `Os`) | `O0` |
| `"defaultNumber"` | тип для `number` | `f64` |
| `"runtime"` | async runtime: `"libuv"`, `"io_uring"`, `"embedded"` | `"libuv"` для desktop, `"embedded"` для embedded |
| `"binaryMode"` | `"normal"` или `"small"` | `"normal"` |

**`"binaryMode": "small"`** — режим для сильно ограниченных embedded платформ (AVR Arduino: 32 КБ flash). Включает type erasure для generic pointer types:
- `Array<T>` где T — pointer/complex type → единая реализация через `void*` (одна копия кода для всех Array типов)
- Монорфизация только для примитивов (`Array<i32>`, `Array<u8>` — остаются отдельными)
- Enum string tables — не генерируются, `.toString()` возвращает номер
- Трейдофф: меньше кода → меньше flash; но нет type-safe runtime проверок для erased типов

## Platform Profile

Компилятор должен знать в compile-time: какие функции libc доступны, есть ли heap, сколько бит адрес — чтобы выдавать ошибки заранее, не на этапе линковки.

**Platform Profile** — это `.d.tsc` пакет, который декларирует возможности конкретной платформы. Три источника:

| Источник | Когда |
|----------|-------|
| Встроенный профиль | known targets: `x86-64`, `arm-cortex-m*`, `avr-atmega*`, `wasm32` |
| Community пакет | `@nes/platform`, `@spectrum/platform`, `@sega/platform` |
| Локальный `.d.tsc` | любая экзотика, собственные SoC |

**Поля конфигурации таргета:**

| Поле | Что это | Куда идёт |
|------|---------|-----------|
| `arch` | CPU-архитектура (`avr`, `arm`, `6502`, `x86-64`, `z80`, `m68k`) | флаги компилятора в CMakeLists.txt + ширина `usize` |
| `mcu` | конкретный чип (`atmega328p`, `stm32f4`) | флаг `-mmcu=atmega328p` в avr-gcc + выбор встроенного профиля |
| `toolchain` | какой C-компилятор использовать (`avr-gcc`, `cc65`, `arm-none-eabi-gcc`) | `CMAKE_C_COMPILER` в CMakeLists.txt |
| `profile` | платформенный профиль (если таргет не известен компилятору) | источник `declare platform {}` |

**TSClang не компилирует в машинный код.** Он генерирует C99 + `CMakeLists.txt`, а CMake + реальный C-компилятор делают остальное. Разделение ответственности:

```
TSClang:               семантика — heap? usize? stack limit? доступные libc функции?
                       → ошибки компилятора до сборки
                       → генерирует архитектурно-нейтральный C99 + CMakeLists.txt

CMake + toolchain:     реально компилируют под платформу
```

**Откуда TSClang знает что делать:**

Для `known targets` — у компилятора внутренняя таблица:

```
avr + atmega328p  → { usize: u16, stack: 2048, flash: 32768, heap: false, ... }
arm + cortex-m4   → { usize: u32, heap: optional, fpu: true, ... }
x86-64            → { usize: u64, heap: true, fpu: true, ... }
```

Для `unknown targets` эту таблицу заменяет `profile`. Если `arch` не в таблице и `profile` не указан → ошибка компилятора:
*"unknown target arch '6502': specify a platform profile"*

**Что генерируется в CMakeLists.txt:**

```cmake
# build/nes/CMakeLists.txt — сгенерировано tsclang
set(CMAKE_C_COMPILER cc65)
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR 6502)
add_compile_options(-t nes)    # cc65 platform target flag
add_executable(mygame ${SOURCES})
```

**Резолюция toolchain:**

TSClang не вызывает компилятор напрямую — он записывает нужный компилятор в `CMakeLists.txt`, CMake его находит и запускает. Какой компилятор использовать — определяется в три шага:

```
toolchain поле в конфиге
    ↓ нет?
declare platform { toolchain } в profile
    ↓ нет?
дефолт по arch из внутренней таблицы:
    x86-64  → clang, fallback gcc
    arm     → arm-none-eabi-gcc
    avr     → avr-gcc
    wasm32  → clang (wasm target)
    другой  → ошибка: "specify toolchain or profile"
```

Поле `toolchain` принимает имя или путь — то же соглашение что у импортов:

| Значение | Поведение |
|----------|-----------|
| `"avr-gcc"` | ищет бинарь в PATH |
| `"avr-gcc@12.1"` | pinned версия — ищет в `~/.tsc/toolchains/avr-gcc@12.1/bin/`, затем PATH |
| `"/opt/avr/bin/avr-gcc"` | абсолютный путь — используется напрямую |
| `"./tools/cc65/bin/cl65"` | путь относительно корня проекта (vendored toolchain) |

**Pinned toolchain** (`name@version`) — гарантирует воспроизводимость на CI:

```json
{
    "platform": {
        "avr": {
            "mcu": "atmega328p",
            "toolchain": "avr-gcc@12.1"
        }
    }
}
```

Логика поиска для `avr-gcc@12.1`:
1. `~/.tsc/toolchains/avr-gcc@12.1/bin/avr-gcc` — локальный кэш
2. `avr-gcc` в PATH с проверкой версии (`avr-gcc --version`)
3. Ошибка с подсказкой:

```
error: toolchain 'avr-gcc@12.1' not found
hint: tsclang toolchain install avr-gcc@12.1
```

Если бинарь не найден без версии — TSClang даёт понятную подсказку:

```
error: toolchain 'avr-gcc' not found in PATH
hint: brew install avr-gcc      (macOS)
      apt install gcc-avr       (Ubuntu)
```

**Экзотические компиляторы и CMake toolchain files:**

`gcc`, `clang`, `avr-gcc`, `arm-none-eabi-gcc` — CMake знает их из коробки.
`cc65`, `z88dk`, `djgpp` — нестандартные, требуют CMake toolchain file (`.cmake`).

Platform profile package включает его в себя:

```
@nes/platform/
  index.d.tsc       ← declare platform { ... }
  toolchain.cmake   ← CMake toolchain file для cc65
```

```typescript
// @nes/platform/index.d.tsc
declare platform {
    toolchain: "cc65"
    toolchainFile: "toolchain.cmake"  // без ./ → путь внутри пакета профиля
    heap: false
    ...
}
```

TSClang видит `toolchainFile` и добавляет в CMakeLists.txt:
```cmake
set(CMAKE_TOOLCHAIN_FILE ".../tsc_packages/@nes/platform/toolchain.cmake")
```

**`toolchainFile` — одно поле, два контекста:**

Соглашение то же, что у импортов: `./` = локальный путь, без `./` = путь внутри пакета.

| Значение | Откуда | Пример |
|----------|--------|--------|
| `"toolchain.cmake"` | внутри profile-пакета | в `declare platform {}` |
| `"./my-toolchain.cmake"` | локальный путь проекта | в `tsc.packages.json` |

**Конфигурация:**

```json
// известный MCU — профиль не нужен, компилятор знает его сам:
{
  "target": "avr",
  "mcu": "atmega328p",
  "toolchain": "avr-gcc"
}

// нестандартная/ретро платформа — профиль знает свой toolchainFile:
{
  "arch": "6502",
  "toolchain": "cc65",
  "profile": "@nes/platform"
}

// совсем экзотика — полностью ручная конфигурация:
{
  "arch": "z80",
  "toolchain": "z88dk",
  "toolchainFile": "./z88dk-toolchain.cmake",
  "profile": "@spectrum/platform"
}
```

**Структура платформенного профиля:**

```typescript
// @nes/platform/index.d.tsc

// 1. Capabilities — что умеет платформа
declare platform {
    heap: false          // нет malloc/free → Shared<T>, Map<K,V>, new на heap → ошибка компилятора
    fpu: false           // нет FPU → f32/f64 через software float → предупреждение
    bits: 8              // usize = u16 (6502 адресует 64 KB)
    address_bits: 16
    stack_size: 256      // байт (6502 stack page) → компилятор считает worst-case stack
}

// 2. Декларируем subset std/libc — только что cc65 реально предоставляет
declare module "std/libc" {
    function memcpy(dest: Mut<u8[]>, src: Ref<u8[]>, n: usize): void
    function memset(dest: Mut<u8[]>, c: u8, n: usize): void
    function memcmp(a: Ref<u8[]>, b: Ref<u8[]>, n: usize): i8
    function strlen(s: Ref<string>): usize
    // malloc — не декларируется: компилятор выдаст ошибку при попытке импорта
    // printf — не декларируется: cc65 имеет cprintf, не printf
}
```

Переопределение `std/libc` через `declare module` реиспользует уже существующий механизм declaration merging.

**Что компилятор делает с профилем:**

| Флаг | Эффект |
|------|--------|
| `heap: false` | `Shared<T>`, `Map<K,V>`, `new` на heap → ошибка компилятора |
| `fpu: false` | `f32`/`f64` операции → предупреждение "будет software float" |
| `bits: 8`, `address_bits: 16` | `usize` = `u16` |
| `stack_size: N` | компилятор считает worst-case stack, предупреждает при превышении |

```typescript
// target: @nes/platform

const map = new Map<string, i32>()
// ❌ ошибка компилятора: Map<K,V> требует heap; платформа: heap: false

import { malloc } from "std/libc"
// ❌ ошибка компилятора: malloc не задекларирован в профиле платформы

import { memcpy } from "std/libc"   // ✅
import { sin } from "std/math"      // ✅ — std/math не требует heap
```

**Платформо-специфичные API** — отдельные `.d.tsc`-пакеты, TSClang про них ничего не знает:

```typescript
import { PPU, OAM, nametable } from "@nes/ppu"      // NES графика
import { APU, pulse } from "@nes/apu"               // NES звук
import { joypad } from "@nes/input"                 // геймпад

import { screen, attr, border } from "@spectrum/ula" // ZX Spectrum дисплей
import { VDP, CRAM } from "@sega/vdp"               // Sega Genesis видео
import { intdos } from "@dos/int21h"                // MS-DOS системные вызовы
```

**Таблица известных платформ:**

| Платформа | Профиль | Heap | usize | std/ |
|-----------|---------|------|-------|------|
| x86-64 Linux/macOS/Windows | built-in | ✅ | `u64` | полный |
| ARM Cortex-M4 | built-in | ✅/❌ | `u32` | без io/fs/net/threads |
| AVR ATmega328p | built-in | ❌ | `u16` | math, libc partial |
| MS-DOS (djgpp) | built-in | ✅ | `u32` | libc почти полный |
| NES (6502/cc65) | `@nes/platform` | ❌ | `u16` | math, libc minimal |
| ZX Spectrum (Z80/z88dk) | `@spectrum/platform` | ❌ | `u16` | libc minimal |
| Sega Genesis (68k) | `@sega/platform` | ❌ | `u32` | math, libc |
| Любая экзотика | локальный `.d.tsc` | конфиг | конфиг | конфиг |

> Компилятор не знает про конкретные платформы — он знает про capabilities. Arduino = AVR + `@arduino/platform`. Raspberry Pi Pico = ARM Cortex-M0+ + `@rpi-pico/platform`. Любой новый таргет = новый профиль-пакет.

## Pipeline сборки

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (или .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

Структура `outDir`:
```
build/desktop/
  c/              ← сгенерированные .c и .h
  CMakeLists.txt
  myapp           ← бинарь (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## CLI команды

```bash
tsclang init                  # создать новый проект
tsclang build                 # собрать проект
tsclang install               # установить зависимости из tsc.packages.json
tsclang update                # обновить зависимости, пересоздать lock-файл
tsclang clean                 # удалить build артефакты (outDir)
tsclang run                   # собрать дефолтный build + запустить бинарь
tsclang dev                   # собрать и запустить в режиме отслеживания
tsclang lint                  # проверить форматирование без изменений (CI)проекта
tsclang lint --fix            # отформатировать все .tsc файлы
```

- Если build не указан — используется `"desktop"` или первый в списке
- Параметры build переопределяют дефолтные настройки компилятора

## `tsclang install` vs `tsclang update`

| | `tsclang install` | `tsclang update` |
|---|---|---|
| Lock-файл существует | использует точные версии из lock | игнорирует lock, ищет новые версии |
| Lock-файл отсутствует | резолвит по constraints, создаёт lock | то же |
| Результат | воспроизводимая установка | обновлённый lock-файл |

## `tsclang update` подробно

Поведение по типу зависимости:

| Тип | Поведение |
|-----|-----------|
| semver `^1.0.0` | обновляет до последней версии в рамках constraint |
| git `@main` (ветка) | pull latest commit, обновляет lock |
| git `@1.0.0` (тег) | зафиксирован — пропускает, выводит предупреждение |
| git `@a1b2c3d` (коммит) | зафиксирован — пропускает, выводит предупреждение |
| url | нет реестра — пропускает, выводит предупреждение |

```bash
tsclang update            # обновить всё что можно
tsclang update <dep>      # обновить конкретную зависимость
tsclang update @scope/sdl2              # обновить только sdl2
tsclang update @scope/sdl2 @scope/json  # обновить несколько
```

После `tsclang update` необходимо запустить `tsclang install` для применения изменений.

## `tsclang build` подробно

```bash
tsclang build                 # собрать дефолтный build
tsclang build <name>          # собрать конкретный build
tsclang build hello.tsc       # одиночный файл → binary

# флаги (override конфига)
tsclang build --emit c        # только генерация C
tsclang build --emit binary   # C + компиляция в бинарь
tsclang build --emit hex      # C + avr-gcc → .hex
tsclang build --outDir ./dist # переопределить outDir
```

- Если build не указан — используется `"desktop"` или первый в списке
- Параметры build переопределяют дефолтные настройки компилятора

## `tsclang run` подробно

```bash
tsclang run                   # собрать дефолтный build + запустить бинарь
tsclang run <name>            # собрать конкретный build + запустить бинарь
tsclang run -- --foo bar      # передать аргументы в запускаемый бинарь
```

`tsclang run` = `tsclang build` + запуск скомпилированного бинаря. Только для `emit: "binary"`.

```
tsclang run
  │
  ├─ 1. tsclang build        ← компилирует .tsc → .c → бинарь
  └─ 2. exec <outDir>/myapp  ← запускает бинарь, stdout/stderr в терминал
```

- Если `emit` не `"binary"` — ошибка: `error: tsclang run requires emit: "binary"`
- Код выхода бинаря пробрасывается как код выхода `tsclang run`
- Аргументы после `--` передаются напрямую в бинарь:
  ```bash
  tsclang run -- --port 8080 --verbose
  # запускает: ./build/desktop/myapp --port 8080 --verbose
  ```

## `tsclang dev` подробно

Запускает сборку в режиме Hot Reload / Hot Restart.

Аргументы идентичны команде `tsclang run`.

Команда CLI, не механизм компилятора. Никаких аннотаций и специальной кодогенерации не требуется.

**Workflow:**
1. Разработчик запускает `tsclang dev`
2. Код компилируется и запускается автоматически
3. Разработчик сохраняет файл в IDE
4. `tsclang dev` обнаруживает изменение → инкрементальная пересборка → перезапуск

**Desktop** — пересборка + kill + restart процесса.
**Embedded** — пересборка + автоматическая прошивка через avrdude/openocd.

- File watcher: inotify (Linux) / FSEvents (macOS) / ReadDirectoryChangesW (Windows)
- Инкрементальная сборка — пересобирает только изменённые файлы
- Desktop: kill старого процесса + запуск нового
- Embedded (`"target": "avr"` и др.): пересборка + автоматическая прошивка

## `tsclang init` подробно

```bash
tsclang init             # создать проект в текущей директории
tsclang init myapp       # создать проект в новой директории myapp
```

`tsclang init` создаёт:

```
myapp/
  src/
    main.tsc
  tsc.packages.json
```

Минимальный `tsc.packages.json`:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc",
  "builds": {
    "desktop": { "emit": "binary", "outDir": "build/desktop" }
  }
}
```

## Быстрый старт

```bash
npm install -g tsclang   # установить компилятор
tsclang init myapp       # создать проект
cd myapp
tsclang install          # установить зависимости
tsclang run              # собрать и запустить
```

## Источники зависимостей (все варианты вместе)

```json
{
  "dependencies": {
    "@myco/mylib": "^1.0.0",
    "@scope/sdl2": ">=2.28.0",
    "@types/sqlite3": ">=3.44.0",
    "sqlite3": ">=3.44.0", // синоним @types/sqlite3
  }
}
```

## Версионирование

**Semver строка** — полный semver: `^1.0.0`, `~1.2.0`, `>=1.0.0`, `1.0.0`

## Резолюция semver-зависимостей

Для зависимостей заданных строкой компилятор ищет в следующем порядке:

1. **Система** — `pkg-config` проверяет наличие и версию
   - Найдена и версия удовлетворяет constraint → используем, ничего не скачиваем
   - Не найдена или версия не подходит → переходим к шагу 2
2. **Реестр** (`tsc-lang.org`) — скачивает и собирает нужную версию
   - _(реестр не реализован)_ → ошибка компилятора с подсказкой:
     ```
     error: @scope/sdl2 >=2.28.0 not found
     hint: install it manually, e.g.:
       apt install libsdl2-dev
       brew install sdl2
     ```

Версия найденной через `pkg-config` системной библиотеки **записывается в lock-файл**. При последующем `tsclang install` если система предоставляет другую версию — ошибка:
```
error: lock file requires sdl2 2.28.5, system has 2.26.0
hint: run `tsclang update` to re-resolve, or install the required version:
  apt install libsdl2-2.28-dev
  brew install sdl2@2.28
```

Конфликты между зависимостями (несовместимые constraints на одну C-библиотеку) детектируются при `tsclang install` — до генерации CMake:
```
error: dependency conflict
  @pkg-a requires sdl2 >=2.28.0
  @pkg-b requires sdl2 <2.20.0
  hint: pin a compatible version in tsc.packages.json:
    "sdl2": "2.19.0"
```

## Реестр

- Централизованный реестр `tsc-lang.org`
- Публикация `.tsc` пакетов и `.d.tsc` деклараций для C-либ
