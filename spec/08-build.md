# TSClang — Система сборки

## Build Profiles

Именованные профили сборки в `tsc.package.json`:

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

## tsc.package.json — поля

**Пример:**

```json
{
  "name": "@myco/mylib",
  "version": "1.0.0",
  "description": "My awesome TSClang library",
  "author": "My Company <contact@myco.com>",
  "license": "MIT",
  "keywords": ["database", "sqlite"],
  "repository": {
    "type": "git",
    "url": "https://github.com/myco/mylib.git"
  },
  "tscVersion": ">=0.1.0",
  "files": ["index.tsc", "src/"],
  "type": "library",
  "dependencies": {
    "@tsc/sqlite3": "^1.0.0"
  },
  "devDependencies": {
    "@tsc/test": "^1.0.0"
  },
  "builds": {
    "desktop": {
      "emit": "binary",
      "outDir": "build/desktop",
      "optimize": "O2"
    },
    "avr": {
      "target": "avr",
      "mcu": "atmega328p",
      "toolchain": "avr-gcc",
      "optimize": "Os",
      "binaryMode": "small",
      "emit": "hex",
      "outDir": "build/avr"
    }
  }
}
```

**Основные поля:**

| Поле | Обязательно | Описание |
|------|-------------|----------|
| `name` | да | Имя пакета (`@scope/name` для библиотек) |
| `version` | да | Версия в формате semver |
| `type` | нет | `"executable"` (дефолт), `"library"`, `"platform"` |
| `main` | для exe | Entry point файл |
| `dependencies` | нет | Зависимости пакета |
| `devDependencies` | нет | Зависимости разработки, в продакшене не устанавливаются |
| `overrides` | нет | Override версий зависимостей |

**Метаданные (для реестра):**

| Поле | Описание |
|------|----------|
| `description` | Краткое описание пакета |
| `author` | Автор (имя или `"Name <email>"`) |
| `license` | Лицензия (`"MIT"`, `"Apache-2.0"`, `"GPL-3.0"`) |
| `keywords` | Массив ключевых слов для поиска |
| `repository` | Репозиторий: `{ "type": "git", "url": "..." }` |
| `homepage` | URL домашней страницы |
| `bugs` | URL для баг-репортов: `{ "url": "..." }` |
| `tscVersion` | Требуемая версия TSClang (`">=0.1.0"`) |
| `files` | Файлы для публикации (массив путей). `devDependencies` исключаются автоматически. |

**Четыре типа проектов:**

| Тип | Описание | `"type"` | Entry point |
|-----|----------|----------|-------------|
| **Executable** | Приложение | не указан (дефолт) | `"main"` (обязательно) |
| **TSClang-библиотека** | Библиотека на TSClang | `"library"` | `index.tsc` (конвенция) |
| **C-wrapper** | Обёртка над C-библиотекой | `"library"` | `index.d.tsc` |
| **Platform profile** | Профиль платформы | `"platform"` | `index.d.tsc` |

`"type"` управляет поведением автодетекта:

| Значение | Поведение |
|----------|-----------|
| не указан | то же, что `"executable"` |
| `"executable"` | компилятор ищет entry point, ошибка если не найден |
| `"library"` | entry point не ищется, генерируются только `.h` + `.a`/`.so` |
| `"platform"` | платформенный профиль — только `declare platform {}` и `declare module`, без кода |

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

// overrides — принудительная версия при конфликте зависимостей
{
  "name": "myapp",
  "version": "1.0.0",
  "overrides": {
    "@myco/utils": "2.1.0"
  }
}
```

## Поля build конфига

Именованные конфигурации для разных платформ.

| Поле | Описание | Дефолт |
|------|----------|--------|
| `target` | Целевая платформа (`"avr"`, `"arm"`, `"x86-64"`) | текущая платформа |
| `mcu` | Конкретный чип (`"atmega328p"`, `"stm32f103"`) | — |
| `arch` | Архитектура (`"avr"`, `"arm"`, `"desktop"`, `"6502"`) | — |
| `toolchain` | Компилятор (`"avr-gcc"`, `"cc65"`, `"arm-none-eabi-gcc"`) | — |
| `toolchainFile` | Путь к CMake toolchain file | — |
| `profile` | Platform profile пакет (`"@nes/platform"`) | — |
| `optimize` | Уровень оптимизации (`"O0"`, `"O1"`, `"O2"`, `"O3"`, `"Os"`) | `O0` |
| `defaultNumber` | Тип для `number` (`"f64"`, `"f32"`, `"i32"`) | `f64` |
| `binaryMode` | `"normal"` / `"small"` (type erasure) | `"normal"` |
| `emit` | тип вывода: `"c"`, `"binary"`, `"hex"`, `"lib"` | `"binary"` для desktop, `"hex"` для embedded |
| `outDir` | директория вывода | `./build/<name>` |
| `main` | entry point файл (override верхнего уровня) | наследует |
| `runtime` | async runtime: `"libuv"`, `"io_uring"`, `"embedded"` | `"libuv"` для desktop, `"embedded"` для embedded |

**`"binaryMode": "small"`** — режим для сильно ограниченных embedded платформ (AVR Arduino: 32 КБ flash). Включает type erasure для generic pointer types:
- `Array<T>` где T — pointer/complex type → единая реализация через `void*` (одна копия кода для всех Array типов)
- Монорфизация только для примитивов (`Array<i32>`, `Array<u8>` — остаются отдельными)
- Enum string tables — не генерируются, `.toString()` возвращает номер
- Трейдофф: меньше кода → меньше flash; но нет type-safe runtime проверок для erased типов

## Platform Profile

Компилятор должен знать в compile-time: какие функции libc доступны, есть ли heap, сколько бит адрес — чтобы выдавать ошибки заранее, не на этапе линковки.

**Platform Profile** — это `.d.tsc` пакет с `"type": "platform"`, который декларирует возможности конкретной платформы:

- Какой toolchain использовать
- Есть ли heap, FPU
- Размер `usize`, stack
- Какие функции libc доступны

Компилятор использует профиль для **ранних ошибок** — до этапа линковки.

**Принцип: один профиль = одна платформа.**

### Источники профилей

| Источник | Когда использовать | Пример |
|----------|-------------------|--------|
| **Built-in** | Стандартные платформы | `desktop`, `avr`, `arm` |
| **Community пакет** | Ретро/экзотика | `@nes/platform`, `@spectrum/platform` |
| **Локальный** | Свой SoC, экзотика | `./profiles/my-platform.d.tsc` |

#### Built-in профили

Компилятор знает стандартные платформы:

| Target | usize | heap | fpu | std/ |
|--------|-------|------|-----|------|
| `desktop` | `u64` | ✅ | ✅ | полный |
| `arm` (Cortex-M) | `u32` | ✅/❌ | ✅/❌ | без io/fs/net/threads |
| `avr` | `u16` | ❌ | ❌ | math, libc partial |
| `wasm32` | `u32` | ✅ | ✅ | ограниченный |
| `dos` | `u32` | ✅ | ❌ | libc почти полный |

Для built-in профилей поле `profile` не нужно — достаточно `target`.

### Подключение к проекту

#### 1. Community профиль

```json
{
  "dependencies": {
    "@nes/platform": "^1.0.0"
  },
  "builds": {
    "nes": {
      "arch": "6502",
      "toolchain": "cc65",
      "profile": "@nes/platform"
    }
  }
}
```

#### 2. Локальный профиль

```json
{
  "builds": {
    "custom": {
      "arch": "z80",
      "toolchain": "z88dk",
      "profile": "./profiles/my-platform.d.tsc"
    }
  }
}
```

#### 3. Built-in профиль

```json
{
  "builds": {
    "avr": {
      "target": "avr",
      "mcu": "atmega328p",
      "toolchain": "avr-gcc"
    }
  }
}
```

`profile` не указан — компилятор использует built-in.

### Как используется при сборке

```
tsclang build nes
  │
  ├─ 1. Загрузить профиль (@nes/platform или ./profiles/...)
  │
  ├─ 2. Прочитать declare platform { heap, fpu, bits... }
  │
  ├─ 3. Проверить код проекта:
  │      - heap: false → Map<K,V>, Shared<T> → ошибка
  │      - fpu: false → f32/f64 → предупреждение
  │      - импорт недекларированного std/libc → ошибка
  │
  ├─ 4. Сгенерировать CMakeLists.txt:
  │      - set(CMAKE_C_COMPILER cc65)
  │      - set(CMAKE_TOOLCHAIN_FILE .../toolchain.cmake)
  │
  └─ 5. CMake + cc65 → бинарник
```

### Структура платформенного профиля

```
@nes/platform/
  tsc.package.json
  index.d.tsc
  toolchain.cmake      ← опционально, для нестандартных компиляторов (cc65, z88dk)
```

Можно разбить declarations внутри профиля `index.d.tsc` по отдельным файлам:

```
@nes/platform/
  tsc.package.json
  index.d.tsc          # import "./platform"; import "./libc";
  platform.d.tsc       # declare platform { heap, fpu, bits... }
  libc.d.tsc           # declare module "std/libc" { memcpy, memset... }
  ppu.d.tsc            # declare функции для PPU
```

```typescript
// index.d.tsc
import "./platform.d.tsc";
import "./libc.d.tsc";
import "./ppu.d.tsc";
```

Используется **side-effect import** — загружает декларации в контекст компиляции без экспорта. Подробнее см. TSCLIB.md → "Импорты в .d.tsc файлах".

Компилятор собирает все `.d.tsc` в папке пакета.

### Три источника профилей

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
| `"./my-toolchain.cmake"` | локальный путь проекта | в `tsc.package.json` |

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

### Поля declare platform

| Поле | Тип | Описание |
|------|-----|----------|
| `toolchain` | `string` | Имя компилятора (`"cc65"`, `"avr-gcc"`) |
| `toolchainFile` | `string` | Путь к CMake toolchain file (внутри пакета — без `./`) |
| `heap` | `bool` | Доступен ли malloc/free |
| `fpu` | `bool` | Есть ли FPU (иначе software float) |
| `bits` | `u8` | Разрядность CPU (8, 16, 32, 64) |
| `address_bits` | `u8` | Ширина адреса (влияет на `usize`) |
| `stack_size` | `u32` | Размер стека в байтах |

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

## Полная таблица платформ

Все стандартные платформы с архитектурой, toolchain и форматом вывода.

### Desktop & General

| Платформа | Описание | Fallback | LLVM/GCC Triple | Выходной файл | Toolchain | Флаги |
|-----------|----------|----------|-----------------|---------------|-----------|-------|
| `desktop` | Универсальный x86-64 | — | x86_64-unknown-none | — | gcc, clang | |
| `linux` | Linux x86-64 | `desktop` | x86_64-unknown-linux-gnu | .elf | gcc | -fPIC, -O2 |
| `macos` | macOS Intel/Apple Silicon | `desktop` | x86_64-apple-darwin / aarch64-apple-darwin | .macho | clang (Xcode) | -arch arm64 |
| `windows` | Windows x86-64 | `desktop` | x86_64-pc-windows-msvc | .exe | msvc, mingw | -static, -mwindows |
| `arm64` | ARM64 Desktop/Server | `desktop` | aarch64-unknown-linux-gnu | — | gcc, clang | -march=armv8-a |
| `riscv64` | RISC-V 64-bit | `desktop` | riscv64-unknown-linux-gnu | — | riscv64-unknown-elf-gcc | -march=rv64gc |

### Mobile & Portable

| Платформа | Описание | Fallback | LLVM/GCC Triple | Выходной файл | Toolchain | Флаги |
|-----------|----------|----------|-----------------|---------------|-----------|-------|
| `android` | Google Android | `arm64` | aarch64-linux-android | .so / .apk | ndk (clang) | -shared |
| `ios` | Apple iOS | `arm64` | aarch64-apple-ios | .app | clang | -miphoneos-version-min=11.0 |

### Web & Runtime

| Платформа | Описание | Fallback | LLVM/GCC Triple | Выходной файл | Toolchain | Флаги |
|-----------|----------|----------|-----------------|---------------|-----------|-------|
| `wasm32` | WebAssembly (браузер) | — | wasm32-unknown-unknown | .wasm / .html | emscripten | -s WASM=1, --no-entry |
| `wasi` | WebAssembly System Interface | `wasm32` | wasm32-wasi | .wasm | wasi-sdk | --target=wasm32-wasi |

### Embedded & IoT

| Платформа | Описание | Fallback | LLVM/GCC Triple | Выходной файл | Toolchain | Флаги |
|-----------|----------|----------|-----------------|---------------|-----------|-------|
| `avr` | 8-bit AVR (Arduino Uno) | — | avr-atmel-none | .hex / .elf | avr-gcc | -mmcu=atmega328p, -Os |
| `arm` | ARM Cortex-M (STM32, nRF) | — | thumbv7m-none-eabi | .bin / .elf | arm-none-eabi-gcc | -mthumb, -mcpu=cortex-m4 |
| `esp32` | ESP32 (Xtensa / RISC-V) | — | xtensa-esp32-elf | .bin | xtensa-esp32-elf-gcc | -mlongcalls, -mauto-litpools |
| `esp8266` | ESP8266 (L106) | — | — | .bin | xtensa-lx106-elf-gcc | |
| `pico` | Raspberry Pi Pico (RP2040) | `arm` | thumbv6m-none-eabi | .uf2 | arm-none-eabi-gcc | -mcpu=cortex-m0plus |

### Retro & Legacy

| Платформа | Описание | Fallback | LLVM/GCC Triple | Выходной файл | Toolchain | Флаги |
|-----------|----------|----------|-----------------|---------------|-----------|-------|
| `dos` | MS-DOS (djgpp / x86 32-bit) | — | i386-pc-msdosdjgpp | .exe / .com | djgpp (gcc) | -march=i386 |
| `nes` | Nintendo Entertainment System | — | mos6502-nes | .nes | cc65 | -t nes |
| `spectrum` | ZX Spectrum (Z80) | — | z80-unknown-none | .tap / .z80 | z88dk (sccz80) | +zx -vn |
| `genesis` | Sega Genesis (68000) | — | m68k-unknown-elf | .bin | m68k-elf-gcc | -m68000, -nostdlib |
| `c64` | Commodore 64 (6510) | — | mos6510-c64 | .prg | cc65 / kickasm | -t c64 |
| `gb` | Game Boy Classic (LR35902) | — | lr35902-unknown-none | .gb | rgbds / gbdk-n | -mgbz80 |
| `gba` | Game Boy Advance (ARM7TDMI) | `arm` | armv4t-none-eabi | .gba | arm-none-eabi-gcc | -mthumb -mthumb-interwork |
| `3ds` | Nintendo 3DS | `arm` | armv6k-none-eabi | .cia / .3dsx | devkitARM | |
| `wii` | Nintendo Wii | — | powerpc-broadway-eabi | .dol | devkitPPC | |

### Consoles

| Платформа | Описание | Fallback | Архитектура (ISA) | LLVM Triple | GCC Triple | Toolchain | Флаги |
|-----------|----------|----------|--------------------|-------------|------------|-----------|-------|
| `ps1` | Sony PlayStation 1 | — | MIPS I (R3000A) | mipsel-unknown-none | mipsel-unknown-elf | mipsel-unknown-elf | -msoft-float, -G0 |
| `ps2` | Sony PlayStation 2 | `ps1` | MIPS III+ (R5900) | mips64r5900el-unknown-elf | mips64r5900el-ps2-elf | ee-gcc | -mhard-float, -mabi=eabi |
| `psp` | Sony PlayStation Portable | `ps2` | MIPS (Allegrex) | mipsel-scei-psp | psp-elf | psp-gcc | -march=allegrex, -fno-PIC |
| `ps3` | Sony PlayStation 3 | `desktop` | PowerPC (Cell/PPC) | ppc64-ibm-lv2 | ppu-lv2-gcc | ppu-gcc | -m64, -maltivec |
| `ps4` | Sony PlayStation 4 | `linux` | x86-64 (Jaguar) | x86_64-scei-ps4 | x86_64-pc-freebsd12* | clang | -fPIC, -target x86_64-scei-ps4 |
| `ps5` | Sony PlayStation 5 | `ps4` | x86-64 (Zen 2) | x86_64-scei-ps5 | x86_64-pc-freebsd14* | clang | -march=zen2 |
| `vita` | PS Vita | `arm` | ARM Cortex-A9 | armv7-scei-vita-eabihf | arm-vita-eabi | arm-vita-eabi | |
| `xbox` | Original Xbox | `windows` | x86 (Pentium III) | i386-pc-win32 | i386-pc-xbox-elf | msvc (i386) / nxdk | -target i386-pc-win32 |
| `xbox360` | Xbox 360 (Xenon PPC) | `desktop` | PowerPC (Xenon) | ppc-pc-xbox360 | powerpc-xbox360-elf | msvc (PowerPC) | -arch:PPC, -D_XBOX |
| `xboxone` | Xbox One | `windows` | x86-64 (Jaguar) | x86_64-pc-win32-msvc | — | msvc | -D_UWP, -guard:cf |
| `xboxseries` | Xbox Series X/S | `windows` | x86-64 (Zen 2) | x86_64-pc-win32-msvc | — | msvc | -march=zen2, -D_GAMING_DESKTOP |
| `switch` | Nintendo Switch | `arm64` | aarch64-none-elf | .nro / .nsp | devkitA64 | |

### Консоле-специфичные особенности

- **Порядок байтов:** `ps4`, `ps5`, `xbox`, `xboxone`, `xboxseries` — Little-Endian. `ps3`, `xbox360`, `wii` — **Big-Endian**. Критично для линковки данных и ресурсов.
- **Формат SELF (ps3):** исполняемые файлы PS3 — подписанные ELF (Signed ELF). После линковки обычного `.elf` требуется утилита для упаковки в `.self`. То же для `.prx`, `.pkg`.
- **PPU и SPU (ps3):** основной код компилируется для PPU (PowerPC), отдельно собираются бинарные образы для SPU (Synergistic Processing Units).
- **FPU (ps1, ps2):** часто требуется флаг `-msoft-float` или использование кастомных векторных юнитов (VU0/VU1).
- **Формат XBE/XEX:** для `xbox` базой является PE (как в Windows), но с кастомными заголовками XBE (xbox) и XEX (xbox360).
- **Формат DOL (wii):** вместо стандартного ELF используется формат DOL (Dolphin). Линковщик создаёт ELF, затем `elf2dol` конвертирует в плоский бинарник с заголовком секций.
- **Формат NRO (switch):** несмотря на совпадение архитектуры с `arm64`, Switch требует NRO (Nintendo Relocatable Object) с поддержкой динамической загрузки.
- **LLVM Triple для консолей:** официальные SDK Sony/Microsoft используют проприетарные triple. Open-source инструменты мимикрируют под triple ОС — PS4/5 основаны на FreeBSD, поэтому используется FreeBSD triple для корректной линковки библиотек.

### Параметры компиляции (справка)

| Флаг | Назначение |
|------|-----------|
| `-Os` | Оптимизация по размеру — критично для `avr`, `nes`, `gb` (ограниченная flash) |
| `-fPIC` | Позиционно-независимый код — для `linux`/`android` библиотек |
| `-nostdlib` | Исключить стандартные библиотеки — почти всегда нужно для retro и embedded |

### Публикация профиля

```bash
tsclang publish
```

Публикуется как пакет с `"type": "platform"`:

```
@nes/platform@1.0.0/
  tsc.package.json
  index.d.tsc
  toolchain.cmake
```

### Примеры

#### NES (6502/cc65)

```typescript
// @nes/platform/index.d.tsc
declare platform {
    toolchain: "cc65"
    toolchainFile: "toolchain.cmake"
    heap: false
    fpu: false
    bits: 8
    address_bits: 16
    stack_size: 256
}

declare module "std/libc" {
    function memcpy(dest: Mut<u8[]>, src: Ref<u8[]>, n: usize): void
    function memset(dest: Mut<u8[]>, c: u8, n: usize): void
    function strlen(s: Ref<string>): usize
}
```

#### ZX Spectrum (Z80/z88dk)

```typescript
// @spectrum/platform/index.d.tsc
declare platform {
    toolchain: "z88dk"
    toolchainFile: "toolchain.cmake"
    heap: false
    fpu: false
    bits: 8
    address_bits: 16
    stack_size: 512
}

declare module "std/libc" {
    function memcpy(...): void
    function memset(...): void
    function strlen(...): usize
}
```

#### Sega Genesis (68000)

```typescript
// @sega/platform/index.d.tsc
declare platform {
    toolchain: "m68k-elf-gcc"
    heap: false
    fpu: false
    bits: 32
    address_bits: 24
    stack_size: 4096
}

declare module "std/libc" {
    function memcpy(...): void
    function memset(...): void
    function memcmp(...): i8
    function strlen(...): usize
}
```

## declare library — требования библиотеки к платформе

Библиотека может декларировать требования к платформе в `index.d.tsc`. Компилятор проверяет совместимость при сборке.

```typescript
// @myco/async/index.d.tsc
declare library {
    name: "@myco/async"
    version: "1.0.0"

    requires: ["heap", "threads"]
    minHeap: 65536
    minBits: 32

    stdModules: ["std/threads", "std/sync"]
}
```

### Поля declare library

| Поле | Тип | Описание |
|------|-----|----------|
| `name` | string | Имя пакета |
| `version` | string | Версия |
| `requires` | string[] | `"heap"`, `"threads"`, `"filesystem"`, `"fpu"` |
| `minHeap` | number | Минимальный heap в байтах |
| `minBits` | number | Минимальная разрядность (8, 16, 32, 64) |
| `minStack` | number | Минимальный стек в байтах |
| `stdModules` | string[] | Требуемые std-модули |
| `staticOnly` | boolean | Fallback для no-heap платформ |

### Примеры

**Библиотека с heap:**

```typescript
// @myco/collections/index.d.tsc

declare library {
    name: "@myco/collections"
    version: "1.0.0"
    
    requires: ["heap"]
    
    // Fallback для embedded
    fallback: {
        staticOnly: true
        maxCapacity: 256
    }
}
```

**C-wrapper:**

```typescript
// @tsc/sqlite3/index.d.tsc

declare library {
    name: "@tsc/sqlite3"
    version: "3.45.0"
    
    requires: ["heap", "filesystem"]
    minHeap: 65536
    minBits: 16
    
    stdModules: ["std/fs", "std/io"]
}

declare opaque type SqliteDb { destructor: sqlite3_close }
// ...
```

**Embedded библиотека:**

```typescript
// @myco/sensor/index.d.tsc

declare library {
    name: "@myco/sensor"
    version: "1.0.0"
    
    requires: []  // no heap, no threads
    
    // Работает везде
    platforms: ["avr", "arm", "desktop"]
}
```

### Проверка совместимости

При компиляции проекта компилятор сопоставляет `declare library` с `declare platform`:

```
error: @myco/async requires "heap" but platform has heap: false
  library: @myco/async/index.d.tsc
  platform: @avr/platform
  hint: use @myco/async/static or choose different library
```

```
error: @tsc/sqlite3 requires minHeap 65536 but platform has 4096
  library: @tsc/sqlite3
  platform: @arm/platform (Cortex-M0)
  hint: increase heap size or use lighter alternative
```

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

| Команда | Алиас | Описание |
|---------|-------|----------|
| `tsclang init` | — | Создать новый проект |
| `tsclang build` | `b` | Собрать проект |
| `tsclang install` | `i` | Установить зависимости |
| `tsclang update` | `u` | Обновить зависимости |
| `tsclang remove` | `r` | Удалить зависимость |
| `tsclang clean` | `c` | Удалить build артефакты |
| `tsclang run` | — | Собрать и запустить |
| `tsclang dev` | — | Режим отслеживания изменений |
| `tsclang lint` | `l` | Проверить форматирование |

```bash
tsclang b                     # = tsclang build
tsclang i                     # = tsclang install
tsclang i @tsc/sqlite3 -d     # добавить dev-зависимость
tsclang u                     # = tsclang update
tsclang r @tsc/sqlite3        # = tsclang remove
tsclang l -f                  # форматировать
```

- Если build не указан — используется `"desktop"` или первый в списке
- Параметры build переопределяют дефолтные настройки компилятора

## `tsclang install` vs `tsclang update`

| | `tsclang install` | `tsclang update` |
|---|---|---|
| Lock-файл существует | использует точные версии из lock | игнорирует lock, ищет новые версии |
| Lock-файл отсутствует | резолвит по constraints, создаёт lock | то же |
| Результат | воспроизводимая установка | обновлённый lock-файл |

### Флаги `tsclang install`

| Флаг | Сокращение | Описание |
|------|------------|----------|
| `--production` | `-p` | Установить только `dependencies`, без `devDependencies` |
| `--dev` | `-d` | Установить только `devDependencies` |
| `--force` | `-f` | Игнорировать несовместимости зависимостей между собой и платформой |

### Добавление зависимостей

```bash
tsclang install                     # установить все
tsclang install @tsc/sqlite3        # добавить в dependencies
tsclang install @tsc/test -d        # добавить в devDependencies
tsclang install @tsc/a @tsc/b -d    # добавить несколько сразу
tsclang install @tsc/sqlite3@^1.2.0 # с указанием версии
```

### Удаление зависимостей

```bash
tsclang remove                      # удалить все
tsclang remove @tsc/sqlite3         # удалить из dependencies или devDependencies
tsclang remove @tsc/a @tsc/b        # удалить несколько сразу
tsclang remove @tsc/sqlite3 -f      # --force, без подтверждения
```

Удаление требует подтверждения:

```
? Remove @tsc/sqlite3 from dependencies? (Y/n)
```

Флаг `--force` / `-f` пропускает подтверждение.

## `tsclang update` подробно

| Флаг | Сокращение | Описание |
|------|------------|----------|
| `--force` | `-f` | Игнорировать несовместимости зависимостей между собой и платформой |

```bash
tsclang update                          # обновить всё что можно
tsclang update <dep>                    # обновить конкретную зависимость
tsclang update @scope/sdl2              # обновить только sdl2
tsclang update @scope/sdl2 @scope/json  # обновить несколько
```

`tsclang update` автоматически запускает `tsclang install` после обновления lock-файла.

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
tsclang init myapp                    # executable
tsclang init mylib --library          # TSClang-библиотека
tsclang init sqlite3 --declaration    # C-wrapper
```

Короткие флаги:

```bash
tsclang init mylib -l      # TSClang-библиотека
tsclang init sqlite3 -d    # C-wrapper
```

| Флаг | Короткий | Что создаёт |
|------|----------|-------------|
| (без флага) | — | executable |
| `--library` | `-l` | TSClang-библиотека |
| `--declaration` | `-d` | C-wrapper |

Без аргумента — создаёт проект в текущей директории: `tsclang init`

`tsclang init` создаёт:

```
myapp/
  src/
    main.tsc
  tsc.package.json
```

Минимальный `tsc.package.json`:

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
    "sqlite3": ">=3.44.0"
  },
  "devDependencies": {
    "@tsc/test": "^1.0.0",
    "@tsc/lint": "^0.2.0"
  }
}
```

## devDependencies

Зависимости разработки — не попадают в публикуемый пакет, не устанавливаются с `--production`.

**Типичное содержимое:**
- Тест-фреймворки (`@tsc/test`)
- Lint-инструменты (`@tsc/lint`)
- Тайпинги для C-библиотек (при разработке C-wrapper'ов)
- Build-инструменты

**Поведение при установке:**

| Команда | Устанавливает |
|---------|---------------|
| `tsclang install` | `dependencies` + `devDependencies` |
| `tsclang install -p` / `--production` | только `dependencies` |
| `tsclang install -d` / `--dev` | только `devDependencies` |

**Публикация:**

`devDependencies` автоматически исключаются из пакета при `tsclang publish` — поле `files` не нужно explicitly перечислять.

## Версионирование

**Semver строка** — полный semver: `^1.0.0`, `~1.2.0`, `>=1.0.0`, `1.0.0`

## Резолюция semver-зависимостей

Для зависимостей заданных строкой компилятор ищет в следующем порядке:

1. **Система** — `pkg-config` проверяет наличие и версию
   - Найдена и версия удовлетворяет constraint → используем, ничего не скачиваем
   - Не найдена или версия не подходит → переходим к шагу 2
2. **Реестр** (`registry.tsclang.org`) — скачивает и собирает нужную версию
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
  hint: pin a compatible version in tsc.package.json:
    "sdl2": "2.19.0"
```

## Реестр

- Централизованный реестр `registry.tsclang.org`
- Публикация `.tsc` пакетов и `.d.tsc` деклараций для C-либ

## Flat dependency tree

TSClang использует единый (flat) список зависимостей — как Cargo и Go, а не вложенные `node_modules`.

```
❌ node_modules style (nested — каждый пакет тянет свою версию):
  myapp/node_modules/@myco/a/node_modules/@myco/utils@1.0.0
  myapp/node_modules/@myco/b/node_modules/@myco/utils@2.0.0

✅ Flat style (одна версия на проект):
  @myco/utils@2.1.0   ← максимальная версия, удовлетворяющая всем constraints
```

**Алгоритм резолюции:**
1. Собрать все constraints на пакет из всего дерева зависимостей
2. Найти максимальную версию, удовлетворяющую всем
3. Если невозможно — ошибка компиляции:

```
error: version conflict for @myco/utils
  @myco/db@1.0.0 requires @myco/utils ^2.0.0
  @myco/http@1.0.0 requires @myco/utils ^1.0.0
  hint: add "overrides" to tsc.package.json to force a version
```

Поле `overrides` — принудительная версия при неразрешимом конфликте:

```json
{
  "overrides": {
    "@myco/utils": "2.1.0"
  }
}
```

**Детали:**
- Применяется ко всем транзитивным зависимостям (не только прямым)
- Имеет приоритет над всеми constraints
- Использовать как последний resort — может сломать несовместимые версии

## Структура lock-файла

`tsc.package.lock` фиксирует точные версии и хеши для воспроизводимой установки:

```json
{
  "packages": {
    "@tsc/sqlite3": {
      "version": "1.0.0",
      "resolved": "https://registry.tsclang.org/@tsc/sqlite3/1.0.0.tgz",
      "integrity": "sha256:abc123..."
    },
    "@myco/utils": {
      "version": "2.1.0",
      "resolved": "https://registry.tsclang.org/@myco/utils/2.1.0.tgz",
      "integrity": "sha256:def456..."
    }
  }
}
```

Lock-файл коммитится в репозиторий. `tsclang install` с существующим lock-файлом устанавливает точные зафиксированные версии.

## Кеш

Глобальный кеш `~/.tsclang/cache/` — дедупликация между проектами:

```
~/.tsclang/cache/
  @tsc/sqlite3@1.0.0/
    source/
      index.d.tsc
      tsc.package.json
    build/
      desktop/
        include/  sqlite3.h
        lib/      libsqlite3.a
      avr-atmega328p/
        include/
        lib/
      arm-cortex-m4/
        include/
        lib/
    .tsc-build-info.json
```

Одна версия библиотеки — отдельные сборки под каждый таргет.

**Инвалидация кеша** — пересборка если:

| Условие | Действие |
|---------|----------|
| Исходник изменён | Перекомпилировать |
| `tscVersion` компилятора изменился | Перекомпилировать всё |
| `target` / `mcu` изменился | Перекомпилировать под новый таргет |
| `cflags` изменены | Перекомпилировать |

`.tsc-build-info.json`:
```json
{
  "compilerVersion": "0.1.0",
  "target": "avr",
  "mcu": "atmega328p",
  "cflags": ["-Os", "-mmcu=atmega328p"],
  "builtAt": "2024-03-25T12:00:00Z",
  "sourcesHash": "sha256:xyz789..."
}
```

## Consumer-side monomorphization

Дженерики инстанцируются у потребителя, а не в библиотеке.

**Библиотека компилируется один раз** в IR с «дырами» для типов:

```typescript
// @myco/collections/index.tsc
export function identity<T>(x: T): T {
    return x
}

export class Box<T> {
    constructor(public value: T) {}
}
```

**Кеш библиотеки** содержит IR, не конкретные типы:
```
~/.tsclang/cache/@myco/collections@1.0.0/
  source/
    index.tsc
  build/
    desktop/
      include/
        collections.h      // IR с type holes
      lib/
        libcollections.a   // скомпилированный IR
```

**При компиляции потребителя** — компилятор инстанцирует конкретные варианты:

```typescript
import { identity, Box } from "@myco/collections"

const a = identity(42)           // identity<i32>
const b = identity("hello")      // identity<string>
const box = new Box<User>({...}) // Box<User>
```

**При компиляции проекта:**

1. Загрузить IR библиотеки с type holes
2. Найти использования: `identity<i32>`, `identity<string>`, `Box<User>`
3. Инстанцировать код для каждого типа

Генерируемый C:
```c
// identity<i32>
int32_t  identity_i32(int32_t x)   { return x; }

// identity<string>
String*  identity_string(String* x) { return x; }

// Box<User>
typedef struct { User* value; } Box_User;
```

Плюсы:
- Библиотека компилируется один раз (не для каждого набора типов)
- Оптимальная производительность — inlining и специализация под конкретный тип
- В бинарь попадает только используемое

### Формат скомпилированной библиотеки

Скомпилированная TSClang-библиотека в кеше:

```
@myco/mylib@1.0.0/
  source/
    index.tsc
    src/
      utils.tsc
  build/
    desktop/
      include/
        mylib.h
      lib/
        libmylib.a
  metadata.json
```

**`metadata.json`** — описывает публичный API библиотеки для consumer-side monomorphization:

```json
{
  "exports": {
    "foo": { "layout_hash": "abc123" },
    "Bar": { "layout_hash": "def456", "size": 16 }
  },
  "generics": {
    "identity": { "params": ["T"] },
    "Map": { "params": ["K", "V"] }
  }
}
```

- `exports` — конкретные (не generic) экспорты с хешом layout (для инвалидации кеша при изменении структуры)
- `generics` — generic-экспорты с именами параметров — компилятор потребителя инстанцирует их под конкретные типы
