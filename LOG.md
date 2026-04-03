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

---

## Фаза 2 — Система типов

> Компилятор понимает типы, генерирует корректные C-структуры.

- [ ] Type inference (вывод типа из литерала и выражения)
- [ ] `null` / `T | null` → nullable C-представление
- [ ] Type aliases (`type Foo = ...`) — без методов
- [ ] `interface` — без методов, структурная типизация
- [ ] `as` оператор — явное приведение типа
- [ ] Enum: числовой, строковый, `const enum`
- [ ] Generics — монорфизация (без ownership-aware bounds)
- [ ] Числовые автокасты
- [ ] String Literal Union → C enum + rodata таблица
- [ ] Tuples: базовые `[A, B, C]`, labeled, readonly, optional, rest
- [ ] Utility Types: `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`
- [ ] `keyof`
- [ ] Специальные типы: `any`, `never`, `void`, `unknown`

### Лог

---

## Фаза 3 — Модель памяти

> Borrow checker работает; C-output безопасен по памяти.

- [ ] `string` — UTF-8, heap owner; встроенные методы (slice, indexOf, toUpperCase и др.)
- [ ] Массивы — heap owner: push, pop, length, capacity
- [ ] `Slice<T>` — zero-copy view на массив или строку
- [ ] Ownership `T` (owned) — move при присвоении и передаче
- [ ] `Ref<T>` — immutable borrow
- [ ] `Mut<T>` — mutable borrow
- [ ] Borrow checker: aliasing XOR mutability, scope-based lifetime
- [ ] Cleanup при throw: `goto cleanup` паттерн в C-output
- [ ] `Shared<T>` — ARC; `Weak<T>`
- [ ] Деструктуризация с ownership (borrow по умолчанию, move через аннотацию)
- [ ] Автоматический Drop (обратный порядок, детерминированный)
- [ ] `Iterable<T>` протокол: `iter(): mut () => T | null`
- [ ] `for-of` → while-цикл через `Iterable<T>`
- [ ] Generics апгрейд: move-семантика при `T` = owned type
- [ ] `@static let` — объект в BSS, правила borrow checker
- [ ] Move из массива по индексу
- [ ] Запрет мутации коллекции при активном borrow
- [ ] `Ref<T>` / `Mut<T>` в полях класса — запрет

### Лог

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

---

## Фаза 5 — Обработка ошибок

> Зависит от фазы 3: cleanup при throw требует знания owned переменных.

- [ ] `throws` в сигнатуре функции; вывод типа ошибки компилятором
- [ ] `throw` — только наследник `Error`; примитивы — ошибка компилятора
- [ ] `try` / `catch` / `finally`
- [ ] Несколько `catch`-блоков; union catch
- [ ] Union errors: `throws IOError | NetworkError`
- [ ] Оператор `?` — propagate ошибки вверх
- [ ] Оператор `!` — unwrap с паникой
- [ ] C-output: Result-struct (tagged union ok/err)
- [ ] Ownership при ошибках: `goto cleanup` корректно дропает owned переменные
- [ ] `throw` запрещён в `@interrupt`

### Лог

---

## Фаза 6 — Модульная система

- [ ] `import` / `export` (только именованные; `export default` — ошибка)
- [ ] Реэкспорт
- [ ] Namespace-импорт
- [ ] Циклические импорты — разрешены через forward declarations
- [ ] Порядок инициализации модулей (детерминированный)
- [ ] Точка входа (5 правил приоритета: конфиг → `main.tsc` → ...)
- [ ] Генерация C `main()` и `async main` + event loop
- [ ] C interop: `extern "C"`, `.d.tsc` файлы
- [ ] `Scalar` тип для variadic C-функций
- [ ] Path aliases (`#` / `~` в `paths`)
- [ ] Declaration merging
- [ ] `native` — inline C
- [ ] `unsafe {}` — отключение проверок TSClang
- [ ] `@platform` — условная компиляция

### Лог

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
| 1  | Базовый парсинг и кодогенерация | `[~]` |
| 2  | Система типов | `[ ]` |
| 3  | Модель памяти | `[ ]` |
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
