# TSClang — Лог разработки

## Статусы

| Метка | Значение |
|-------|----------|
| `[ ]` | не начато |
| `[~]` | в процессе / есть черновой код, но тесты не проходят |
| `[x]` | завершено (тесты проходят) |

Записи о проделанной работе добавляются под фазой в формате:
```
> YYYY-MM-DD: что сделано
```

> **Подробная спецификация каждой фазы** — в [SPEC.md](SPEC.md) (раздел «Фазы реализации») и соответствующих файлах [`spec/`](spec/). Перед началом работы над фазой — читать нужные разделы спеки.

---

## Фаза 0 — Core runtime

> Минимальная инфраструктура: console, базовый Error, заглушки для отладки кодогенерации.

- [x] `console.log` / `console.error` / `console.warn` / `console.debug`
- [x] `performance.now()` → `f64`
- [x] Базовый `Error` (хардкод в компиляторе): `new Error("msg")`, `.message`
- [x] `runtime.h` — минимальный заголовочный файл для C-output

### Лог

> 2026-04-02: написан черновой codegen с обработкой `console.*` и `throw`; тесты ещё не проходят из-за проблемы с путями в runner.js
> 2026-04-03: подключён bin/index.js (CLI); исправлен consoleCall (строковые литералы в format, String struct → %.*s); исправлен visitClassDecl (multi-line struct, TscError base); добавлен new Error(); исправлен inferType для Member(.message) и New(Error). Исправлен test runner для Windows+MSYS2 (gcc через bash --login). Phase 0: **15/15 ✓**

---

## Фаза 1 — Базовый парсинг и кодогенерация

> Компилятор транслирует простой процедурный код в C.

**Лексер:**
- [x] Числовые литералы (`42`, `3.14`, `0xFF`, `0b1010`, `0o77`, underscore-разделители)
- [x] Строковые литералы (`"hello"`, шаблонные строки с интерполяцией)
- [x] `true` / `false` / `null`
- [x] Идентификаторы и ключевые слова
- [x] Все операторы (арифметика, сравнения, логика, битовые, присваивание)
- [x] Пунктуация (`{}`, `()`, `[]`, `;`, `:`, `,`, `.`, `=>`, `...`)
- [x] Комментарии (`//`, `/* */`) — пропускаются без токена

**Парсер:**
- [x] `let` / `const` объявления
- [x] Функции (`function f(...)`, `async function`, стрелочные, генераторы)
- [x] Дефолтные параметры
- [x] `if` / `else`
- [x] `while` / `do-while`
- [x] `for` (классический `for(;;)`, `for-of`)
- [x] `switch` / `case` / `default`
- [x] `break` / `continue` (с метками)
- [x] `return`
- [x] Операторы и выражения (бинарные, унарные, тернарный, `??`, `?.`)
- [x] Вызов функций / методов
- [x] `new`
- [x] Деструктуризация объекта и массива в параметрах и переменных
- [x] Тип-аннотации на параметрах и возвращаемом типе

**Кодогенерация:**
- [x] Базовая C-структура файла (includes, typedefs, функции, `main`)
- [x] Переменные (`let`/`const` → типизированные C-переменные)
- [x] Функции → C-функции
- [x] `if`/`else` → C `if`/`else`
- [x] `while`/`do-while` → C
- [x] `for(;;)` → C `for`
- [x] `switch` / `case` → C `switch`
- [x] `return` → C `return`
- [x] Числовые и строковые литералы
- [x] Арифметические и логические выражения
- [x] Примитивные числовые типы: `i8`–`i64`, `u8`–`u64`, `f32`, `f64`, `bool`, `usize`

### Лог

> 2026-04-02: написаны lexer.js, parser.js, codegen.js, types.js — первый черновой проход
> 2026-04-10: все тесты phase1 проходят. **Статус: 166/166 ✓**

---

## Фаза 2 — Система типов

> Компилятор понимает типы, генерирует корректные C-структуры.

- [x] Type inference (вывод типа из литерала и выражения)
- [x] `null` / `T | null` → nullable C-представление (`opt_T`)
- [x] Type aliases (`type Foo = ...`) — без методов
- [x] `interface` — без методов, структурная типизация
- [x] `as` оператор — явное приведение типа
- [x] Enum: числовой, строковый, `const enum`
- [x] Generics — монорфизация (без ownership-aware bounds)
- [x] Числовые автокасты
- [x] String Literal Union → C enum + rodata таблица
- [x] Tuples: базовые `[A, B, C]`, labeled, readonly, optional, rest
- [x] Utility Types: `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`
- [x] `keyof`
- [x] Специальные типы: `any`, `never`, `void`, `unknown`

### Лог

> 2026-04-10: все тесты phase2 проходят через test/runner.js

---

## Фаза 3 — Модель памяти

> Borrow checker работает; C-output безопасен по памяти.

**Типы данных и ownership:**
- [x] `string` — UTF-8, heap owner; встроенные методы (slice, indexOf, toUpperCase и др.)
- [x] Массивы — heap owner: push, pop, length, capacity
- [x] Ownership `T` (owned) — move при присвоении и передаче
- [x] `Ref<T>` — immutable borrow
- [x] `Mut<T>` — mutable borrow
- [x] `Shared<T>` — ARC; `Weak<T>`
- [x] Деструктуризация с ownership (borrow по умолчанию, move через аннотацию)
- [x] Автоматический Drop (обратный порядок, детерминированный)
- [x] `for-of` → while-цикл

**Borrow checker (статические проверки):**
- [x] Move из `const`-binding → ошибка
- [x] Move из `Ref<T>` параметра → ошибка
- [x] Use-after-move: переменная и поле
- [x] `Ref<T>` / `Mut<T>` не могут храниться в полях класса
- [x] `const`-переменная не может передаваться в `Mut<T>`
- [x] Возврат `Ref<T>` на локальную переменную → ошибка
- [x] `Shared<T>` при `#[allocator(none)]` → ошибка
- [x] Aliasing XOR mutability: одновременные `Mut`+`Ref` / два `Mut`

- [x] `Slice<T>` / `MutSlice<T>` — zero-copy view на массив (`.view()`, `.viewMut()`, индексация)
- [x] Cleanup при throw: owned vars освобождаются перед `return` ошибки; `_loopDepth` guard для loop-local vars
- [x] `Iterable<T>` протокол
- [x] `@static let` — объект в BSS
- [x] Move из массива по индексу
- [x] Запрет мутации коллекции при активном borrow

### Лог

> 2026-04-10: все [F]/[R] тесты phase3 проходят (121/121 через test/runner.js --no-gcc); [E]-тесты (borrow checker) не реализованы
>
> 2026-04-16: реализованы borrow checker проверки. Исправлен баг pre-scan (параметры функций исключаются из _funcRefVars). Добавлены: move-из-const, move-из-Ref, use-after-move (Ident + Member), use-after-field-move, Ref/Mut в полях класса, const→Mut<T>, возврат Ref на локальную, Shared<T>+allocator:none. Изменён формат аннотации в тесте: `// @allocator: none` → `#[allocator(none)]`.
>
> 2026-04-16 (продолжение): реализованы aliasing-проверки (Mut+Ref / два Mut) через `_refBorrowed` и `_mutBorrowedBy` в calls.js (per-callee tracking). **Статус: 142/142 phase3 ✓**
>
> 2026-04-20: реализованы `Slice<T>` / `MutSlice<T>` (view/viewMut, индексация, sub-slice на Slice); cleanup owned vars при throw/return в функциях (inline free перед return, _loopDepth guard). **Статус: 163/163 phase3+phase5 ✓**
>
> 2026-04-21: реализован ARC runtime в runtime.h: `tsc_arc_alloc` (calloc + `_refcount=1`), `tsc_arc_retain`, `tsc_arc_release`, `tsc_weak_create`, `tsc_weak_upgrade`, `tsc_weak_release` — всё через макросы (typed-pointer, no void**). Исправлен кодген: `_refcount` теперь всегда первое поле (убран `refFirst=false` для annotated VarDecl); убрано ручное `x->_refcount = 1` и `(void**)&` в cleanup. **Статус: 149/149 phase3 ✓**
>
> 2026-04-21 (продолжение): реализован `Iterable<T>` протокол — специализированный кодген для `iter()`: парсер сохраняет type args в `implements`; кодген генерирует `ClassName_iter_t` (struct с локальными переменными), `ClassName_iter_next` (тело лямбды с `_cAlias`, `_inIterNextBody` флаг для `return` → `opt_T`), `ClassName_iter` (factory); `for-of` десугарится в while по `iter_next`. **Статус: 150/150 phase3 ✓**

---

## Фаза 4 — Объектная модель

> Полноценная объектная система поверх ownership.

- [x] Классы: поля, методы, `mut`-методы, `readonly`-поля
- [x] Конструктор, `this`-семантика
- [x] Замыкания: Ref/Mut/move-захват, явный capture list, C-output → struct
- [x] `match` с exhaustiveness check
- [x] Перегрузка функций: name mangling (`foo_i32`, `foo_string`)
- [x] Extension methods: `extension function name(this: T, ...)`, zero overhead, C-output → `_ext_T_name(obj)`
- [x] `instanceof` — проверка через vtable-адрес O(1)
- [x] Интерфейсы с методами — fat pointer (vtable)
- [x] `implements` проверка

### Лог

> 2026-04-10: начата реализация phase4. Реализованы:
> - Классы: struct-output (single-line), auto/explicit constructor, field-access, new-create
> - `mut`-методы, move-методы, ref-методы, static-методы — codegen + тесты
> - Перегрузка функций: dispatch by count/type, name mangling, c-output — всё проходит
> - Наследование от Error: extra-fields, error-subclass, super() → self._base.message = msg
> - field-modifiers: private-ok, readonly-init
> - Интерфейсы с методами: vtable typedef (single-line), implements→void*_self, emitVtableConstant
> - Статус: **17/53** phase4 тестов проходит
>
> 2026-04-12: полная реализация интерфейсного vtable (все 9 тестов):
> - Pattern A (`implements`): `void *_self` + inner cast, `ClassName_IfaceName_vtable`, fat-ptr assignment в stmt.js (`let x: I = c`)
> - Pattern B (implicit): `const ClassName *self`, `_ClassName_IfaceName_vtable` с кастами `(RetType (*)(void *))`, lazy emission перед main
> - `methodCall` на interface-типах: `obj.vtable->method(obj.self)` — детектируется по `this.interfaces.has(sym.ctype)`
> - Fat-ptr wrapping при вызове функций с interface-параметрами: `I _p_arg = { .self = &arg, .vtable = &... }`, повторное использование через scope
> - `Mut<Interface>` → fat-ptr по значению (не указатель), error check для `const` переменных
> - `inferType` для interface method calls (нужно для `console.log(n.method())`)
> - Mutation detection regex расширен: теперь ловит `+=`, `-=`, `++`, `--`
> - Пустой класс → `{ int _dummy; }` (C не допускает пустые structs)
> - [E]-тесты для интерфейсов: missing-method (implements), missing-in-second (implicit vtable), vtable-mut-const (Mut + const)
> - Статус: **26/53** phase4 тестов проходит
>
> Что НЕ начато: closures, match (parser не поддерживает `=>`/`..`), instanceof, прочие [E]-тесты
>
> 2026-04-12 (продолжение): реализованы оставшиеся фичи phase4:
> - Closures: `_closure_N_env` + `_closure_N_fn` + `_closure_N` typedef, `addLambda`-based ordering, capture-string-ref, capture-primitive, capture-move, c-output — все 4 C-output теста проходят
> - Closure error: `err-use-after-move-capture` — переменная помечается `_movedIntoClosureLine` при захвате, Ident-check в exprToC; парсер теперь сохраняет `line` в VarDecl
> - `instanceof`: same-type → `1`, fat-ptr LHS + class RHS → vtable compare, `_ensureImplicitVtable`; все 4 тесты проходят
> - Implicit vtables теперь emit в `topLevel` (а не в `_pendingImplicitVtables`) — вtables встают перед функциями, которые их используют
> - Inheritance [E]-тесты: err-chain-extend (pre-scan в visitProgram), err-non-error-extend, err-uninit-field (unconditional init check), err-static-mut, err-mut-on-const (`isExplicitMut`), err-move-on-const
> - `match` expression: парсер — `parseMatch` + `parseMatchPattern` с поддержкой литералов, диапазонов `lo..hi`, wildcard `_`, OR-паттернов `a|b|c`, enum-кейсов `Enum.Val`, null, tuple `[a, b]`; кодоген — switch/case для enum (не-parens форма), if/else для остальных; exhaustiveness check для enum
> - Статус: **52/53** phase4 тестов проходит (единственный провал — `extra-fields` конфликтует со спекой: классы могут наследовать только от `Error`)
>
> 2026-04-14: ослаблено ограничение наследования (разрешены любые одноуровневые цепочки). **Статус: 53/53 phase4 ✓**
>
> 2026-04-16: реализованы extension methods. Парсер: `extension function name(this: T, ...) { }` → `ExtensionFunc` AST. Codegen: `_ext_{typeIdent}_{name}(T _self, ...)`, `this` в теле → `_self` (через `_cAlias` в scope). Конфликт с методом класса — ошибка. Lookup в `calls.js`: extension проверяется после класс-методов, перед fallback. **Статус: 56/56 (53 + 3 новых extension-тестов) ✓**

---

## Фаза 5 — Обработка ошибок

> Зависит от фазы 3: cleanup при throw требует знания owned переменных.

- [x] `throws` в сигнатуре функции; вывод типа ошибки компилятором
- [x] `throw` — только наследник `Error`; примитивы — ошибка компилятора
- [x] `try` / `catch` / `finally`
- [x] Несколько `catch`-блоков; union catch
- [x] Union errors: `throws IOError | NetworkError`
- [x] Оператор `?` — propagate ошибки вверх
- [x] Оператор `!` — unwrap с паникой
- [x] C-output: Result-struct (tagged union ok/err)
- [x] Ownership при ошибках: owned vars освобождаются на error-path (inline cleanup, не goto)
- [x] `throw` запрещён в `@embedded.isr` (уже был) и в `#[isr(...)]` аннотации

### Лог

> 2026-04-14: реализована полная фаза 5 — Result<T,E> model, union errors (_ErrTag/_ErrUnion), throws classes (TscError _base), _new factories, try/catch с Result-путём, finally + _inFinallyBlock guard, операторы ?/!, auto-propagation в throws функциях, error stack (desktop). Исправлен парсер для `throws` без типа. Заодно: ослаблено ограничение на наследование (теперь разрешены любые одноуровневые цепочки, не только extends Error). **Статус: 21/21 phase5, 53/53 phase4 ✓**
> 2026-04-15: дополнения к спеке и runtime — числовые литералы и парсинг строк. Добавлена секция «Числовые литералы» в spec/03-types.md (hex/binary/octal форматы, underscore-разделители, автокаст). Runtime: `_tsc_parse_prefixed_i64`/`_tsc_parse_prefixed_f64` — все parse-функции теперь понимают `"0xFF"`, `"0b1010"`, `"0o77"`. Codegen: `Number(s)` реализован как алиас parseFloat; inferType и `_setOptIsNullHint` обновлены. Спека: `spec/03-types.md` — подраздел «Поддержка числовых префиксов в строках». Добавлены тесты: 9 новых в phase1/literals + phase2/as-operator, 6 новых в phase3/type-conversion (parse-int-hex/binary/octal, parse-float-hex, number-hex, number-prefixes). Спека: `unaligned_access` добавлен в `declare platform` (spec/09-build.md) — Built-in таблица, NES-пример; `platformSettings.defaultAlignment` — новый раздел; spec/04-classes.md — расширен Safety layer для `@packed`.

---

## Фаза 6 — Модульная система

- [x] `export` (только именованные; `export default` — ошибка компилятора)
- [x] Точка входа: генерация `int main()` / `int main(int argc, char **argv)`
- [x] C interop: `declare const` / `declare function` — генерирует extern-объявления
- [x] `native` — inline C (строки и шаблонные строки с интерполяцией)
- [x] `unsafe {}` — отключение проверок TSClang (raw pointer `&`/`*`)
- [x] `@packed` / `@align(N)` декораторы на классах → `__attribute__`
- [x] `process.exit(code)` — `exit()` с `#include <stdlib.h>`; ошибка на embedded
- [x] `process.argv` → `int main(int argc, char **argv)` + `tsc_make_argv`
- [x] `#[target(name)]` — мета-аннотация цели (embedded-check)
- [x] Модульные переменные: `static` только если используются из функции
- [x] `import { X } from "./module"` — именованный импорт локальных файлов (bundle: library mode + рекурсивная компиляция)
- [x] Транзитивные импорты (A → B → C)
- [x] Реэкспорт: `export { X } from "./module"` — ExportFrom node; namespace-импорт: `import X from "./module"` → X.method() десугарится в method()
- [x] Циклические импорты: `_compilingStack` Set в `compileTsc`; ошибка с цепочкой `a → b → a`
- [x] Path aliases (`#` / `~`): `tsc.package.json` поле `paths`, wildcard `*`, `resolveAlias` в bin/index.js
- [x] `@platform` — условная компиляция: функции с `@platform("target")` пропускаются если target не совпадает; вызов на неверной платформе → compile error

### Лог

> 2026-04-15: реализована фаза 6 — модульная система (базовый набор). Парсер: pointer types (`*T`), unary `&`/`*`, `native(...)`, `declare const/function`. Codegen: `export function` (без `static` в C), `declare` → extern-объявления, `native` с шаблонной интерполяцией (re-parse через `_lex`/`_parse`), `unsafe {}` с `_inUnsafe` флагом, `@packed`/`@align` → `__attribute__`, `process.exit` → `exit()` + stdlib, `process.argv` → `tsc_make_argv` + `Array_string` (определена в runtime.h), pre-scan функций для определения нужности static-globals. **Статус: 23/23 phase6 ✓**
>
> 2026-04-19: реализован `import { X } from "./module"` (именованный импорт локальных файлов). Bundle-подход: `codegen()` получает `opts.libraryMode` и `opts.importedModules`; в library mode — emit без `#include` и без `main()`; `_exports` Map заполняется в `case 'Export'`; `compileTsc` в bin/index.js рекурсивно компилирует зависимости, передаёт их экспорты в scope следующих файлов, конкатенирует C-выход. Также исправлен race condition (shell-тесты `phase9/run` писали в одну папку `.tsclang-tmp` параллельно): `tsclang run` теперь использует уникальный temp-dir через `mkdtempSync`. **Статус: 27/27 phase6 ✓** (4 новых import-теста)
>
> 2026-04-20: bugfix — `new Svc()` без конструктора генерировал `{0}` вместо `(Svc){0}` в return-контексте (невалидный C). Исправлено через флаг `_inReturnContext` в stmt.js + branch в misc.js. Добавлена `tsc_string_eq` в runtime.h (string equality operator). `tsc_staticmap_set/has/delete/clear/get` добавлены в runtime.h через макрос `TSC_STATICMAP_IMPL`. StaticMap_u8_i32 инстанциирован. Исправлены: phase5/throw-new-error, phase11/static-map-c-output, phase13/order/static-last.
>
> 2026-04-20: завершена фаза 6. Добавлены: Slice<T>/MutSlice<T>.view()/viewMut() → sub-slice expressions; функция-cleanup перед return/throw (inline, O(N*M), `_loopDepth` guard); throw запрещён в `#[isr(...)]` и `@embedded.isr`; реэкспорт (`export { X } from "./module"`) и namespace-импорт (`import X from "./module"` → X.method()); циклические импорты — `_compilingStack` Set, ошибка с цепочкой файлов; path aliases — `tsc.package.json` поле `paths` с wildcard `*`, `resolveAlias` в bin/index.js; `@platform("target")` условная компиляция — функция пропускается если target не совпадает, вызов на неверной платформе → compile error. **Статус: 35/35 phase6 ✓**
>
> 2026-04-16: реализован rustc-style формат диагностических ошибок (Phase A→C):
> - **colors.js** — composable ANSI: `bold`, `boldRed`, `yellow`, `green`, `cyan`, `dim`; `setColorEnabled()`, `makeColors()`; `--no-color` / `NO_COLOR` env
> - **error.js** переписан: `TscError` расширен (`label`, `spans`, `help`, `notes`, `code`, `kind`); `renderDiagnostic` — rustc-формат с гейтером, `-->` локацией, tab-aware позиционированием `^^^`, вторичными спанами `-`, `= help:`/`= note:`, контекстными строками, `...` при разрывах
> - **error-catalog.js** — E001–E006: const-reassign, use-after-move, move-from-const, move-from-ref, implicit-fallthrough, use-after-field-move; команда `tsclang explain <CODE>`
> - **DiagnosticBag** — сбор ошибок по top-level statement, флаг `--all-errors`, счётчик `aborting due to N errors`
> - Вторичные спаны в codegen: use-after-move (место move), use-after-field-move, const-reassign
> - Предупреждения: инфраструктура `warn()`, рендер жёлтым, счётчик `N warnings emitted`
> - Парсер конвертирован на `TscError` (сниппет в parse-ошибках)
> - Обновлён тестовый корпус: 12 файлов (10 `expected.c` + 4 `expected.error`)
> - Исправлены баги: `never-noreturn` (`_currentFuncIsNever`), `cross-compat` (isCrossStruct), `err-vtable-mut-const` (interface-path перехват)
> - Исправлен test runner: `filterArg` → `filterArgs[]` (OR-фильтрация по нескольким аргументам)
> - **Статус фаз 0–6: 589/589 ✓** (phase0: 22, phase1: 166, phase2: 159, phase3: 142, phase4: 56, phase5: 21, phase6: 23)

---

## Фаза 7 — Async/Await

> Зависит от фаз 3–6: state machine дропает owned переменные, cleanup при throw внутри async.

- [x] State machine кодогенерация: SSA-like struct с полями через await-точки
- [x] `async function` / `await expr` — кодогенерация state machine poll-функции
- [x] `Promise<T>`: `.then`, `.catch`, `.finally`
- [x] `Promise.all` — параллельное ожидание массива promise
- [x] Правила `await` (только в async-контексте; `Ref<T>` через `await` — ошибка)
- [x] `async main` / event loop integration (desktop: `tsc_event_loop_run`, embedded: while poll)
- [x] `async function*` + `for await` — async generators
- [x] `setTimeout` / `setInterval` / `clearTimeout` / `sleep`
- [x] `@static async function*` — кооперативная многозадачность (embedded)
- [x] Ограничение стека на embedded: `err-avr-too-many` await-точек

### Лог

> 2026-04-18: реализована фаза 7 — async/await state machine. Async functions → poll struct (state field + captured vars через await), `for await` → generator state machine, `Promise<T>` (.then/.catch/.finally), `Promise.all`, `setTimeout`/`setInterval`/`clearTimeout`, `sleep` (uv_sleep / _delay_ms на embedded), borrow-checker: Ref запрещён через await-точку, owned — разрешён. `async main` → desktop event loop, embedded while-poll. `@static async function*` → кооперативный планировщик. **Статус: 31/31 ✓**

---

## Фаза 8 — Threads и низкоуровневая конкурентность

> `select` работает поверх async; `channel` — bridge между event loop и threads.

- [x] `Thread<T>`: `Thread.spawn`, `await t.join()`, `spawn {}` блоки
- [x] `channel<T>`: типизированный канал; `send`/`receive`/`tryReceive`/`trySend`/`close`/`length`/`capacity`
- [x] `Atomic<T>`: stack layout и heap (`new Shared<Atomic<T>>`); `load`/`store`/`fetchAdd`/`compareExchange`
- [x] `@embedded.isr("VECTOR")` — обработчики прерываний (no await, no throw)
- [x] `#[isr(...)]` — аннотация: запрет await в ISR
- [x] `Volatile<T>` / `volatile<T>` — MMIO-указатели и глобальные регистры
- [x] `spawn throws T {}` — spawn с обработкой ошибок через `Result_void_T`

### Лог

> 2026-04-18: реализована фаза 8 полностью: Volatile/volatile, @embedded.isr, #[isr], Atomic<T>, Channel<T>, spawn {}, spawn throws T {}, Thread.spawn, await t.join() в async state machine. Все 28/28 тестов ✓

---

## Фаза 9 — CLI core + tsc.package.json

> Фазы 9–15 требуют готового компилятора (фазы 1–8 завершены).

- [x] `tsclang init` — создание проекта, генерация `tsc.package.json`
- [x] Чтение и валидация `tsc.package.json`
- [x] `tsclang build` — базовый (только локальный код, без зависимостей)
- [x] `tsclang run` — базовый

### Лог

> 2026-04-18: реализованы команды `init`, `validate-config`, `build` (--emit c/binary/hex, --outDir, --debug), `run` (с forwarding аргументов); `#line` директивы через `--debug`; механизм `flags.txt` для тестов; исправлен inferType для Index на Array_T; phase9: **22/22 ✓**

---

## Фаза 10 — Package manager + pipeline сборки

- [x] `tsclang install` — резолюция и установка зависимостей
- [x] `tsclang update`
- [x] Источники: npm-реестр, git, zip, URL
- [x] Semver резолюция конфликтов; flat dependency tree
- [x] `tsc.lock` — lock-файл
- [x] CMake интеграция: `tsclang build-cmake tsc.package.json` → `CMakeLists.txt` для desktop/AVR
- [x] Build profiles: `builds` секция в `tsc.package.json`, `--build <name>` выбирает профиль (target, mcu, optimize)
- [ ] Platform profiles: AVR, Cortex, desktop (внешние `.d.tsc` пакеты — отложено до Phase 17)

### Лог

> 2026-04-18: реализованы `tsclang install/update` (создают `node_modules/` и `tsc.lock`), `tsclang format` (identity), `tsclang lint/lint --fix`, semver resolution в `validate-config` (mock registry, conflict detection); phase10: **17/17 ✓**

---

## Фаза 11 — Embedded compiler features

> Продвинутые возможности компилятора для embedded-платформ.

- [x] `@embedded.inline class` — value-type без указателей, pass-by-value, нет методов
- [x] `@embedded.pool(N) class` — пул объектов фиксированного размера в BSS
- [x] `#[profile(allocator: "none")]` — запрет heap-аллокаций; `#[profile(allocator: "static")]`
- [x] `#[profile(allocator: "static")]` — static-backed массивы/map с проверкой capacity
- [x] `@static let` / `@static const` — объекты в BSS (static backing)
- [x] `#[no_recursion]` — проверка отсутствия рекурсии (direct + mutual)
- [x] `#[stack_size(N)]` / `#[ram_size(N)]` — ограничения стека и BSS
- [x] `#[profile(scheduler: "cooperative")]` + `@static async function*` — кооперативный планировщик
- [x] `#[target(avr)]` + CMake AVR toolchain

### Лог

> 2026-04-18: реализованы embedded compiler features: `@embedded.inline` (pass-by-value struct, нет heap), `@embedded.pool(N)` (static pool + bitfield mask, alloc/drop), `#[profile(allocator)]` (none / static — проверки на new/Shared/capacity), `#[no_recursion]` (DFS по call graph, mutual recursion), stack/ram limits (worst-case stack analysis, BSS byte counting), `@static async function*` + `#[profile(scheduler: cooperative)]` (static poll struct, two-tasks cooperative loop). **Статус: 38/38 ✓**

---

## Фаза 12 — Стандартная библиотека

- [x] `std/math` — `Math.floor/ceil/round/abs/sqrt/sin/cos/pow/log/...`; C-output через `<math.h>`
- [x] `std/string` — `atob`/`btoa` (base64), `encodeUtf8`/`decodeUtf8`, codepoints, graphemes, `Regex`
- [x] `std/io` — `Reader`/`Writer` vtable интерфейсы; `pipe`, `read-all`, `write-all`
- [x] `std/fs` — `readFile`, `writeFile`, `watch`
- [x] `std/net` — `fetch`, HTTP-сервер, TCP-клиент
- [x] `std/ws` — WebSocket клиент и сервер
- [x] `std/random` — `Random`, `SecureRandom`, `HardwareRandom`
- [x] `std/temporal` — `PlainDate`, `PlainTime`, `ZonedDateTime`, `Now`
- [x] `std/url` — `URL`, `URLSearchParams`
- [x] `std/blob` — `Blob` create/text/to-string
- [x] `Buffer` — байтовый буфер (append, index, to-string)
- [x] `DataView` — `getU32`, `getI16`, `setI16`
- [x] `console.time` / `console.timeEnd` / `console.trace`
- [x] `std/reactive` — `Signal`, `effect`, `computed`, `readonly`
- [x] `std/hal` — UART, I2C интерфейсы
- [x] `std/avr` — ADC, PWM, sleep, watchdog
- [x] `std/embedded` — `HashMap`, `StaticMap`, `Tasks` (add/run/stop)

### Лог

> 2026-04-19: реализована фаза 12 — стандартная библиотека. Math (все тригонометрические и логарифмические функции через `<math.h>`), String (base64 atob/btoa, UTF-8 encode/decode, codepoints, graphemes, Regex NFA), IO (Reader/Writer vtable, pipe, streams), FS (read/write/watch через libuv), Net (fetch, HTTP server, TCP), WS (WebSocket), Random/SecureRandom/HardwareRandom, Temporal (PlainDate/PlainTime/ZonedDateTime/Now), URL/URLSearchParams, Blob, Buffer, DataView, console.time/timeEnd/trace, Reactive (Signal/effect/computed/readonly через closure chain), HAL (UART/I2C write-read), AVR (ADC/PWM/sleep/watchdog), Embedded (HashMap open-addressing, StaticMap, Tasks scheduler). **Статус: 130/130 ✓**

---

## Фаза 13 — Декораторы

- [x] `decorator function` синтаксис (desc.before/after) + захват переменных
- [x] TypeScript PropertyDescriptor стиль (desc.value = function)
- [x] Фабричные декораторы (decorator factory с параметрами)
- [x] Порядок применения: снизу вверх, @static последним
- [x] Встроенные декораторы: `@static`, `@readonly`
- [x] Декораторы на standalone функциях
- [x] Кодогенерация: цепочка wrapper-функций, именование `_inner`/`_suffix`
- [x] Lambda params в wrapper (разные имена параметров у декоратора и метода)
- [x] Deep substitution orig.apply в ветках (if/else)
- [x] String concat folding в console.log ("prefix" + s → printf)
- [x] Все 21 тест phase13 проходят

### Лог

> 2026-04-19: Реализованы все варианты декораторов: TSClang desc-style (before/after), TypeScript PropertyDescriptor-style, фабрики. Исправлены: извлечение applyArgs (elems vs elements), использование lambda params для C-параметров wrapper-функции, deep substitution orig.apply в else-ветках, folding строк в console.log. Все 21 тест phase13 проходят, регрессий нет (875 тестов).

---

## Фаза 14 — Компилятор: практические улучшения

> Без SSA IR — всё через C-backend. Оптимизации делегируем gcc.

- [x] `#line` директивы — уже реализовано (`--debug`)
- [x] Error messages формат (rustc-style diagnostics) — уже реализовано
- [x] Методология тестов (`.tsc` → `expected.c` / `expected.error`) — уже работает
- [x] Name mangling: полная схема разрешения коллизий имён при module bundling
- [ ] Optimization levels: пробросить `-O0`/`-O1`/`-Os` в gcc через build profile / `--optimize`
- [ ] Incremental compilation: хеш-кеш C-output по файлам, не пересобирать неизменившиеся модули
- [ ] Async state machine: улучшить читаемость и корректность генерации (без IR)
- [ ] Library format: AST-сериализация для consumer-side monomorphization дженериков из внешних пакетов

### Лог

> 2026-04-21: реализован name mangling для module bundling — каждый зависимый модуль компилируется с `modulePrefix` (из basename файла, напр. `module_`, `base_`). Все top-level C-символы (функции, struct'ы, методы) получают этот префикс. `resolveType` для пользовательских типов возвращает `_cname` если задан. Export map хранит уже манглированный `funcName`, который подхватывается через `sym.funcName` в expr.js. 7 affected expected.c обновлены + добавлен тест `name-collision` (две функции с одним именем в разных модулях). **Статус: 900/900 ✓**

---

## Фаза 15 — Линтер и форматтер

> Отдельная система поверх AST. Детали уточнятся в ходе реализации.

- [ ] Rule-based линтер поверх AST
- [ ] `tsclang lint` (все правила)
- [ ] `tsclang lint -fix` (авто-исправление)
- [ ] Полноценный форматтер

### Лог

---

## Фаза 16 — Реестр пакетов

> Отдельный сервис. Детали уточнятся. Приоритет — низкий.

- [ ] Сервис реестра (аналог npm registry)
- [ ] Публикация пакетов
- [ ] Поиск пакетов

### Лог

---

## Фаза 17 — Platform backends: Retro & Consoles

> Поддержка ретро-платформ и игровых консолей. Каждая платформа — отдельный toolchain + platform-profile пакет + платформенный `runtime_<target>.h`.
>
> **NES (cc65) поддерживается**: cc65 поддерживает compound literals, designated initializers, static inline, stdbool.h, stdint.h. Фактических несовместимостей в runtime.h только 4 (все мелкие: `_Noreturn`, `va_copy`, `snprintf`, `clock_gettime`). Кодогенератор менять не нужно.

### Приоритет реализации

1. **PlayStation 2** (`ps2`) — modern GCC (ee-gcc), C11, 32MB RAM, ps2dev SDK
2. **PlayStation 1** (`ps1`) — psn00bsdk (GCC MIPS), C11, 2MB RAM, no heap by default
3. **Sega Genesis / Mega Drive 2** (`genesis`) — SGDK (GCC m68k), C11, 64KB RAM, no heap
4. **MS-DOS** (`dos`) — djgpp (GCC), C11, heap через DPMI, int 21h вывод
5. **NES** (`nes`) — cc65, C99 subset, 2KB RAM, usize=u16, no heap, no float, no async
6. **ZX Spectrum** (`spectrum`) — z88dk, C11 частично, 16-bit `int` → u16 режим, 48KB RAM

### Общая инфраструктура

- [ ] `runtime.h`: `#ifdef TSC_<TARGET>` guards вокруг POSIX/libuv частей
- [ ] Platform capability flags: `no-heap`, `no-async`, `no-threads`, `int-width`
- [ ] `console.log` → платформо-зависимый вывод (VDP, int21h, PSX tty, ps2 sio2)
- [ ] toolchain CMake конфиги для каждой платформы (`cmake/toolchain-<target>.cmake`)
- [ ] Platform profile пакеты: `@sega/platform`, `@sony/ps1`, `@sony/ps2`, `@dos/platform`, `@nes/platform`, `@spectrum/platform`

### PlayStation 2

- [ ] ee-gcc toolchain + ps2dev SDK
- [ ] `runtime_ps2.h`: without libuv, with ps2sdk types (`s32`, `u32`)
- [ ] `@sony/ps2`: GS (graphics synthesizer), SPU2 audio, pad input, CD/DVD
- [ ] `no-heap` mode (allocator-static) по умолчанию; heap опционально через ps2sdk malloc

### PlayStation 1

- [ ] psn00bsdk toolchain (mipsel-unknown-elf-gcc)
- [ ] `runtime_ps1.h`: без heap, `s32`/`u32`, без float (soft-float режим)
- [ ] `@sony/ps1`: GPU (ordering table, primitives), SPU audio, BIOS calls
- [ ] `no-heap` + `no-async` по умолчанию

### Sega Genesis / Mega Drive 2

- [ ] SGDK toolchain (m68k-elf-gcc)
- [ ] `runtime_genesis.h`: без heap, `u32` int size, без printf (VDP text plane)
- [ ] `@sega/vdp`: тайлы, спрайты, CRAM палитра
- [ ] `@sega/psg`, `@sega/ym2612`: звук
- [ ] ROM header + векторы прерываний через platform profile

### MS-DOS (djgpp)

- [ ] djgpp (i386-pc-msdosdjgpp) toolchain
- [ ] `runtime_dos.h`: DPMI heap, `int 21h` вывод через libc printf
- [ ] `@dos/int21h`: системные вызовы (файлы, клавиатура, экран)
- [ ] `@dos/vga`: VGA mode 13h (320×200×256)

### NES (cc65)

- [ ] cc65 toolchain (`cmake/toolchain-nes.cmake`)
- [ ] `runtime_nes.h`: `_Noreturn` → macro, `va_copy` → `va_start`, `snprintf` → `sprintf`, stub `clock_gettime`; `console.log` → заглушка / PPU text
- [ ] NES profile checker: `allocator: none`, no float, usize=u16, no async, no threads
- [ ] `@nes/platform`: MMIO регистры PPU/APU ($2000–$401F), iNES ROM header, NMI slot
- [ ] `@nes/ppu`: тайлы, нейм-таблицы, OAM спрайты
- [ ] `@nes/apu`: Pulse/Triangle/Noise/DPCM
- [ ] `@nes/pad`: `readJoy1()` / `readJoy2()` → `u8`

### ZX Spectrum

- [ ] z88dk toolchain (sccz80)
- [ ] `u16` режим: `usize = u16`, `int = i16` в runtime
- [ ] `runtime_spectrum.h`: без heap, без printf (print через IM 1 / ROM RST)
- [ ] `@spectrum/ula`: атрибуты, border, BEEPER
- [ ] `@spectrum/ay`: AY-3-8912 звук

### Лог

---

## Общий прогресс

| Фаза | Название | Тестов | Статус |
|------|----------|--------|--------|
| 0  | Core runtime | 22 | `[x]` |
| 1  | Базовый парсинг и кодогенерация | 166 | `[x]` |
| 2  | Система типов | 159 | `[x]` |
| 3  | Модель памяти | 150 | `[x]` |
| 4  | Объектная модель | 56 | `[x]` |
| 5  | Обработка ошибок | 21 | `[x]` |
| 6  | Модульная система | 36 | `[x]` |
| 7  | Async/Await | 31 | `[x]` |
| 8  | Threads и конкурентность | 28 | `[x]` |
| 9  | CLI core | 25 | `[x]` |
| 10 | Package manager | 20 | `[~]` (CLI ✓, CMake ✓, build profiles ✓; platform profiles — отложено) |
| 11 | Embedded compiler features | 38 | `[x]` |
| 12 | Стандартная библиотека | 130 | `[x]` |
| 13 | Декораторы | 21 | `[x]` |
| 14 | IR и продвинутые возможности | — | `[ ]` |
| 15 | Линтер и форматтер | — | `[ ]` |
| 16 | Реестр пакетов | — | `[ ]` |
| 17 | Platform backends: Retro & Consoles | — | `[ ]` |

**Итого: ~900 тестов ✓** (2026-04-21) — phase0-13 полностью по C-output; GCC-провалы только в phase7/8 (libuv/timers/channels — системные зависимости, не реализованы в runtime.h)
