# План подготовки TSClang к релизу v1.0

## Контекст

Релиз v1.0 — это **не MVP**, это production-ready продукт:
- Полный инструментарий (CLI, LSP, formatter, pm)
- Без багов, с покрытием всех инвариантов
- Ключевая система отладки — test-engine (заменяет статические тесты)
- Строгое соблюдение принципов П1-П6

---

## 1. Текущее состояние проекта

### 1.1 Архитектура (полная)

```
lexer.ts (токенизация, 40+ типов токенов)
  → parser.ts (рекурсивный спуск + Pratt parser, error recovery)
  → optimizer.ts (4 фазы: constant folding → const propagation → dead const/branch elimination)
  → codegen.ts (Context ~1710 строк, 185 типизированных полей)
    ├── top-level/ (class, decorators, dispatch, func, index, program, types-alias)
    ├── stmt/ (control-flow, destruct, index, match, vardecl)
    ├── expr/ (assign, dispatch, index, literals, operators)
    ├── calls/ (builtin-helpers, builtin, call-dispatch, concurrency, console, conversion, index, method-dispatch, stdlib)
    ├── types/ (decimal, helpers, index, infer, resolve)
    ├── async/ (async-emit, async-stmt, generator, helpers, index, scan)
    ├── misc/ (5 файлов)
    ├── generics.ts (мономорфизация)
    ├── borrow-tracker.ts (трекинг заимствований)
    ├── scope-manager.ts (области видимости)
    └── output-buffer.ts (буфер вывода)
  → runtime.h (single-header C-библиотека)
  → output.c
```

**Пакеты:** 8 пакетов в monorepo (pnpm workspaces)
- `@tslang/ast` — чистые типы AST (524 строки)
- `@tslang/shared` — константы и типы платформ (12 профилей)
- `@tslang/compiler` — ядро компилятора
- `@tslang/cli` — CLI, LSP, форматтер
- `@tslang/pm` — package manager (mock)
- `@tslang/tests` — 1829 статических тестов
- `@tslang/test-engine` — динамический генератор тестов
- `@tslang/spec` — спецификация (17 разделов)

### 1.2 Критические проблемы (блокируют релиз)

| # | Проблема | Где | Влияние |
|---|----------|-----|---------|
| C1 | `require("fs")` в ESM-модуле | test-engine/src/engine.ts | **Не компилируется** в Node.js ESM |
| C2 | MSVC-бэкенд не настраивает vcvarsall.bat | test-engine/src/compilers/msvc.ts | **Не работает** на Windows с MSVC |
| C3 | LSP — regex-based, 0% LSP spec | cli/src/lsp/server.ts | Не production-ready |
| C4 | Package manager — полностью mock | pm/src/ | Нет install/publish/resolve |
| C5 | `SymbolInfo` имеет `[key: string]: any` | ast/src/symbol.ts | Обходит систему типов |
| C6 | `Token.type: string` (не union) | ast/src/token.ts | Нет статической проверки |
| C7 | `Param` дублирует `defaultVal` и `default` | ast/src/ast.ts | Неясная семантика |
| C8 | `build-cmake.ts` баг: `\${LIBUV_LIBRARIES}` | cli/src/cli/cmake.ts | Сломанный CMake |
| C9 | `CMD_HELP` не покрывает все команды | cli/src/index.ts | Нет help для 10+ команд |
| C10 | Нет async-тестов в test-engine | test-engine/src/engine.ts | Падение тестов с `await` |

### 1.3 Средние проблемы

| # | Проблема | Где |
|---|----------|-----|
| M1 | codegen.ts — 1710 строк (god object) | compiler/src/compiler/codegen.ts |
| M2 | compile.ts — `[key: string]: unknown` в CompileOptions | compiler/src/compiler/compile.ts |
| M3 | formatter.ts — все параметры `any` | cli/src/formatter.ts |
| M4 | formatter не обрабатывает комментарии/escape | cli/src/formatter.ts |
| M5 | build.ts — spawnSync без таймаута | cli/src/cli/commands/build.ts |
| M6 | watch mode — debounceTimer не очищается | cli/src/cli/commands/build.ts |
| M7 | Нет CI-конфига для Windows | корень проекта |
| M8 | semver без pre-release поддержки | pm/src/semver.ts |
| M9 | `import.meta.dirname` — не работает на Node < 20.11 | test-engine/src/engine.ts |
| M10 | `shell: true` — уязвимость к инъекциям | test-engine/src/compilers/*.ts |
| M11 | `>>>` всегда кастует к int32_t/uint32_t | compiler/src/compiler/codegen/expr/operators.ts | Неэффективно и некорректно для ретро-платформ (NES, Spectrum с i8/u8) |

---

## 2. План закрытия критических проблем

### Этап 2.1: Исправление test-engine (C1, C2, C10)

**Цель:** test-engine должен компилироваться и работать на всех платформах.

#### Задача 2.1.1: Исправить `require("fs")` в ESM
- **Файл:** `test-engine/src/engine.ts`
- **Действие:** Заменить `require("fs")` на `import { readFileSync } from 'fs'`
- **Проверка:** `tsc --noEmit` проходит, тесты компилируются

#### Задача 2.1.2: Исправить MSVC-бэкенд
- **Файл:** `test-engine/src/compilers/msvc.ts`
- **Действие:** Добавить вызов `vcvarsall.bat` в `isAvailable()` и кэшировать environment
- **Проверка:** Компиляция через `cl.exe` работает на Windows

#### Задача 2.1.3: Добавить async-тесты
- **Файл:** `test-engine/src/engine.ts`
- **Действие:** Поддержка async callback в `test()` — `test("name", async () => { ... })`
- **Проверка:** `test("async", async () => { await delay(10); expect(1).toBe(1); })` проходит

#### Задача 2.1.4: Заменить `import.meta.dirname` на совместимый вариант
- **Файл:** `test-engine/src/engine.ts`
- **Действие:** Использовать `import { fileURLToPath } from 'url'` + `dirname(fileURLToPath(import.meta.url))`
- **Проверка:** Работает на Node.js 18+

### Этап 2.2: Исправление AST (C5, C6, C7)

**Цель:** Полная типизация AST без `any`.

#### Задача 2.2.1: Убрать `[key: string]: any` из SymbolInfo
- **Файл:** `ast/src/symbol.ts`
- **Действие:** Заменить индексный сигнатур на конкретные поля. Выделить подтипы: `FunctionSymbol`, `VariableSymbol`, `ClassSymbol`
- **Проверка:** `tsc --noEmit` проходит, zero `any` в ast/

#### Задача 2.2.2: Типизировать `Token.type`
- **Файл:** `ast/src/token.ts`
- **Действие:** Заменить `type: string` на строковый union всех возможных типов токенов
- **Проверка:** Switch на `token.type` не требует `default`

#### Задача 2.2.3: Убрать дубликат `defaultVal` в Param
- **Файл:** `ast/src/ast.ts`
- **Действие:** Удалить `defaultVal`, оставить только `default`
- **Проверка:** Все места использования обновлены

### Этап 2.3: Исправление CLI (C3, C4, C8, C9)

**Цель:** CLI работает корректно, LSP имеет базовый функционал.

#### Задача 2.3.1: Исправить баг в cmake.ts
- **Файл:** `cli/src/cli/cmake.ts`
- **Действие:** Заменить `\${LIBUV_LIBRARIES}` на `${LIBUV_LIBRARIES}`
- **Проверка:** CMakeLists.txt генерируется корректно

#### Задача 2.3.2: Добавить help для всех команд
- **Файл:** `cli/src/index.ts`
- **Действие:** Добавить `CMD_HELP` entries для build-cmake, validate-config, install, update, search, publish, lsp, test, emit-dts, debug
- **Проверка:** `tsclang lsp --help` показывает help

#### Задача 2.3.3: Базовый LSP — интегрировать с парсером
- **Файл:** `cli/src/lsp/server.ts`
- **Действие:**
  - Заменить regex-based `buildSymbols` на AST-based парсинг
  - Добавить `textDocument/hover` с информацией из diagnostics
  - Добавить `textDocument/documentSymbol`
- **Проверка:** Hover на функции показывает signature, documentSymbol показывает все символы файла

#### Задача 2.3.4: Package manager — функциональный skeleton
- **Файл:** `pm/src/registry.ts`
- **Действие:**
  - Заменить `MOCK_REGISTRY` на HTTP-клиент к npm-совместимому API
  - Добавить `install()`, `publish()`, `resolveDeps()`
  - Реализовать basic semver с pre-release
- **Проверка:** `tsclang install <pkg>` скачивает пакет, `tsclang publish` публикует

---

## 3. План улучшения кода

### 3.1 Рефакторинг codegen.ts (M1)

**Цель:** Уменьшить god object, улучшить тестируемость.

#### Задача 3.1.1: Вынести State tracking в отдельный класс
- **Файл:** `compiler/src/compiler/codegen/state-manager.ts` (новый)
- **Действие:** Перенести все `_emitted*`, `_pending*`, `_count*` поля из Context
- **Проверка:** Context теряет ~40 полей, тесты проходят

#### Задача 3.1.2: Вынести Call dispatch в отдельный класс
- **Файл:** `compiler/src/compiler/codegen/call-dispatcher.ts` (новый)
- **Действие:** Перенести все `_dispatch*` методы из Context
- **Проверка:** Все `_dispatchBuiltin`, `_dispatchStdIo`, `_dispatchStdFs` работают через dispatcher

#### Задача 3.1.3: Вынести Async machinery в отдельный класс
- **Файл:** `compiler/src/compiler/codegen/async-engine.ts` (новый)
- **Действие:** Перенести `_asyncFuncs`, `_generatorFuncs`, `_staticTasks` и все `_emitAsync*` методы
- **Риски:** promoted vars, poll functions, `@static async function*`, borrow across await — места где легко сломать ownership. Написать integration-тесты для async + ownership edge cases.
- **Проверка:** Async код генерируется корректно для desktop и embedded

### 3.2 Улучшение типизации (M2, M3)

#### Задача 3.2.1: Убрать `[key: string]: unknown` из CompileOptions
- **Файл:** `compiler/src/compiler/compile.ts`
- **Действие:** Добавить конкретные поля для всех опций
- **Проверка:** `tsc --noEmit` проходит

#### Задача 3.2.2: Типизировать formatter.ts
- **Файл:** `cli/src/formatter.ts`
- **Действие:** Заменить все `any` на конкретные типы
- **Проверка:** Форматирование работает для всех случаев

### 3.4 Границы пакетов — вынос runtime и profiles (долг)

**Цель:** Чистая архитектура — runtime и profiles как отдельные пакеты, не внутри compiler.

#### Задача 3.4.1: Создать пакет `@tslang/runtime`
- **Файл:** `packages/runtime/package.json` (новый пакет)
- **Действие:**
  - Перенести `compiler/src/runtime/runtime.h` и все `runtime_*.h` в `packages/runtime/`
  - Перенести `compiler/src/runtime/std/` в `packages/runtime/std/`
  - Перенести `compiler/src/runtime/avr/` и `compiler/src/runtime/platforms/`
  - Создать barrel export для путей к header-файлам
  - Обновить все import paths в compiler, test-engine, cli
- **Проверка:** `pnpm build` проходит, runtime.h подключается корректно

#### Задача 3.4.2: Создать пакет `@tslang/profiles`
- **Файл:** `packages/profiles/package.json` (новый пакет)
- **Действие:**
  - Перенести `compiler/src/profiles/` в `packages/profiles/`
  - Перенести все 12 профилей (desktop, avr, avr-heap, avr-coop, arm, nes, spectrum, genesis, ps2, dos, wasm, wasm32)
  - Создать barrel export для `parsePlatformDecl` и capabilities
  - Обновить все import paths в compiler, test-engine, cli
- **Проверка:** `pnpm build` проходит, профили загружаются корректно

#### Задача 3.4.3: Обновить build chain и pnpm-workspace
- **Файл:** `pnpm-workspace.yaml`, `tsconfig.build.json`
- **Действие:**
  - Добавить `packages/runtime` и `packages/profiles` в workspace
  - Настроить `tsconfig.json` для новых пакетов
  - Обновить зависимости: `compiler` → `@tslang/runtime`, `@tslang/profiles`
  - Обновить `pnpm-lock.yaml`
- **Проверка:** `pnpm build` собирает все 10 пакетов

### 3.3 Безопасность и надёжность (M5, M6, M10)

#### Задача 3.3.1: Добавить таймауты к spawnSync
- **Файл:** `cli/src/cli/commands/build.ts`, `cli/src/cli/commands/run.ts`
- **Действие:** Добавить `timeout: 30000` ко всем `spawnSync` вызовам
- **Проверка:** gcc/cl.exe не зависает навсегда

#### Задача 3.3.2: Исправить debounceTimer в watch mode
- **Файл:** `cli/src/cli/commands/build.ts`
- **Действие:** Вызывать `clearTimeout(debounceTimer)` при каждом событии
- **Проверка:** Быстрые сохранения не вызывают двойную компиляцию

#### Задача 3.3.3: Убрать `shell: true` из test-engine
- **Файл:** `test-engine/src/compilers/*.ts`
- **Действие:** Использовать массив аргументов вместо shell commands
- **Проверка:** Нет уязвимостей к командной инъекции

### 3.5 Bitwise operators (M11)

#### Задача 3.5.1: Исправить `>>>` для типов < 32 бит
- **Файл:** `compiler/src/compiler/codegen/expr/operators.ts`
- **Проблема:** `>>>` всегда кастует к `(int32_t)((uint32_t)l >> r)`, независимо от типа операнда
- **Действие:** Каст должен соответствовать типу операнда:
  - `u8 >>> u8` → `(uint8_t)((uint8_t)l >> r)`
  - `i8 >>> i8` → `(int8_t)((uint8_t)l >> r)`
  - `u32 >>> u32` → `(uint32_t)l >> r`
- **Проверка:** Тесты для u8, i8, u16, i16, u32, i32 | `>>>` на ретро-платформах (NES, Spectrum) | `>>>` на desktop

---

## 4. План тестирования

### 4.1 Покрытие тестами

**Текущее состояние:** 1829 тестов, 16 секций.

| Секция | Тестов | Статус |
|--------|--------|--------|
| 02-syntax | 127 | ✅ |
| 03-types | 464 | ✅ |
| 04-ownership | 116 | ✅ |
| 05-control-flow | 52 | ✅ |
| 06-functions | 66 | ✅ |
| 07-classes | 44 | ✅ |
| 08-collections | 236 | ✅ |
| 09-errors | 47 | ✅ |
| 10-async | 82 | ✅ |
| 11-concurrency | 44 | ✅ |
| 12-modules | 26 | ⚠️ мало |
| 13-build | 168 | ✅ |
| 14-stdlib | 302 | ✅ |
| 15-decorators | 22 | ⚠️ мало |
| 16-tooling | 44 | ✅ |
| book | 4 | ✅ |

#### Задача 4.1.1: Расширить тесты для 12-modules (26 → 60)
- Добавить edge cases: circular imports, namespace imports, export-from re-exports
- Добавить тесты для path aliases
- Добавить тесты для package imports

#### Задача 4.1.2: Расширить тесты для 15-decorators (22 → 50)
- Добавить тесты для before/after hooks
- Добавить тесты для decorator factories
- Добавить тесты для decorator composition

#### Задача 4.1.3: Добавить кроссплатформенные тесты
- Для каждой секции добавить `meta.json` с `profile: "avr"`, `profile: "nes"`, `profile: "wasm"`
- Проверить, что тесты проходят на всех платформах

### 4.2 Test-engine как замена статическим тестам

**Цель:** test-engine должен генерировать тесты для всех инвариантов.

#### Задача 4.2.1: Расширить матрицу типов
- Добавить тесты для: nested generics, tuple destructuring, method overloading
- Добавить тесты для: strict mode rules, platform restrictions

#### Задача 4.2.2: Добавить fuzz-тестирование
- Генерировать случайный TSC-код и проверять, что компилятор не падает
- Проверять, что output.c компилируется в C

#### Задача 4.2.3: Добавить performance-тесты
- Измерять время компиляции для больших файлов (1000+ строк)
- Измерять размер выходного .c файла
- Установить baseline и алерты

---

## 5. План документирования

### 5.1 Обновление существующей документации

#### Задача 5.1.1: Обновить CONTEXT.md
- **Статус:** Последнее обновление 2026-07-11 (2 месяца назад)
- **Действие:** Добавить разделы про:
  - Новые diagnostic codes (E415, E416, E417, E418, E419)
  - Decimal fixed-point (128 тестов)
  - Strict mode (12 правил)
  - Platform profiles (12 профилей)
  - Gotchas (перенести из CONTEXT.md в spec)

#### Задача 5.1.2: Добавить README.md в каждый пакет
- `ast/README.md` — описание AST-нод
- `shared/README.md` — описание констант и типов
- `compiler/README.md` — описание pipeline
- `cli/README.md` — описание CLI команд
- `test-engine/README.md` — описание тестового движка
- `pm/README.md` — описание package manager

#### Задача 5.1.3: Добавить CHANGELOG.md
- Использовать changesets (уже установлен `@changesets/cli`)
- Настроить автоматическую генерацию при PR

### 5.2 Спецификация

#### Задача 5.2.1: Проверить соответствие spec реализации
- Для каждого раздела spec создать чеклист: что документировано, что реализовано
- Добавить раздел "Implementation Status" в INDEX.md

#### Задача 5.2.2: Добавить раздел "Migration from TypeScript"
- Описание отличий от TypeScript
- Checklist для миграции
- Примеры кода до/после

---

## 6. План кроссплатформенной проверки

### 6.1 Платформы для тестирования

| Платформа | Компилятор | Особенности |
|-----------|------------|-------------|
| desktop (Linux) | gcc/clang | Полный stdlib, libuv async |
| desktop (macOS) | clang | Полный stdlib |
| desktop (Windows) | MSVC / MinGW | Специфичная логика в runner.ts |
| AVR | avr-gcc | No heap, cooperative scheduler |
| NES | cc65 | 6502, 2KB RAM |
| WASM | emcc | Emscripten |

### 6.2 План проверки

#### Задача 6.2.1: Добавить CI-конфиг
- **Файл:** `.github/workflows/ci.yml` (новый)
- **Действие:** Настроить CI для:
  - Linux: `pnpm build && pnpm test 02-syntax..16-tooling`
  - macOS: `pnpm build && pnpm test 02-syntax..08-collections`
  - Windows: `pnpm build && pnpm test --no-gcc 02-syntax..16-tooling`
  - AVR: `pnpm test 04-ownership --profile avr`

#### Задача 6.2.2: Добавить Windows-тесты
- **Файл:** `test-engine/src/compilers/msvc.test.ts` (новый)
- **Действие:** Тестирование MSVC-бэкенда
- **Проверка:** Компиляция через `cl.exe` на Windows

#### Задача 6.2.3: Добавить embedded-тесты
- **Файл:** `test-engine/src/compilers/avr-gcc.test.ts` (новый)
- **Действие:** Тестирование AVR-бэкенда через simavr
- **Проверка:** Симуляция на AVR проходит корректно

---

## 7. Milestones и приоритеты

### Milestone 1: Foundation (2 недели)
- [ ] Исправить test-engine (C1, C2, C10)
- [ ] Исправить AST типизацию (C5, C6, C7)
- [ ] Исправить CLI баги (C8, C9)
- [ ] Обновить CONTEXT.md

### Milestone 2: Tooling (2 недели)
- [ ] Базовый LSP (C3)
- [ ] Функциональный pm (C4)
- [ ] Расширить тесты (12-modules, 15-decorators)
- [ ] Добавить CI-конфиг

### Milestone 3: Code Quality (2 недели)
- [ ] Рефакторинг codegen.ts (M1)
- [ ] Улучшение типизации (M2, M3)
- [ ] Безопасность (M5, M6, M10)
- [ ] Убрать все TODO/FIXME

### Milestone 4: Testing & Docs (2 недели)
- [ ] Кроссплатформенные тесты
- [ ] Fuzz-тестирование
- [ ] README.md для каждого пакета
- [ ] CHANGELOG.md
- [ ] Обновить spec

### Milestone 5: Release Candidate (1 неделя)
- [ ] Полный прогон всех тестов на всех платформах
- [ ] Финальная проверка документации
- [ ] Release notes
- [ ] tag v1.0.0

---

## 8. Критерии готовности к релизу

### 8.1 Код
- [ ] Zero `any` аннотаций во всём проекте
- [ ] Zero TODO/FIXME маркеров
- [ ] `tsc --noEmit` проходит без ошибок
- [ ] Все критические проблемы закрыты (C1-C10)

### 8.2 Тесты
- [ ] 100% тестов проходят на всех платформах
- [ ] 12-modules: 60+ тестов
- [ ] 15-decorators: 50+ тестов
- [ ] Test-engine покрывает все инварианты типов
- [ ] Fuzz-тесты не находят багов за 1 час

### 8.3 Документация
- [ ] CONTEXT.md обновлён
- [ ] README.md в каждом пакете
- [ ] CHANGELOG.md с историей изменений
- [ ] Spec соответствует реализации
- [ ] Migration guide из TypeScript

### 8.4 Инструментарий
- [ ] CLI: все 15 команд работают
- [ ] LSP: hover, documentSymbol, basic completion
- [ ] Formatter: обрабатывает все случаи
- [ ] PM: install, publish, resolveDeps

### 8.5 Кроссплатформенность
- [ ] Работает на Linux (gcc/clang)
- [ ] Работает на macOS (clang)
- [ ] Работает на Windows (MSVC/MinGW)
- [ ] Работает на AVR (avr-gcc + simavr)
- [ ] Работает на WASM (emcc)

---

## 9. Риски

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| LSP требует больше времени | Высокая | Средняя | Начать с базового hover/documentSymbol |
| PM требует HTTP-клиент | Средняя | Высокая | Использовать npm-совместимый API, не писать свой |
| Кроссплатформенные тесты не работают на CI | Средняя | Высокая | Добавить fallback-логику для каждой платформы |
| Рефакторинг codegen.ts ломает что-то | Высокая | Высокая | Каждый шаг с тестами, incremental |
| Test-engine не покрывает все инварианты | Средняя | Средняя | Комбинировать статические + dynamic тесты |

---

## 10. Верификация

### Как проверять прогресс:

```bash
# Полный прогон тестов по секциям
pnpm tsx packages/tests/test/runner.ts 02-syntax
pnpm tsx packages/tests/test/runner.ts 03-types
# ... по всем секциям

# Проверка типов
pnpm typecheck

# Сборка
pnpm build

# Проверка test-engine
pnpm tsx packages/test-engine/src/index.ts

# Проверка LSP (ручная)
# Запустить VS Code с extension host, подключить LSP
```

### Как проверять релиз:

```bash
# 1. Все тесты проходят
pnpm test

# 2. Все платформы
pnpm test --platform desktop
pnpm test --platform avr
pnpm test --platform wasm

# 3. Документация
# Проверить CONTEXT.md, README.md, CHANGELOG.md

# 4. Инструментарий
tsclang build input.tsc --outDir .tsclang-tmp/
tsclang lint input.tsc
tsclang format input.tsc
tsclang lsp  # запустить и проверить
```
