# SPEC ↔ Implementation Audit Plan

## Цель
Систематически сравнить SPEC.md и реализацию, для каждого расхождения определить кто прав.

## Принципы проектирования TSClang

См. `book/PLAN.md` — принципы П1–П3, подход, вердикты, риски и порядок работы перенесены туда.

## Метод
Для каждой секции — двунаправленный аудит:
- **Прямой проход** (SPEC → код): каждое утверждение SPEC проверяем против кода и тестов
- **Обратный проход** (код → SPEC): каждое поведение кода проверяем что описано в SPEC
- **Вердикт**: SPEC прав / код прав / оба частично правы

## Правила работы

1. **SPEC — source of truth по умолчанию**. Если код расходится со SPEC, считаем что SPEC прав, пока не доказано обратное.

2. **Доказательство «код прав»** — только если поведение SPEC приводит к:
   - Undefined behaviour в сгенерированном C
   - Противоречию с другими частями SPEC
   - Невозможности реализации на целевых платформах (embedded)

3. **Мелкие шаги** — одна секция за раз, внутри секции — один пункт за раз. Не перепрыгиваем.

4. **Каждое расхождение — с доказательством**. Не «кажется что не работает», а конкретная строка SPEC, конкретный файл:строка кода, конкретный тест (или его отсутствие).

5. **Не фиксим на ходу**. Аудит — отдельно, исправления — отдельно. Сначала полная картина, потом действия.

6. **Обратный проход обязателен**. После прямого — обязательно проверяем что код не делает чего-то, чего нет в SPEC.

7. **Все решения фиксируются**. Вердикт по каждому расхождению записываем в таблицу с обоснованием.

## Порядок секций
1. Лексика и токены
2. Типы
3. Выражения
4. Операторы
5. Функции
6. Классы и интерфейсы
7. Модули
8. Модель памяти
9. Обработка ошибок
10. Async/конкурентность
11. Декораторы
12. Строки и кодировки
13. Runtime и стандартная библиотека
14. CLI и сборка
15. Embedded-таргет

## Статус
- [x] Секция 1: Лексика и токены
- [ ] Секция 2: Типы
- [ ] Секция 3: Выражения
- [ ] Секция 4: Операторы
- [ ] Секция 5: Функции
- [ ] Секция 6: Классы и интерфейсы
- [ ] Секция 7: Модули
- [ ] Секция 8: Модель памяти
- [ ] Секция 9: Обработка ошибок
- [ ] Секция 10: Async/конкурентность
- [ ] Секция 11: Декораторы
- [ ] Секция 12: Строки и кодировки
- [ ] Секция 13: Runtime и стандартная библиотека
- [ ] Секция 14: CLI и сборка
- [ ] Секция 15: Embedded-таргет

## Найденные расхождения

| # | Секция | Утверждение SPEC | Статус | Вердикт | Комментарий |
|---|--------|-----------------|--------|---------|-------------|
| L-1 | Лексика | `'hello'` → TK.CHAR — вводит в заблуждение | **RESOLVED** | Code smell | Переименовано TK.CHAR → TK.SQUOTE. litType='char' в AST не тронут |
| L-2 | Лексика | `**=` и `*=` делят TK.STAREQ | **RESOLVED** | Code smell | Добавлен TK.STARSTAREQ для `**=` |
| L-3 | Лексика | `import { X as Y }` не работает | **ALREADY RESOLVED** | Устаревшая находка | Parser+codegen уже поддерживают. Тест phase6/import/import-rename проходит |
| L-4 | Лексика | Legacy octal не задокументирован | **RESOLVED** | Спец неполон | Добавлена заметка в spec/03-types/03-numbers.md |

---

## Закрытые нашей работой

Следующие spec↔impl gaps были закрыты в ходе работы над defaultNumber, директивами и wasm:

| # | Что закрыто | Когда | Как |
|---|-------------|-------|-----|
| R-1 | defaultNumber: `number` → f64/f32/auto-detect | 2026-05-27 | `types.js`, `resolve.js`, `helpers.js` — параметризовано; CLI `--default-number`; auto-detect desktop→f64, avr→f32 |
| R-2 | `#[target(avr)]`, `#[profile(...)]`, `#[allocator(none)]` | 2026-05-27 | Удалены из parser.js → syntax error с help; заменены CLI flags / meta.json / tsc.package.json |
| R-3 | `#[isr(...)]` → `@embedded.isr(...)` | 2026-05-27 | Декоратор с async check; 2 теста мигрированы |
| R-4 | Wasm bare + emscripten targets | 2026-05-27 | `wasm` (bare, restricted) + `wasm32` (emscripten = desktop); `runtime_wasm.h`; ограничения в dispatch/console/program |
| R-5 | `// @ts-ignore-perf` | 2026-05-27 | Удалён из spec и impl |
| R-6 | `// @target:` comment parsing | 2026-05-27 | Удалён из codegen |
| R-7 | `// @opt` pragma | 2026-05-27 | Заменён `"optimize": true` в meta.json |
| R-8 | meta.json test config system | 2026-05-27 | Runner читает meta.json → CLI flags; 78 тестов мигрировано |

---

## Предварительные находки (верифицированные)

Найдено в ходе предварительного аудита, затем верифицировано проверкой impl.
Статус: **RESOLVED** / **STILL PRESENT** / **NEEDS INVESTIGATION**.

### Критические (soundness / memory safety)

| # | Описание | Статус | Доказательство |
|---|----------|--------|----------------|
| 65 | Async function arguments silently zeroed | **RESOLVED** | `async-emit.js:82` — params включены в state struct. Присваиваются перед первым poll. |
| 66 | Array of optional types stores values wrong | **NEEDS INVESTIGATION** | `helpers.js:114-138` — opt_T struct с `has_value` + `value`. Инициализация элементов для optional типов требует проверки. |
| 67 | Tuple destructuring ignores type annotation | **NEEDS INVESTIGATION** | Обрабатывается через `VarDestructArr` path. Аннотация типа не проверяется. |
| 89 | Map string keys use-after-free | **MITIGATED** | `vardecl.js:258` — компилятор ограничивает ключи compile-time string literals. Runtime UAF невозможна на практике. `runtime.h:575-579` — shallow copy без retain, но только для литералов. |

### Высокие (incorrect code generation / type safety)

| # | Описание | Статус | Доказательство |
|---|----------|--------|----------------|
| 35 | Async arrow parse | **RESOLVED** | `parser.js:1781-1831` — полный парсинг arrow functions включая `async`. |
| 37 | Math.random linker error | **RESOLVED** | `builtin-helpers.js:107` — `random: 'tsc_math_random()'`. Runtime предоставляет функцию. |
| 38 | URL encode/decode missing | **STILL PRESENT** | URL parsing реализован, но `encodeURIComponent`/`decodeURIComponent`/`encodeURI`/`decodeURI` отсутствуют. |
| 55 | Async generators Promise wrapping | **RESOLVED** | `func.js:126-134`, `async-stmt.js:306-348` — корректная обработка async generators. |
| 58 | Regex literals missing | **RESOLVED (by design)** | Regex через `new Regex("pattern")` конструктор. Lexer не имеет REGEX token — осознанное решение. |
| 90 | Channel thread safety | **RESOLVED** | `runtime.h:3018-3079` — mutex + condvar, thread-safe MPMC. |
| 91 | Recursive type alias infinite struct | **NEEDS INVESTIGATION** | `types-alias.js` — нет обнаружения циклов. `type A = { next: A }` может дать бесконечный struct. |
| 92 | Type exports invisible across modules | **NEEDS INVESTIGATION** | Type-only imports парсятся (`parser.js:512-513`), но взаимодействие с type resolution через границы модулей не проверено. |
| 93 | Import renaming misparse | **RESOLVED** | parser.js:536-541 — `import { X as Y }` полностью поддерживается. Codegen (codegen.js:55-57) обрабатывает alias. Тест phase6/import/import-rename проходит. |
| 94 | Division by zero no guard | **STILL PRESENT** | Нет защиты от деления на 0 нигде в codebase. C integer division by zero = UB. |
| H-1 | async+for-of wrong C | **RESOLVED** | `async-stmt.js:306-348` — полная реализация async for-await-of. |
| H-2 | async+closure env lost | **RESOLVED** | `async-emit.js:56-92` — free variables промотируются в state struct fields. |
| H-3 | Nested closures dangling pointer | **NEEDS INVESTIGATION** | `vardecl.js:1081-1083` — env на стеке. Если closure escaping scope → dangling pointer. |
| H-4 | Recursive closures undeclared | **NEEDS INVESTIGATION** | Нет forward-reference механизма для self-referencing closures. |
| H-5 | String comparison struct UB | **RESOLVED** | `operators.js:227-232` — String equality использует `tsc_string_eq()`. |
| H-6 | objPattern in for-of unhandled | **RESOLVED** | `VarDestructObj` реализован — `destruct.js:5`, `stmt.js:42`. Map entries с array destructuring + object destructuring работают. |
| H-7 | Closure type loss on assignment | **NEEDS INVESTIGATION** | Нужно проверить теряется ли тип при присвоении closure переменной. |
| H-8 | Array method chaining defaults to i32 | **NEEDS INVESTIGATION** | Нужно проверить теряет ли `.map().filter()` тип элемента. |

### Средние (incorrect behavior / missing validation)

| # | Описание | Статус | Доказательство |
|---|----------|--------|----------------|
| 1 | Date.toLocaleTimeString missing | **PARTIALLY RESOLVED** | `toLocaleDateString` реализован. `toLocaleTimeString` — НЕТ (только `toTimeString`). |
| 14 | import type ignored | **RESOLVED** | `parser.js:512-513` — `import type { X }` парсится и помечается `typeOnly: true`. |
| 95 | String sort AVR PROGMEM | **NEEDS INVESTIGATION** | `runtime.h` — `toSorted` на AVR может обращаться к PROGMEM строкам как к обычным. |
| 96 | String concat temp leak | **NEEDS INVESTIGATION** | `runtime.h` — конкатенация через `+` может утекать временные значения. |
| 97 | Non-const init library mode | **NEEDS INVESTIGATION** | `bin/index.js` — неконстантная инициализация в library mode. |
| 98 | Names not module-prefixed | **NEEDS INVESTIGATION** | `top-level.js` — имена внутри модуля не получают prefix. |
| 99 | i32 overflow unchecked | **NEEDS INVESTIGATION** | `expr/binary.js` — переполнение i32 не проверяется. |
| 100 | i8=128 no range check | **NEEDS INVESTIGATION** | `vardecl.js` — `i8 = 128` не проверяется на диапазон. |
| 101 | f64→i32 truncation | **NEEDS INVESTIGATION** | `vardecl.js` — `let x: i32 = 3.14` — нет проверки на потерю точности. |
| 102 | Large array OOM no NULL check | **NEEDS INVESTIGATION** | `runtime.h` — `new Array(N)` с большим N — нет NULL check после malloc. |
| 103 | `*_to_string` static buffers not reentrant | **RESOLVED** | `runtime.h` — static buffers заменены на malloc+ARC (desktop) и `_tsc_str_make` с ring buffer pool (embedded). Тест `toString-reentrant` добавлен. |
| 104 | Decorator on constructor silently dropped | **NEEDS INVESTIGATION** | `decorators.js` — декоратор на конструкторе silently игнорируется. |
| 105 | @platform on class methods ignored | **NEEDS INVESTIGATION** | `decorators.js` — `@platform` на методах класса игнорируется. |

### Низкие (cosmetic / edge cases / documentation)

| # | Описание | Статус | Доказательство |
|---|----------|--------|----------------|
| 106 | Decorator wrapper `(void)` | **NEEDS INVESTIGATION** | `decorators.js` — wrapper должна использовать `(void)` для неиспользуемых параметров. |
| 107 | Install lock file stale | **NEEDS INVESTIGATION** | `bin/index.js` — `tsc.lock` может быть устаревшим. |
| 108 | Watch doesn't monitor imports | **NEEDS INVESTIGATION** | `bin/index.js` — `--watch` не отслеживает изменения в импортированных файлах. |
| 109 | Missing input file poor error | **NEEDS INVESTIGATION** | `bin/index.js` — нет входного файла — неинформативное сообщение. |

### Spec↔impl расхождения (верифицированные)

| # | SPEC утверждает | Реализация | Статус | Вердикт |
|---|----------------|------------|--------|---------|
| S-1 | — | `atob`/`btoa` реализованы | **STILL PRESENT** | SPEC нужно обновить — добавить atob/btoa |
| S-2 | — | `Set<T>` реализован, не описан | **RESOLVED** | Теперь описан: `03-types.md:1341`, `05-memory.md:914` |
| S-3 | — | `structuredClone` реализован, не описан | **RESOLVED** | Теперь описан: `03-types.md:1782,1788,1789` |
| S-4 | `instanceof`/`in` в precedence table | Оба на уровне 6 | **RESOLVED** | Реализовано корректно |
| S-5 | Promise.race/.any/.allSettled | Все 4 combinator реализованы | **RESOLVED** | SPEC нужно обновить — описать |
| S-6 | 5 Atomic methods | Только load/store/fetchAdd/compareExchange | **STILL PRESENT** | SPEC прав, код нужно исправить |

### Статистика верифицированных находок (обновлено 2026-06-05)

| Категория | Всего | RESOLVED | STILL PRESENT | NEEDS INVESTIGATION | MITIGATED |
|-----------|-------|----------|---------------|---------------------|-----------|
| Критические | 4 | 1 | 0 | 2 | 1 |
| Высокие | 18 | 9 | 2 | 7 | 0 |
| Средние | 13 | 2 | 0 | 11 | 0 |
| Низкие | 4 | 0 | 0 | 4 | 0 |
| Spec↔impl | 6 | 4 | 1 | 0 | 0 |
| **Итого** | **45** | **16** | **3** | **24** | **1** |

### Подтверждённые открытые проблемы (обновлено 2026-06-07, 4 штуки)

1. **URL encode/decode missing** (#38) — `encodeURIComponent`/`decodeURIComponent`/`encodeURI`/`decodeURI` не реализованы
2. **Division by zero no guard** (#94) — UB в C при integer division by zero
3. **5 Atomic methods missing** (S-6) — `fetchSub`, `fetchOr`, `fetchAnd`, `fetchXor`, `exchange`
4. **`--emit hex` не функционален** — bin/index.js:1056-1061, hex emit path не реализован

---

## Отчёты по секциям (старый doc-аудит — историческая справка)

Старая документация полностью заменяется книгой. Ниже — результаты аудита старого doc
с верифицированным статусом каждой точки. Все "старый doc неправ" будут автоматически
исправлены при написании книги.

### Секция 01-intro: верифицированные статусы

| # | Утверждение doc | Статус | Примечание |
|---|----------------|--------|------------|
| ~~01-1~~ | ~~C-output: `tsc_console_log(...)`~~ | ~~Исключено: fabricated~~ | — |
| 01-2 | `let mut` — mutable variable | **RESOLVED**: `mut` — modifier методов | Книга напишет правильно |
| ~~01-3~~ | ~~Алиасы `b`, `r`, `l`~~ | ~~Исключено~~ | — |
| ~~01-4~~ | ~~`tsclang init --declaration`~~ | ~~Исключено~~ | — |
| 01-5 | `--emit hex` для AVR | **STILL PRESENT** | bin/index.js:1056 |
| ~~01-6~~ | ~~`tsclang build --clean`~~ | ~~Исключено~~ | — |
| 01-7 | `lint --fix` = форматтер | **RESOLVED**: let→const auto-fix | Книга напишет правильно |
| ~~01-8~~ | ~~`tsclang lsp --port 7777`~~ | ~~Исключено~~ | — |
| 01-9 | `tsclang migrate` roadmap | **RESOLVED**: оба согласны | OK |
| ~~01-10~~ | ~~Структура dist/~~ | ~~Исключено~~ | — |
| ~~01-11~~ | ~~`--emit wasm` не упомянут~~ | ~~Исключено~~ | — |

**Из 3 "активных": 2 RESOLVED, 1 STILL PRESENT (`--emit hex`)**

### Секция 02-syntax: верифицированные статусы

| # | Утверждение doc | Spec/Impl на самом деле | Статус |
|---|----------------|------------------------|--------|
| 02-1 | ASI как в JavaScript | `eatSemi()` = optional, не ASI. parser.js:66 | **RESOLVED** |
| 02-2 | Одинарные/двойные кавычки эквивалентны | lexer.js:159-164: single=CHAR, double=STRING | **RESOLVED** |
| 02-3 | `?T` суффикс типа | Только `prop?: Type`. parser.js:783,883,914 | **RESOLVED** |
| 02-4 | Closure capture = Ref<T> | Default = 'move'. closures.js:131 | **RESOLVED** |
| 02-5 | for-of переприсвоение примитивов ok | Spec: "всегда ошибка". Impl: `let` даёт mutable binding | **NEEDS INVESTIGATION** |
| 02-6 | Диапазон `a..b` включительно | Spec: "a вкл., b не вкл.". Impl: `>=`/`<=` | **NEEDS INVESTIGATION** |
| 02-27 | `lint -fix` syntax | RESOLVED: correct = `--fix` | **RESOLVED** |
| 02-28 | `match x {}` без скобок | Parser поддерживает оба варианта | **RESOLVED** |

~~Исключено: 02-7..02-11 (неверный C-output), 02-12..02-22 (doc без spec), 02-23..02-26 (doc неполон)~~

**Из 8 "активных": 6 RESOLVED, 2 NEEDS INVESTIGATION**

### Секция 03-types: верифицированные статусы

| # | Утверждение doc | Spec/Impl на самом деле | Статус |
|---|----------------|------------------------|--------|
| 03-1 | for-of итерирует по графемам | Bytes по умолчанию; `.graphemes()`/`.codePoints()` явно | **RESOLVED** |
| 03-2 | `string\|null` → `String*` | `opt_string` struct с `has_value`. helpers.js:114 | **RESOLVED** |
| 03-3 | `charCodeAt` возвращает `u8` | Тип `uint32_t`, значение 0-255 | **RESOLVED** |
| 03-4 | Нет `undefined` | `undefined` = синоним `null`. resolve.js:10 | **RESOLVED** |
| 03-5 | `.parse` только для 3 типов | Все 10 числовых типов имеют `.parse()` | **RESOLVED** |
| 03-6 | `Set.delete` возвращает `bool` | Возвращает `opt_T`. stdlib.js:849-854 | **STILL PRESENT** |
| 03-7 | `groupBy` — instance method | Static: `Map.groupBy`, `Object.groupBy` | **RESOLVED** |

~~Исключено: 03-8..03-9 (отсутствующие разделы), 03-10..03-14 (неверный C-output), 03-15..03-17 (doc без spec)~~

**Из 7 "активных": 6 RESOLVED, 1 STILL PRESENT (`Set.delete` return type)**

### Секция 04-classes: верифицированные статусы

~~Все 16 расхождений исключены: 04-1..04-8 (скрытие NOT YET), 04-9..04-12 (неверный C-output), 04-13..04-16 (пропущенные разделы)~~

**Из 0 "активных": все исключены**

### Секция 05-memory: верифицированные статусы

| # | Утверждение doc | Spec/Impl на самом деле | Статус |
|---|----------------|------------------------|--------|
| 05-1 | String = heap Owner | String = immutable+ARC, implicit borrow | **RESOLVED** |
| 05-2 | String param: retain перед вызовом | Caller НЕ retain — implicit borrow | **RESOLVED** |
| 05-3 | `new Shared<Node>()` — конструктор | `new Shared<T>(val)` — factory | **RESOLVED** |
| 05-4 | `new Weak<Data>(d)` + `w.upgrade()` | `tsc_weak_create`, null-check | **RESOLVED** |
| 05-5 | Closure capture = Ref<T> default | Default = 'move' | **RESOLVED** |
| 05-6 | Classes = pointer | Classes = value type (stack struct) | **RESOLVED** |
| 05-7 | Lifetime привязан к минимальному | Conservative Union | **RESOLVED** |

~~Исключено: 05-8 (фабрикация C-output), 05-9..05-24 (16 отсутствующих разделов)~~

**Из 7 "активных": все 7 RESOLVED**

### Секция 06-errors: верифицированные статусы

| # | Утверждение doc | Spec/Impl на самом деле | Статус |
|---|----------------|------------------------|--------|
| 06-1 | `throws` выводится автоматически | Явное объявление обязательно. func.js:223 | **RESOLVED** |
| 06-2 | `Error.stack` — встроенное поле | User-defined, auto-generated. class.js:195 | **RESOLVED** |
| 06-3 | C naming: `_Result_`, `_kind` | `Result_<value>_<error>`, tagged union | **RESOLVED** |

~~Исключено: 06-4..06-6 (фабрикация C-output)~~

**Из 3 "активных": все 3 RESOLVED**

### Секция 07-concurrency: верифицированные статусы

| # | Утверждение doc | Spec/Impl на самом деле | Статус |
|---|----------------|------------------------|--------|
| 07-1 | `_state`: платформозависимый | Всегда `int32_t`. async-emit.js:78 | **RESOLVED** |
| 07-2 | Poll возвращает `bool` | Poll возвращает `void` | **RESOLVED** |
| 07-3 | Channel = SPSC single object | MPMC с mutex+condvar. runtime.h:3018 | **RESOLVED** |
| 07-4 | `select` — async | `select` — sync, non-blocking | **RESOLVED** |
| 07-5 | Random order при select | Sequential tryReceive order | **RESOLVED** |
| 07-8 | Atomic heap: `atomic_size_t` | `int32_t _refcount; int32_t _weakcount;` | **RESOLVED** |
| 07-9 | AtomicArray: FAM | Pointer+calloc | **RESOLVED** |
| 07-10 | `<T>` обязателен для Readonly | `<T>` выводится из аргумента | **RESOLVED** |
| 07-11 | Readonly — heap с refcount | Readonly — zero-overhead `const T` | **RESOLVED** |
| 07-12 | Async generator: callback-based | Return-value-based API | **RESOLVED** |
| 07-13 | @static generator: `uint8_t _state` | `int32_t _state`, struct return | **RESOLVED** |

~~Исключено: 07-6 (`after(ms)`), 07-7 (escape analysis), 07-14..07-16 (пропущенные разделы)~~

**Из 11 "активных": все 11 RESOLVED**

### Секции 08-12: верифицированные статусы

Все расхождения в этих секциях были из категорий "скрытие статуса", "fabricated C-output",
"пропущенные разделы", "экстра-контент" — все исключены, книга напишет заново.

Исключение — **12-migration (3 активных)**:

| # | Утверждение doc | Статус | Примечание |
|---|----------------|--------|------------|
| 12-1a | `undefined` unsupported | **RESOLVED**: undefined = synonym for null | Книга напишет правильно |
| 12-1b | `let` в for-of для примитивов | **RESOLVED**: let даёт mutable binding | Книга напишет правильно |
| 12-1c | Fabricated transformation rules | **RESOLVED**: будет переписано | — |

**Из 3 "активных": все 3 RESOLVED**

---

## Сводная таблица (обновлённая)

### Старый doc-аудит

| Секция | Было "активных" | Из них RESOLVED | STILL PRESENT | NEEDS INVESTIGATION |
|--------|-----------------|-----------------|---------------|---------------------|
| 01-intro | 3 | 2 | 1 (`--emit hex`) | 0 |
| 02-syntax | 8 | 6 | 0 | 2 (for-of, range) |
| 03-types | 7 | 6 | 1 (`Set.delete`) | 0 |
| 04-classes | 0 | — | — | — |
| 05-memory | 7 | 7 | 0 | 0 |
| 06-errors | 3 | 3 | 0 | 0 |
| 07-concurrency | 11 | 11 | 0 | 0 |
| 08-12 | 3 | 3 | 0 | 0 |
| **Итого** | **42** | **38** | **2** | **2** |

### Предварительные находки

| Категория | Всего | RESOLVED | STILL PRESENT | NEEDS INVESTIGATION |
|-----------|-------|----------|---------------|---------------------|
| Критические | 4 | 1 | 0 | 3 |
| Высокие | 18 | 8 | 2 | 8 |
| Средние | 13 | 2 | 0 | 11 |
| Низкие | 4 | 0 | 0 | 4 |
| Spec↔impl | 6 | 2 | 3 | 0 |
| **Итого** | **45** | **13** | **4** | **27** |

### Общая статистика

| Метрика | До | После (2026-06-07) |
|---------|-----|-------|
| "Активных" расхождений старого doc | ~42 | **4** (2 STILL PRESENT + 2 NEEDS INVESTIGATION) |
| Предварительных находок | ~109 | **45** (4 STILL PRESENT + 24 NEEDS INVESTIGATION + 15 RESOLVED + 1 MITIGATED + 1 PARTIALLY RESOLVED) |
| Закрыто нашей работой | 0 | **8** (R-1..R-8) |
| Закрыто аудитом Секции 1 | 0 | **4** (L-1..L-4: 2 code smell fix, 1 spec update, 1 already resolved) |
| Закрылось само с момента аудита | 0 | **3** (H-6, S-2, S-3) |

### Подтверждённые открытые проблемы (итого 5)

**Из старого doc-аудита (2):**
1. `--emit hex` не функционален (01-5)
2. `Set.delete` возвращает `opt_T` вместо `bool` — spec↔impl gap (03-6)

**Из предварительных находок (3):**
3. URL encode/decode missing (#38)
4. Division by zero no guard (#94)
5. atob/btoa не в spec (S-1)

**Закрыто аудитом Секции 1 (2026-06-07):**
- ~~Import renaming not supported (#93)~~ — RESOLVED, parser+codegen уже поддерживают
- ~~Legacy octal не в spec (L-4)~~ — RESOLVED, добавлена заметка в spec
- ~~`*_to_string` static buffers not reentrant (#103)~~ — RESOLVED, malloc+ARC (desktop), ring buffer pool (embedded), тест toString-reentrant

### Подлежат исследованию (24 штуки)

При написании соответствующих блоков книги эти точки будут проверены:
- Критические: #66 (optional array), #67 (tuple destruct)
- Высокие: #91-92 (recursive type, type exports), H-3..H-4 (closures), H-7..H-8 (type loss)
- Средние: #95-#102, #104-#105 (runtime issues, validation gaps)
- Низкие: #106-#109 (cosmetic)
- Doc-аудит: 02-5 (for-of reassignment), 02-6 (range inclusivity)

---

## План разрешения

См. `book/PLAN.md` — подход, вердикты, риски и порядок работы перенесены туда.

Открытые проблемы будут проверяться при написании соответствующих блоков книги:
- Блок 1 (Лексика): 02-5, 02-6
- Блок 5 (Строки): #89, #95, #96
- Блок 7 (Массивы): #66
- Блок 8 (Кортежи): #67
- Блок 9 (Map/Set): 03-6, S-2
- Блок 14 (Ошибки): #94, #99-#101
- Блок 20 (Async): H-3, H-4
- Блок 22 (Threads): S-6
- Блок 24 (Stdlib): S-1, S-3, #38
- Блок 29 (Сборка): 01-5
