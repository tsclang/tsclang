# Конфигурация tsc.package.json

[← Вверх](./index.md) | [Следующий →](./cli.md) | [Предыдущий ←](./projects.md)

---

`tsc.package.json` — центральный конфигурационный файл проекта. Определяет тип проекта, зависимости, именованные профили сборки и параметры кодогенерации.

## Основные поля

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
  "main": "src/main.tsc",
  "dependencies": {
    "@tsc/sqlite3": "^1.0.0"
  },
  "devDependencies": {
    "@tsc/test": "^1.0.0"
  },
  "overrides": {
    "@myco/utils": "2.1.0"
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

### Обязательные поля

| Поле | Обязательно | Описание |
|------|-------------|----------|
| `name` | да | Имя пакета (`@scope/name` для библиотек) |
| `version` | да | Версия в формате semver |
| `type` | нет | `"executable"` (дефолт), `"library"`, `"platform"` |
| `main` | для exe | Entry point файл |

### Зависимости

| Поле | Описание |
|------|----------|
| `dependencies` | Зависимости пакета |
| `devDependencies` | Зависимости разработки, в продакшене не устанавливаются |
| `overrides` | Override версий при неразрешимых конфликтах |

```json
{
  "dependencies": {
    "@myco/mylib": "^1.0.0",
    "@scope/sdl2": ">=2.28.0"
  },
  "devDependencies": {
    "@tsc/test": "^1.0.0",
    "@tsc/lint": "^0.2.0"
  },
  "overrides": {
    "@myco/utils": "2.1.0"
  }
}
```

`overrides` применяется ко всем транзитивным зависимостям и имеет приоритет над всеми constraints. Использовать как последний resort — может сломать несовместимые версии.

### Метаданные (для реестра)

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

### Поведение поля type

| Значение | Поведение |
|----------|-----------|
| не указан | то же, что `"executable"` — компилятор ищет entry point |
| `"executable"` | компилятор ищет entry point, ошибка если не найден |
| `"library"` | entry point не ищется, генерируются `.h` + `.a`/`.so` |
| `"platform"` | платформенный профиль — только `declare platform {}` и `declare module` |

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
```

## Поля build конфига

Именованные конфигурации для разных платформ в поле `builds`.

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
| `emit` | Тип вывода: `"c"`, `"binary"`, `"hex"`, `"lib"` | `"binary"` для desktop |
| `outDir` | Директория вывода | `./build/<name>` |
| `main` | Entry point файл (override верхнего уровня) | наследует |
| `runtime` | Async runtime: `"libuv"`, `"io_uring"`, `"embedded"` | `"libuv"` для desktop |

### binaryMode: "small"

Режим для сильно ограниченных embedded-платформ (AVR Arduino: 32 КБ flash). Включает type erasure:

- `Array<T>` где T — pointer/complex type → единая реализация через `void*`
- Монорфизация только для примитивов (`Array<i32>`, `Array<u8>`)
- Enum string tables не генерируются, `.toString()` возвращает номер
- Трейдофф: меньше flash, но нет type-safe runtime проверок для erased типов

> Type erasure — оптимизация кодогенерации, не языковая фича. Borrow checker работает на AST до кодогенерации с полными типами.

### toolchain: варианты значений

| Значение | Поведение |
|----------|-----------|
| `"avr-gcc"` | ищет бинарь в PATH |
| `"avr-gcc@12.1"` | pinned версия — `~/.tsc/toolchains/avr-gcc@12.1/bin/`, затем PATH |
| `"/opt/avr/bin/avr-gcc"` | абсолютный путь |
| `"./tools/cc65/bin/cl65"` | путь относительно корня проекта |

### Резолюция toolchain

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

## platformSettings

Настройки кодогенерации поверх платформенного профиля. Задаются на верхнем уровне `tsc.package.json`.

```json
{
  "platformSettings": {
    "defaultAlignment": 16
  }
}
```

| Поле | Тип | Дефолт | Описание |
|------|-----|--------|----------|
| `defaultAlignment` | `number` (степень двойки) | платформенный дефолт | Глобальное выравнивание всех struct. Полезно для SIMD (`defaultAlignment: 16` → `__attribute__((aligned(16)))`). |

> `platformSettings.defaultAlignment` — решение разработчика проекта. `declare platform` описывает возможности железа (независимые от решения).

## devDependencies

Зависимости разработки — не попадают в публикуемый пакет, не устанавливаются с `--production`.

**Типичное содержимое:**
- Тест-фреймворки (`@tsc/test`)
- Lint-инструменты (`@tsc/lint`)
- Тайпинги для C-библиотек
- Build-инструменты

| Команда | Устанавливает |
|---------|---------------|
| `tsclang install` | `dependencies` + `devDependencies` |
| `tsclang install -p` / `--production` | только `dependencies` |
| `tsclang install -d` / `--dev` | только `devDependencies` |

## C-output

Зависимость C-wrapper генерирует CMake-конфигурацию у потребителя:

```cmake
# build/desktop/CMakeLists.txt — из @tsc/sqlite3
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_include_directories(myapp PRIVATE ${SQLITE3_INCLUDE_DIRS})
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot determine entry point` | Executable без поля `"main"` |
| `main file not found: src/main.tsc` | Файл из `"main"` не существует |
| `unknown target arch '6502': specify a platform profile` | Неизвестная архитектура без `profile` |
| `toolchain 'avr-gcc@12.1' not found` | Pinned toolchain не установлен |
| `version conflict for @myco/utils` | Несовместимые semver constraints |
| `@myco/async requires "heap" but platform has heap: false` | Несовместимость библиотеки и платформы |

## См. также

- [Типы проектов](./projects.md) — Executable, библиотека, C-wrapper, platform profile
- [CLI](./cli.md) — команды build, run, init
- [Пакетный менеджер](./packages.md) — install, lock-файл, overrides
- [Embedded-сборка](./embedded.md) — binaryMode, AVR, ARM
