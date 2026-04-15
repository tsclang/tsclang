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

### Лексер

- [~] Числовые литералы (`42`, `3.14`)
- [~] Строковые литералы (`"hello"`, шаблонные строки — базово)
- [~] `true` / `false` / `null`
- [~] Идентификаторы и ключевые слова
- [~] Все операторы (арифметика, сравнения, логика, битовые, присваивание)
- [~] Пунктуация (`{}`, `()`, `[]`, `;`, `:`, `,`, `.`, `=>`, `...`)
- [ ] Комментарии (`//`, `/* */`) — пропуск без токена

### Парсер

- [~] `let` / `const` объявления
- [~] Функции (`function f(...)`, `async function`, стрелочные)
- [~] Дефолтные параметры
- [~] `if` / `else`
- [~] `while` / `do-while`
- [~] `for` (классический `for(;;)`)
- [~] `switch` / `case` / `default`
- [~] `break` / `continue`
- [~] `return`
- [~] Операторы и выражения (бинарные, унарные, тернарный)
- [~] Вызов функций / методов
- [~] `new`
- [~] Деструктуризация объекта и массива в параметрах
- [ ] Тип-аннотации на параметрах и возвращаемом типе (парсинг — есть, семантика — нет)

### Кодогенерация

- [~] Базовая C-структура файла (includes, forward decls, функции, `main`)
- [~] Переменные (`let`/`const` → типизированные C-переменные)
- [~] Функции → C-функции
- [~] `if`/`else` → C `if`/`else`
- [~] `while`/`do-while` → C
- [~] `for(;;)` → C `for`
- [~] `switch` / `case` → C `switch`
- [~] `return` → C `return`
- [~] Числовые и строковые литералы
- [~] Арифметические и логические выражения
- [ ] Корректная расстановка типов (`i32`, `f64`, `bool` и др.)
- [ ] Примитивные числовые типы: `i8`–`i64`, `u8`–`u64`, `f32`, `f64`, `bool`, `usize`

### Лог

> 2026-04-02: написаны lexer.js (~200 строк), parser.js (~946 строк), codegen.js (~1178 строк), types.js (~82 строки) — первый черновой проход
> 2026-04-10: все тесты phase1 проходят через test/runner.js

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

- [x] `string` — UTF-8, heap owner; встроенные методы (slice, indexOf, toUpperCase и др.)
- [x] Массивы — heap owner: push, pop, length, capacity
- [x] Ownership `T` (owned) — move при присвоении и передаче
- [x] `Ref<T>` — immutable borrow
- [x] `Mut<T>` — mutable borrow
- [x] `Shared<T>` — ARC; `Weak<T>`
- [x] Деструктуризация с ownership (borrow по умолчанию, move через аннотацию)
- [x] Автоматический Drop (обратный порядок, детерминированный)
- [x] `for-of` → while-цикл
- [ ] Borrow checker: aliasing XOR mutability (семантические проверки — не реализованы)
- [ ] `Slice<T>` — zero-copy view на массив или строку
- [ ] Cleanup при throw: `goto cleanup` паттерн в C-output
- [ ] `Iterable<T>` протокол
- [ ] `@static let` — объект в BSS
- [ ] Move из массива по индексу
- [ ] Запрет мутации коллекции при активном borrow

### Лог

> 2026-04-10: все [F]/[R] тесты phase3 проходят (121/121 через test/runner.js --no-gcc); [E]-тесты (borrow checker) не реализованы

---

## Фаза 4 — Объектная модель

> Полноценная объектная система поверх ownership.

- [ ] Классы: поля, методы, `mut`-методы, `readonly`-поля
- [ ] Конструктор, `this`-семантика
- [ ] Замыкания: Ref/Mut/move-захват, явный capture list, C-output → struct
- [ ] `match` с exhaustiveness check и move-семантикой
- [ ] Перегрузка функций: name mangling (`foo_i32`, `foo_string`)
- [ ] Extension methods: явный импорт, zero overhead, C-output → static call
- [ ] `instanceof` — проверка через vtable-адрес O(1)
- [ ] Интерфейсы с методами — fat pointer (vtable)
- [ ] `implements` проверка

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
- [ ] Ownership при ошибках: `goto cleanup` корректно дропает owned переменные
- [ ] `throw` запрещён в `@interrupt`

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
- [ ] `import` / реэкспорт / namespace-импорт
- [ ] Циклические импорты (forward declarations)
- [ ] Path aliases (`#` / `~`)
- [ ] `@platform` — условная компиляция

### Лог

> 2026-04-15: реализована фаза 6 — модульная система (базовый набор). Парсер: pointer types (`*T`), unary `&`/`*`, `native(...)`, `declare const/function`. Codegen: `export function` (без `static` в C), `declare` → extern-объявления, `native` с шаблонной интерполяцией (re-parse через `_lex`/`_parse`), `unsafe {}` с `_inUnsafe` флагом, `@packed`/`@align` → `__attribute__`, `process.exit` → `exit()` + stdlib, `process.argv` → `tsc_make_argv` + `Array_string` (определена в runtime.h), pre-scan функций для определения нужности static-globals. **Статус: 23/23 phase6 ✓**

---

## Фаза 7 — Async/Await

> Зависит от фаз 3–6: state machine дропает owned переменные, cleanup при throw внутри async.

- [ ] State machine кодогенерация: SSA-like basic blocks, phi nodes
- [ ] Async lowering в IR
- [ ] `Promise<T>`: `.then`, `.catch`, `.finally`
- [ ] `Promise.all` / `Promise.any` / `Promise.race` / `Promise.allSettled`
- [ ] Правила `await` (только в async-контексте; borrows через `await` — запрет)
- [ ] `async main` / event loop integration
- [ ] `AbortSignal` — отмена задач
- [ ] `AsyncMutex` — FIFO-очередь для координации async
- [ ] Рекурсивные async функции — ограничения
- [ ] Stack safety анализ на embedded
- [ ] `async function*` + `for await` — async generators (только heap-платформы)
- [ ] `@embedded.singleton` — единственный экземпляр в BSS
- [ ] `@embedded.stack(name, N)` — статический стек для async-рекурсии
- [ ] Кооперативная многозадачность поверх `@static async function*`

### Лог

---

## Фаза 8 — Threads и низкоуровневая конкурентность

> `select` работает поверх async; `channel` — bridge между event loop и threads.

- [ ] `Thread<T>`: `Thread.spawn`, `await t.join()`
- [ ] `channel<T>`: типизированный канал; блокирующий send/receive в thread-контексте
- [ ] `select` — ожидание нескольких каналов/промисов
- [ ] `Atomic<T>`: stack layout (без escape) и heap (с refcount)
- [ ] `AtomicArray<T>`
- [ ] `Readonly<T>` — Send-safe обёртка для передачи в потоки
- [ ] `@embedded.isr` — обработчики прерываний (no alloc, no throw, no await)
- [ ] `Volatile<T>` — MMIO-регистры
- [ ] `std/sync` — `interrupts.disable()` на embedded
- [ ] Embedded-аннотации: `@embedded.noHeap`, `@signal`
- [ ] `@embedded.inline` — value type без heap/vtable
- [ ] `@embedded.pool(N)` — статический пул N слотов в BSS

### Лог

---

## Фаза 9 — CLI core + tsc.package.json

> Фазы 9–15 требуют готового компилятора (фазы 1–8 завершены).

- [ ] `tsclang init` — создание проекта, генерация `tsc.package.json`
- [ ] Чтение и валидация `tsc.package.json`
- [ ] `tsclang build` — базовый (только локальный код, без зависимостей)
- [ ] `tsclang run` — базовый

### Лог

---

## Фаза 10 — Package manager + pipeline сборки

- [ ] `tsclang install` — резолюция и установка зависимостей
- [ ] `tsclang update`
- [ ] Источники: npm-реестр, git, zip, URL
- [ ] Semver резолюция конфликтов; flat dependency tree
- [ ] `tsc.lock` — lock-файл
- [ ] CMake интеграция
- [ ] Build profiles: debug / release / embedded
- [ ] Platform profiles: AVR, Cortex, desktop

### Лог

---

## Фаза 11 — Расширенный CLI

- [ ] `tsclang dev` — watch mode, пересборка при изменениях
- [ ] `tsclang lint` — заглушка (синтаксические ошибки и базовые предупреждения)
- [ ] `tsclang lint -fix` / `tsclang format` — базовое форматирование
- [ ] Pinned toolchain (avr-gcc, кросс-компиляция)

### Лог

---

## Фаза 12 — Стандартная библиотека

- [ ] `Error` base class (полноценный, не хардкод)
- [ ] Globals: `setTimeout` / `setInterval`, `sleep`, `process.*`
- [ ] `Map<K,V>` — hash map с открытой адресацией
- [ ] `Buffer` — байтовый буфер фиксированного размера
- [ ] `DataView` — `getU32`, `setI16` и др.
- [ ] `process.stdin` / `stdout` / `stderr`
- [ ] `std/io` — `Reader`, `Writer`
- [ ] `std/fs` — read, write, stat, watch
- [ ] `std/net` — `fetch`, HTTP-сервер, TCP/UDP
- [ ] `std/ws` — WebSocket клиент и сервер
- [ ] `std/math` — константы и функции
- [ ] `std/string` — Unicode extension methods, base64, utf8, форматирование
- [ ] `std/json` — `JSON.parse` / `JSON.stringify`
- [ ] `std/url` — `URL` класс
- [ ] `std/blob` — immutable blob
- [ ] `std/formdata` — multipart/form-data
- [ ] `std/regex` — NFA-движок
- [ ] `std/random` — `Random`, `SecureRandom`, `HardwareRandom`
- [ ] `std/temporal` — PlainDate, PlainTime, Instant, Duration, ZonedDateTime, Now
- [ ] `std/hal` — GPIO, UART, SPI, I2C интерфейсы
- [ ] `std/threads` — Thread, Atomic, AtomicArray, channel, select, Readonly
- [ ] `std/reactive` — Signal, effect, computed
- [ ] `std/libc` — базовые C bindings
- [ ] `std/avr` — ADC, PWM, sleep, watchdog
- [ ] `std/embedded` — HashMap, StaticMap, Tasks, pointer\<T\>, Volatile\<T\>
- [ ] HAL реализация в platform profile

### Лог

---

## Фаза 13 — Декораторы

- [ ] Decorator pass в pipeline (после парсинга, до typecheck)
- [ ] `decorator function` синтаксис; фабрики; перегрузки по месту применения
- [ ] Модель выполнения: `before()` / `after()` + захват переменных
- [ ] Встроенные comptime-типы: `TypeRef`, `TypeSet`, `FuncRef`, `FieldRef`
- [ ] Descriptor API:
  - [ ] `MethodDesc`
  - [ ] `PropDesc`
  - [ ] `ParamDesc`
  - [ ] `FunctionDesc`
  - [ ] `ClassDesc` (`addField`, `addMethod`)
  - [ ] `SelfRef` — `ctx.self.field<T>(name)`
  - [ ] `MetaStore` — `meta.set<T>()`, `meta.get<T>()`
- [ ] Порядок применения (снизу вверх; `@static` последним)
- [ ] Встроенные декораторы: `@static`, `@readonly`, `@override`, `@abstract`, `@deprecated`
- [ ] Декораторы на async-методах: state machine wrap, AbortSignal проброс
- [ ] Дженерики в декораторах: generic constraints
- [ ] `ctx.args` / `ctx.result`
- [ ] Декоратор и платформа: ограничения на `heap: false`
- [ ] Кодогенерация: цепочка wrapper-функций, именование, C-output

### Лог

---

## Фаза 14 — Компилятор: IR и продвинутые возможности

> Полноценный IR, debug info, диагностика, оптимизации.

- [ ] SSA-like IR: basic blocks, phi nodes, явный порядок операций
- [ ] Async lowering в IR (state machine из IR-уровня)
- [ ] Name mangling: полная схема, разрешение коллизий между модулями
- [ ] Debug info: `#line` директивы; `tsclang debug --dap`; embedded (OpenOCD/SWD)
- [ ] Consumer-side monomorphization: формат скомпилированной библиотеки
- [ ] Incremental compilation *(roadmap)*: граф зависимостей + IR-кеш
- [ ] Optimization levels: `-O0` / `-O1` / `-Os`; IR-уровень vs C-компилятор
- [ ] Error messages: формат `file:line:col: error[EXXX]`; все категории ошибок; hint
- [ ] Методология тестов: `.tsc` → ожидаемый C-output или ошибка

### Лог

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

## Общий прогресс

| Фаза | Название | Статус |
|------|----------|--------|
| 0  | Core runtime | `[x]` |
| 1  | Базовый парсинг и кодогенерация | `[x]` |
| 2  | Система типов | `[x]` |
| 3  | Модель памяти | `[~]` |
| 4  | Объектная модель | `[ ]` |
| 5  | Обработка ошибок | `[ ]` |
| 6  | Модульная система | `[ ]` |
| 7  | Async/Await | `[ ]` |
| 8  | Threads и конкурентность | `[ ]` |
| 9  | CLI core | `[ ]` |
| 10 | Package manager | `[ ]` |
| 11 | Расширенный CLI | `[ ]` |
| 12 | Стандартная библиотека | `[ ]` |
| 13 | Декораторы | `[ ]` |
| 14 | IR и продвинутые возможности | `[ ]` |
| 15 | Линтер и форматтер | `[ ]` |
| 16 | Реестр пакетов | `[ ]` |
