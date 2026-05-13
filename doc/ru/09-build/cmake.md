# CMake: генерация и настройка

[← Вверх](./index.md) | [Предыдущий ←](./embedded.md)

---

TSClang генерирует `CMakeLists.txt` автоматически — ручное написание не требуется. Файл создаётся в `outDir` и включает все необходимые настройки: компилятор, флаги оптимизации, пути к заголовкам, линковку зависимостей.

## Структура outDir

```
build/desktop/
  c/              ← сгенерированные .c и .h
  CMakeLists.txt  ← сгенерировано автоматически
  myapp           ← бинарь (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## Автоматическая генерация

### Desktop

```cmake
cmake_minimum_required(VERSION 3.16)
project(myapp C)

set(CMAKE_C_STANDARD 99)

add_executable(myapp
    c/main.c
    c/user.c
)

target_include_directories(myapp PRIVATE c/)

# runtime headers
target_include_directories(myapp PRIVATE ${TSCLANG_RUNTIME}/std/)

# dependencies (from @tsc/sqlite3)
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_include_directories(myapp PRIVATE ${SQLITE3_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

### Embedded (AVR)

```cmake
cmake_minimum_required(VERSION 3.16)
project(myapp C)

set(CMAKE_C_COMPILER avr-gcc)
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR avr)

add_compile_options(-mmcu=atmega328p -Os)

add_executable(myapp
    c/main.c
)

target_include_directories(myapp PRIVATE c/)
target_include_directories(BEFORE myapp PRIVATE ${TSCLANG_RUNTIME}/platforms/avr)
```

### Retro (NES + cc65)

```cmake
cmake_minimum_required(VERSION 3.16)
project(mygame C)

set(CMAKE_C_COMPILER cc65)
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR 6502)
set(CMAKE_TOOLCHAIN_FILE ".../tsc_packages/@nes/platform/toolchain.cmake")

add_compile_options(-t nes)

include_directories(BEFORE ".../tsc_packages/@nes/platform/include")

add_executable(mygame ${SOURCES})
```

## Toolchain file

Для стандартных компиляторов (gcc, clang, avr-gcc) CMake знает их из коробки. Нестандартные (cc65, z88dk, djgpp) требуют CMake toolchain file.

### Резолюция toolchain

```
toolchain поле в конфиге
    ↓ нет?
declare platform { toolchain } в profile
    ↓ нет?
дефолт по arch:
    x86-64  → clang, fallback gcc
    arm     → arm-none-eabi-gcc
    avr     → avr-gcc
    wasm32  → clang (wasm target)
    другой  → ошибка: "specify toolchain or profile"
```

### Соглашение путей

| Поле | Значение | Откуда |
|------|----------|--------|
| `toolchainFile` | `"toolchain.cmake"` | внутри profile-пакета |
| `toolchainFile` | `"./my-toolchain.cmake"` | локальный путь проекта |
| `include` | `"include"` | внутри profile-пакета |
| `include` | `"./platform/include"` | локальный путь проекта |

`./` = локальный путь относительно корня проекта, без `./` = путь внутри пакета.

### Пример toolchain.cmake (cc65)

```cmake
# @nes/platform/toolchain.cmake
set(CMAKE_C_COMPILER cc65)
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR 6502)

# platform-specific flags
add_compile_options(-t nes -Cl)

# include platform headers before runtime
include_directories(BEFORE "${CMAKE_CURRENT_SOURCE_DIR}/include")
```

## Оптимизация

Уровни оптимизации задаются через `optimize` в `builds`:

| Значение | Флаг C | Когда использовать |
|----------|--------|--------------------|
| `O0` | `-O0` | Отладка, без оптимизации |
| `O1` | `-O1` | Базовая оптимизация |
| `O2` | `-O2` | Release, максимальная скорость |
| `O3` | `-O3` | Агрессивная оптимизация (может увеличить размер) |
| `Os` | `-Os` | Оптимизация по размеру — критично для embedded |

```json
{
  "builds": {
    "debug": {
      "optimize": "O0",
      "outDir": "build/debug"
    },
    "release": {
      "optimize": "O2",
      "outDir": "build/release"
    },
    "avr": {
      "optimize": "Os",
      "target": "avr",
      "mcu": "atmega328p"
    }
  }
}
```

### Параметры компиляции (справка)

| Флаг | Назначение |
|------|-----------|
| `-Os` | Оптимизация по размеру — критично для `avr`, `nes`, `gb` |
| `-fPIC` | Позиционно-независимый код — для `linux`/`android` библиотек |
| `-nostdlib` | Исключить стандартные библиотеки — почти всегда нужно для retro и embedded |

## Platform header resolution

Стандартные библиотеки имеют два уровня реализации:

```
src/runtime/
  std/                        ← desktop stubs (no-op, fallback)
    hal.h, hal_types.h
  platforms/
    avr/
      std/
        hal.h                 ← реальный AVR: DDRx/PORTx, TWI, SPI
    arm/
      std/
        hal.h                 ← ARM CMSIS вызовы
    esp32/
      std/
        hal.h                 ← ESP-IDF: gpio_set_direction, ...
```

Toolchain file добавляет платформенный путь **перед** стандартным:

```cmake
include_directories(BEFORE "${TSCLANG_RUNTIME}/platforms/avr")
```

Codegen не трогается — всегда эмитирует `#include "std/hal.h"`. Логика выбора реализации полностью в build system.

### Добавить новую платформу

1. Создать `src/runtime/platforms/<name>/std/` с нужными заголовками
2. Добавить `cmake/toolchain-<name>.cmake` с `include_directories(BEFORE ...)`
3. Опционально — platform profile `.d.tsc` для type-checking

## C-wrapper и CMakeLists.txt

`declare link` в C-wrapper генерирует инструкции линковки у потребителя:

```typescript
declare link {
    libs: ["sqlite3"];
    pkg_config: "sqlite3";
}
```

```cmake
# генерируется в CMakeLists.txt потребителя
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_include_directories(myapp PRIVATE ${SQLITE3_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

## Профили debug / release

```bash
tsclang build debug      # optimize: O0, debug symbols
tsclang build release    # optimize: O2
```

CLI-флаг `--optimize` переопределяет конфиг:

```bash
tsclang build --optimize Os
tsclang build --clean    # полная пересборка
```

## C-output

Полный пример CMakeLists.txt для desktop-проекта с зависимостями:

```cmake
cmake_minimum_required(VERSION 3.16)
project(myapp C)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wall -Wextra")

add_executable(myapp
    c/main.c
    c/database.c
    c/user.c
)

target_include_directories(myapp PRIVATE c/)
target_include_directories(myapp PRIVATE ${TSCLANG_RUNTIME}/std/)

# @tsc/sqlite3
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_include_directories(myapp PRIVATE ${SQLITE3_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})

# @tsc/openssl (system link)
pkg_check_modules(OPENSSL REQUIRED openssl)
target_include_directories(myapp PRIVATE ${OPENSSL_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${OPENSSL_LIBRARIES})
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `toolchain 'avr-gcc' not found in PATH` | Компилятор не установлен |
| `toolchain 'avr-gcc@12.1' not found` | Pinned toolchain не найден |
| `unknown target arch '6502': specify a platform profile` | Неизвестная архитектура |
| `pkg-config: sqlite3 not found` | Системная библиотека не установлена |
| `specify toolchain or profile` | Неизвестный arch без toolchain и profile |

## См. также

- [Конфигурация](./config.md) — builds, optimize, toolchain, toolchainFile
- [Embedded-сборка](./embedded.md) — AVR, ARM, ретро-платформы
- [Типы проектов](./projects.md) — C-wrapper link-конфигурация
- [Модули: .d.tsc](../08-modules/d-tsc.md) — declare link, declare platform
