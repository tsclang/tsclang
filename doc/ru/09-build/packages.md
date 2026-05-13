# Пакетный менеджер

[← Вверх](./index.md) | [Следующий →](./embedded.md) | [Предыдущий ←](./cli.md)

---

Пакетный менеджер TSClang управляет зависимостями: установка, обновление, публикация пакетов. Использует flat-дерево зависимостей (как Cargo/Go) и lock-файл для воспроизводимости.

## tsclang install

```bash
tsclang install                     # установить все зависимости
tsclang install @tsc/sqlite3        # добавить в dependencies
tsclang install @tsc/test -d        # добавить в devDependencies
tsclang install @tsc/a @tsc/b -d    # добавить несколько сразу
tsclang install @tsc/sqlite3@^1.2.0 # с указанием версии
```

### Флаги

| Флаг | Сокращение | Описание |
|------|------------|----------|
| `--production` | `-p` | Установить только `dependencies`, без `devDependencies` |
| `--dev` | `-d` | Установить только `devDependencies` |
| `--force` | `-f` | Игнорировать несовместимости зависимостей |

### install vs update

| | `tsclang install` | `tsclang update` |
|---|---|---|
| Lock-файл существует | Использует точные версии из lock | Игнорирует lock, ищет новые версии |
| Lock-файл отсутствует | Резолвит по constraints, создаёт lock | То же |
| Результат | Воспроизводимая установка | Обновлённый lock-файл |

## tsclang update

```bash
tsclang update                          # обновить всё что можно
tsclang update <dep>                    # обновить конкретную зависимость
tsclang update @scope/sdl2              # обновить только sdl2
tsclang update @scope/sdl2 @scope/json  # обновить несколько
```

| Флаг | Сокращение | Описание |
|------|------------|----------|
| `--force` | `-f` | Игнорировать несовместимости |

`tsclang update` автоматически запускает `tsclang install` после обновления lock-файла.

## tsclang remove

```bash
tsclang remove                      # удалить все зависимости
tsclang remove @tsc/sqlite3         # удалить конкретную
tsclang remove @tsc/a @tsc/b        # удалить несколько
tsclang remove @tsc/sqlite3 -f      # --force, без подтверждения
```

Удаление требует подтверждения:

```
? Remove @tsc/sqlite3 from dependencies? (Y/n)
```

Флаг `--force` / `-f` пропускает подтверждение.

## tsclang publish

Публикация пакета в централизованный реестр `registry.tsclang.org`.

```bash
tsclang publish
```

### Что проверяется при публикации C-wrapper

1. `name` в формате `@scope/package`
2. `version` в формате semver
3. `index.d.tsc` существует
4. Все `declare opaque type` имеют `destructor`
5. Все `declare function` используют корректные типы

### Что публикуется

```
@tsc/sqlite3@1.0.0/
  tsc.package.json
  index.d.tsc
```

Только два файла — никакого C-кода. Поле `files` ограничивает список файлов; `devDependencies` исключаются автоматически.

### Публикация platform profile

```bash
tsclang publish
```

```
@nes/platform@1.0.0/
  tsc.package.json
  index.d.tsc
  toolchain.cmake
```

## tsclang search

```bash
tsclang search sqlite        # найти пакеты по ключевому слову
tsclang search @tsc/         # показать все пакеты scope
```

## Flat dependency tree

TSClang использует единый flat-список зависимостей — одна версия на проект, без вложенных `node_modules`:

```
❌ node_modules style (nested):
  myapp/node_modules/@myco/a/node_modules/@myco/utils@1.0.0
  myapp/node_modules/@myco/b/node_modules/@myco/utils@2.0.0

✅ Flat style (одна версия):
  @myco/utils@2.1.0   ← максимальная версия, удовлетворяющая всем constraints
```

**Алгоритм резолюции:**
1. Собрать все constraints на пакет из всего дерева
2. Найти максимальную версию, удовлетворяющую всем
3. Если невозможно — ошибка:

```
error: version conflict for @myco/utils
  @myco/db@1.0.0 requires @myco/utils ^2.0.0
  @myco/http@1.0.0 requires @myco/utils ^1.0.0
  hint: add "overrides" to tsc.package.json to force a version
```

## Версионирование

**Semver строки:** `^1.0.0`, `~1.2.0`, `>=1.0.0`, `1.0.0`

### Резолюция зависимостей

1. **Система** — `pkg-config` проверяет наличие и версию
2. **Реестр** (`registry.tsclang.org`) — скачивает нужную версию

```
error: @scope/sdl2 >=2.28.0 not found
hint: install it manually:
  apt install libsdl2-dev
  brew install sdl2
```

Версия из `pkg-config` записывается в lock-файл. При несовпадении — ошибка:

```
error: lock file requires sdl2 2.28.5, system has 2.26.0
hint: run `tsclang update` to re-resolve
```

## Lock-файл

`tsc.package.lock` фиксирует точные версии и хеши:

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

Lock-файл коммитится в репозиторий для воспроизводимости.

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
```

Одна версия библиотеки — отдельные сборки под каждый таргет.

### Инвалидация кеша

| Условие | Действие |
|---------|----------|
| Исходник изменён | Перекомпилировать |
| `tscVersion` компилятора изменился | Перекомпилировать всё |
| `target` / `mcu` изменился | Перекомпилировать под новый таргет |
| `cflags` изменены | Перекомпилировать |

## Workspaces (monorepo)

Множество пакетов в одном репозитории:

```json
{
  "workspaces": [
    "packages/*"
  ]
}
```

```
my-monorepo/
  tsc.package.json          ← root: { "workspaces": ["packages/*"] }
  packages/
    core/
      tsc.package.json      ← { "name": "@myco/core" }
    cli/
      tsc.package.json      ← { "name": "@myco/cli", "dependencies": { "@myco/core": "^1.0.0" } }
```

`tsclang install` в корне устанавливает зависимости всех пакетов и связывает локальные workspace-пакеты через symlink.

## declare library

Библиотека может декларировать требования к платформе — компилятор проверяет совместимость при сборке.

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

### Проверка совместимости

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

## C-output

Зависимости C-wrapper'а генерируют инструкции линковки в CMakeLists.txt:

```cmake
# из @tsc/sqlite3
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `dependency conflict` | Несовместимые semver constraints |
| `version conflict for @myco/utils` | Два пакета требуют несовместимые версии |
| `lock file requires sdl2 2.28.5, system has 2.26.0` | Версия в системе не совпадает с lock |
| `@tsc/sqlite3 not found` | Пакет не найден в реестре и системе |
| `@myco/async requires "heap" but platform has heap: false` | Библиотека несовместима с платформой |

## См. также

- [Конфигурация](./config.md) — dependencies, devDependencies, overrides
- [Типы проектов](./projects.md) — C-wrapper, platform profile
- [CLI](./cli.md) — команды install, update, remove
- [Модули: .d.tsc](../08-modules/d-tsc.md) — declare library, declare link
