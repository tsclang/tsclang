# CLI-команды

[← Вверх](./index.md) | [Следующий →](./packages.md) | [Предыдущий ←](./config.md)

---

Командная строка TSClang — основной интерфейс для создания, сборки и запуска проектов. Все команды доступны через глобальный CLI `tsclang`.

## Обзор

| Команда | Алиас | Описание |
|---------|-------|----------|
| `tsclang init` | — | Создать новый проект |
| `tsclang build` | `b` | Собрать проект |
| `tsclang run` | — | Собрать и запустить |
| `tsclang dev` | — | Режим отслеживания изменений |
| `tsclang install` | `i` | Установить зависимости |
| `tsclang update` | `u` | Обновить зависимости |
| `tsclang remove` | `r` | Удалить зависимость |
| `tsclang clean` | `c` | Удалить build артефакты |
| `tsclang lint` | `l` | Проверить форматирование |
| `tsclang migrate` | — | Миграция TypeScript → TSClang *(roadmap)* |
| `tsclang debug` | — | DAP-сервер *(roadmap)* |
| `tsclang lsp` | — | Language Server Protocol *(roadmap)* |

```bash
tsclang b                     # = tsclang build
tsclang i                     # = tsclang install
tsclang i @tsc/sqlite3 -d     # добавить dev-зависимость
tsclang u                     # = tsclang update
tsclang r @tsc/sqlite3        # = tsclang remove
tsclang l -f                  # форматировать
```

## tsclang build

Компиляция `.tsc` → C99 → бинарник через CMake.

```bash
tsclang build                 # собрать дефолтный build
tsclang build <name>          # собрать конкретный build
tsclang build hello.tsc       # одиночный файл → binary
```

### Флаги

| Флаг | Описание |
|------|----------|
| `--emit c` | Только генерация C-файлов |
| `--emit binary` | C + компиляция в бинарь |
| `--emit hex` | C + avr-gcc → `.hex` |
| `--emit lib` | Сгенерировать `.a`/`.so` |
| `--outDir <path>` | Переопределить outDir |
| `--target <target>` | Целевая платформа |
| `--profile <name>` | Platform profile |
| `--optimize <level>` | `O0`, `O1`, `O2`, `O3`, `Os` |
| `--clean` | Полная пересборка (очистить кеш) |

```bash
tsclang build --emit c        # только генерация C
tsclang build --emit binary   # C + компиляция в бинарь
tsclang build --emit hex      # C + avr-gcc → .hex
tsclang build --outDir ./dist # переопределить outDir
tsclang build --target avr    # собрать под AVR
tsclang build --optimize O2   # оптимизация уровня O2
tsclang build --clean         # полная пересборка
```

- Если build не указан — используется `"desktop"` или первый в списке
- Параметры CLI переопределяют настройки из `tsc.package.json`

## tsclang run

Сборка + запуск скомпилированного бинарника. Только для `emit: "binary"`.

```bash
tsclang run                   # собрать дефолтный build + запустить
tsclang run <name>            # собрать конкретный build + запустить
tsclang run -- --foo bar      # передать аргументы в бинарь
```

```
tsclang run
  │
  ├─ 1. tsclang build        ← компилирует .tsc → .c → бинарь
  └─ 2. exec <outDir>/myapp  ← запускает бинарь, stdout/stderr в терминал
```

- Если `emit` не `"binary"` — ошибка: `error: tsclang run requires emit: "binary"`
- Код выхода бинаря пробрасывается как код выхода `tsclang run`
- Аргументы после `--` передаются напрямую:

```bash
tsclang run -- --port 8080 --verbose
# запускает: ./build/desktop/myapp --port 8080 --verbose
```

## tsclang dev

Сборка в режиме Hot Reload / Hot Restart. Аргументы идентичны `tsclang run`.

```bash
tsclang dev                   # запустить в режиме отслеживания
tsclang dev <name>            # конкретный build
```

**Workflow:**
1. `tsclang dev` компилирует и запускает проект
2. Разработчик сохраняет файл в IDE
3. Обнаруживается изменение → инкрементальная пересборка → перезапуск

| Платформа | Поведение |
|-----------|----------|
| Desktop | kill старого процесса + запуск нового |
| Embedded | пересборка + автоматическая прошивка (avrdude/openocd) |

- File watcher: inotify (Linux), FSEvents (macOS), ReadDirectoryChangesW (Windows)
- Инкрементальная сборка — пересобирает только изменённые файлы

## tsclang init

Создание нового проекта с минимальной структурой.

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

Без аргумента — создаёт проект в текущей директории.

`tsclang init myapp` создаёт:

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

## tsclang lint

Проверка форматирования и стиля кода.

```bash
tsclang lint                  # проверить все файлы
tsclang lint -f               # форматировать (fix)
tsclang lint --check          # CI-режим: exit 1 если есть проблемы
```

## tsclang migrate *(roadmap)*

Инструмент для однократной миграции TypeScript-проекта в TSClang.

```bash
tsclang migrate [path]           # dry-run — показать что изменится
tsclang migrate [path] --fix     # применить изменения на месте
tsclang migrate [path] --check   # CI-режим: exit 1 если есть несовместимости
```

`path` — файл, директория или glob. По умолчанию — текущая директория.

**Автоматические трансформации:**

| Трансформация | Пример |
|--------------|--------|
| `undefined` → `null` | `x === undefined` → `x == null` |
| `throw "msg"` → `throw new Error("msg")` | везде |
| `export default X` → `export { X }` | везде |
| `x === y` → `x == y` | везде |
| `x !== y` → `x != y` | везде |
| Переименование `.ts` → `.tsc` | `user.ts` → `user.tsc` |

**Требует ручной правки** (выводится через `--check`):
- Классовое наследование (`extends`)
- `s[i]` строковая индексация
- `for (let x of arr)` — анализ типа элемента
- `number` → конкретный числовой тип
- Ownership-аннотации

**Вывод dry-run:**

```
tsclang migrate ./src

  src/user.ts → src/user.tsc
    line 12: throw "not found"  →  throw new Error("not found")
    line 34: x === undefined    →  x == null
    line 67: export default User  →  export { User }

  Manual review required (2 files):
    src/base.ts:15  — class Dog extends Animal (inheritance)
    src/parser.ts:8 — s[i] string indexing

  3 files to transform, 2 require manual review.
  Run with --fix to apply automatic changes.
```

## tsclang lsp *(roadmap)*

LSP-сервер для интеграции с IDE (VS Code, JetBrains, Neovim).

```bash
tsclang lsp              # запустить LSP-сервер (stdio transport)
tsclang lsp --port 7777  # TCP transport
```

| Функция | Описание |
|---------|----------|
| Completions | Автодополнение по типам, методам, импортам |
| Hover | Тип выражения, документация |
| Go-to-definition | Переход к объявлению |
| Find references | Поиск использований |
| Diagnostics | Ошибки и предупреждения в реальном времени |
| Rename | Переименование символов |
| Format | Форматирование через `tsclang lint --fix` |

**Error recovery:** LSP-режим продолжает работу при синтаксических ошибках — парсер вставляет `ErrorNode` в AST и синхронизируется на ближайшей границе (`}`, `;`, `class`, `function`).

## tsclang clean

Удаление build-артефактов:

```bash
tsclang clean                 # удалить outDir
tsclang clean --all           # удалить всё: outDir + кеш
```

## C-output

Пример полной сборки `tsclang build`:

```
build/desktop/
  c/
    main.c          ← сгенерировано из src/main.tsc
    user.c          ← сгенерировано из src/user.tsc
    user.h          ← forward declarations
  CMakeLists.txt    ← сгенерировано автоматически
  myapp             ← скомпилированный бинарь
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `tsclang run requires emit: "binary"` | `run` с `emit: "hex"` или `emit: "c"` |
| `cannot determine entry point` | Executable без `"main"` |
| `build 'avr' not found in builds` | Указан несуществующий build |
| `toolchain 'avr-gcc' not found in PATH` | Компилятор не установлен |
| `main file not found` | Файл из `"main"` не существует |

## См. также

- [Конфигурация](./config.md) — поля `tsc.package.json`, builds
- [Пакетный менеджер](./packages.md) — install, update, remove
- [Embedded-сборка](./embedded.md) — AVR, ARM, ретро-платформы
- [CMake](./cmake.md) — CMakeLists.txt, профили
