# TSClang — Спецификация и фазы реализации

## Разделы

Спецификация языка разбита на разделы. Читай нужный раздел напрямую.

| Файл | Содержимое |
|------|-----------|
| [spec/01-intro.md](spec/01-intro.md) | Зачем, дизайн-философия, overview, установка |
| [spec/02-syntax.md](spec/02-syntax.md) | Синтаксис, операторы, управляющие конструкции |
| [spec/03-types.md](spec/03-types.md) | Система типов, generics, классы, enum |
| [spec/04-memory.md](spec/04-memory.md) | Ownership, borrow checker, замыкания, итераторы |
| [spec/05-errors.md](spec/05-errors.md) | Обработка ошибок, throws, try/catch |
| [spec/06-concurrency.md](spec/06-concurrency.md) | Async/await, threads, embedded concurrency |
| [spec/07-modules.md](spec/07-modules.md) | Модульная система, C interop, .d.tsc |
| [spec/08-build.md](spec/08-build.md) | Система сборки, CLI, package manager |
| [spec/09-stdlib.md](spec/09-stdlib.md) | Стандартная библиотека |
| [spec/10-compiler.md](spec/10-compiler.md) | Архитектура компилятора, IR, методология тестов |

---

## Оглавление с кратким описанием каждого раздела и порядок реализации.

### Блок 1: Введение

| Раздел | О чём |
|--------|-------|
| **Зачем** | Мотивация: TS-разработчики упираются в C, нужен язык с TS-синтаксисом, C-бэкендом и моделью безопасности Rust. |
| **Для чего** | Целевые области по приоритету: сервер → десктоп → системный уровень → embedded → игры → ретро. |
| **Дизайн-философия** | Иерархия приоритетов (безопасность памяти → производительность → TS-синтаксис) и принцип: TS-разработчик должен чувствовать себя дома. |
| **Overview** | Краткое техническое описание: расширение `.tsc`, CLI `tsclang`, выход `.c/.h + CMakeLists.txt`. |
| **Установка** | Требования (Node, CMake, gcc/clang/avr-gcc) и команды npm-установки CLI. |

### Блок 2: Синтаксис

| Раздел | О чём |
|--------|-------|
| **Форматирование** | Форматирование — никогда не ошибка компилятора; правила пробелов, кавычек, ASI, отступов; `tsclang lint`. |
| **Переменные** | `let` — мутабельная, `const` — иммутабельная; влияет на передачу как `Mut<T>` и вызов `mut`-методов. |
| **Функции** | Объявление, стрелочные функции, возвращаемые типы, вывод типа. |
| **Перегрузка функций** | Перегрузка по типам и количеству параметров; C-output через name mangling (`foo_i32`, `foo_string`). |
| **Ограничение: extern "C" запрещает перегрузку** | `extern "C"` функции не могут быть перегружены — манглинг невозможен. |
| **Дефолтные параметры** | Синтаксис и C-output для параметров по умолчанию. |
| **Семантика передачи значений** | Примитивы копируются, сложные типы — move/borrow в зависимости от аннотации. |
| **Операторы** | Арифметика, присваивание, сравнения, логика, битовые, прочие; таблица приоритетов. |
| **Truthy / Falsy** | Правила неявного приведения к boolean (отличия от JS). |
| **Индексация и срезы** | Синтаксис `arr[i]`, `arr[a..b]` для массивов и строк. |
| **const vs let** | Подробная семантика иммутабельности и ограничения `const`. |
| **for-of цикл** | Итерация по массивам и строкам; семантика `item` внутри цикла. |
| **while / do-while** | Циклы с условием; `async/await` внутри циклов. |
| **switch / case** | Ветвление по значению; fallthrough запрещён. |
| **match** | Паттерн-матчинг с exhaustiveness check; fat-pointer matching и discriminated union. |
| **Spread оператор** | `...arr` для массивов и объектов; правила ownership при spread. |

### Блок 3: Система типов

| Раздел | О чём |
|--------|-------|
| **Типизация** | Структурная (`type`, `interface`) vs номинальная (`class`); объектные литералы; `as`; type inference. |
| **Числовые типы** | Полный набор i8..i64, u8..u64, f32, f64; правила автокаста. |
| **usize** | Платформенный тип размера (`size_t`): 64 бит на desktop, 16 на AVR. |
| **Конвертация типов** | Число↔строка; JS-совместимые глобальные функции (`parseInt`, `parseFloat`). |
| **Строки** | UTF-8 байтовый массив; индексация возвращает `u8`; встроенные методы; `std/string` extensions. |
| **Специальные типы** | `any`, `never`, `void`, `unknown` — семантика и ограничения. |
| **Null** | Nullable типы (`T | null`); optional chaining `?.`; `??` оператор. |
| **Generics** | Монорфизация; bounds через `implements`/`extends`; ownership с generic-параметрами. |
| **Extension Methods** | Добавление методов к существующим типам через явный импорт; zero-overhead C-output. |
| **Type Aliases** | `type UserId = i32` (opaque/номинальный) vs `type Point = { ... }` (структурный). |
| **Enum** | Числовой, строковый, `const enum`; утилиты; switch/match с enum. |
| **Интерфейсы** | Структурная типизация; fat pointer (vtable) при наличии методов; `implements`. |
| **instanceof** | Проверка типа через сравнение vtable-адресов O(1); только для interface-переменных. |
| **Классы** | Номинальная типизация; `mut`-методы; `readonly`-поля; наследование только от `Error`. |
| **Семантика `this` и доступ к полям** | Правила `self`/`this`; доступ к полям внутри методов; разрешение неоднозначности. |
| **Date** | Legacy JS-совместимый API (0-indexed месяцы); для нового кода — `std/temporal`. |
| **Массивы и коллекции** | Динамические массивы (capacity/length); `Slice<T>` zero-copy view; `Map<K,V>`; `Set`; `Object`. |
| **Clone** | Явное клонирование owned значений; `clone()` метод. |

### Блок 4: Модель памяти

| Раздел | О чём |
|--------|-------|
| **Типы владения** | Таблица: `T` (owner), `Ref<T>`, `Mut<T>`, `Shared<T>` (ARC), `Weak<T>`, `Slice<T>` — и их C-представления. |
| **Базовые правила** | Примитивы копируются; сложные типы управляются ownership; `string` — heap-allocated owner. |
| **Owner (T)** | Move при присвоении и передаче в функцию; после move исходная переменная невалидна. |
| **Ref\<T\>** | Immutable borrow; запрещён в полях класса; разрешён в замыканиях; view-паттерн через параметры методов. |
| **Mut\<T\>** | Mutable borrow; только один `Mut` одновременно. |
| **Shared\<T\>** | ARC (atomic refcount); только desktop/server; строго read-only; не требует interior mutability. |
| **Правила Borrow Checker** | Aliasing XOR mutability; scope-based lifetime без явных аннотаций. |
| **Правила передачи аргументов** | Таблица: что передаётся при разных комбинациях caller/callee ownership. |
| **Interior Mutability** | Почему её нет: event loop однопоточен, actor-паттерн через `Channel`, `Atomic<T>` для счётчиков. |
| **Scope Constraint** | Автоматические lifetime ограничения: borrow не может пережить владельца. |
| **Автоматический Drop** | Детерминированное освобождение в обратном порядке объявления; нет GC. |
| **Cleanup при throw** | `goto cleanup` паттерн в C-output: O(N+M) вместо дублирования, все указатели NULL-инициализированы. |
| **Доступ к полям и деструктуризация** | Borrow по умолчанию; move при явной аннотации типа; match всегда move. |
| **Срезы** | `Slice<T>` как zero-copy view на часть массива или строки; правила lifetime. |
| **Move из массива** | Семантика `arr[i]` как move; borrow через `arr[i]` как `Ref`. |
| **Мутация коллекции при borrow** | Запрет: активный borrow блокирует мутацию коллекции. |
| **Возврат borrow из метода** | Lifetime constraint: возвращаемый `Ref` не может пережить `self`. |
| **Borrows в полях класса** | `Ref<T>` как поле класса запрещён; `Mut<T>` в полях — тоже. |
| **Замыкания** | Правила захвата (примитивы — copy, сложные — `Ref`); явный capture list; C-output — struct. |
| **Iterable\<T\>** | Протокол: `iter(): mut () => T | null`; `for...of` → while-цикл; работает на embedded. |

### Блок 5: Обработка ошибок

| Раздел | О чём |
|--------|-------|
| **Принцип** | `throws` в сигнатуре; компилируется в Result-struct в C, без `setjmp/longjmp`; zero-cost. |
| **Объявление с throws** | Синтаксис `function f(): T throws E`; компилятор может вывести автоматически. |
| **throw** | Бросается только наследник `Error`; примитивы и произвольные классы — ошибка компилятора. |
| **try / catch / finally** | TS-синтаксис; несколько catch-блоков; union catch; `finally` всегда выполняется. |
| **Union errors** | Функция бросает несколько типов: `throws IOError | NetworkError`. |
| **Оператор `?`** | Propagation ошибки вверх: сокращение для `try { } catch { throw }`. |
| **Оператор `!`** | Unwrap с паникой при ошибке; для случаев "этого не должно произойти". |
| **C-output** | Как Result-struct выглядит в C; tagged union с ok/err полями. |
| **Ownership при ошибках** | Owned переменные освобождаются корректно при throw через `goto cleanup`. |
| **Ограничения** | `throw` запрещён в `@interrupt` обработчиках; в `Thread.spawn` — особая семантика. |

### Блок 6: Конкурентность

| Раздел | О чём |
|--------|-------|
| **Уровни модели** | Три механизма: async/await (все платформы), threads (desktop), @interrupt (embedded). |
| **Async runtime** | Event loop → state machines в C → Runtime Interface → libuv / io_uring / poll loop. |
| **State machine size** | Компилятор минимизирует struct: только live переменные через await; статический анализ stack. |
| **Promise\<T\>** | Базовый тип async-значения; `.then/.catch/.finally`; как работает под капотом. |
| **Promise.all / any / race / allSettled** | Комбинаторы: семантика, C-output, типизация ошибок. |
| **Правила await** | Где можно/нельзя использовать `await`; async propagation. |
| **async main** | Entry point с event loop; top-level `await`. |
| **Рекурсивные async** | Ограничения; риски стека на embedded. |
| **AbortSignal** | Отмена задач; `atomic_bool` на desktop vs `bool` на embedded; callbacks через event loop. |
| **Threads (std/threads)** | OS-потоки; блокирующая модель; изолированы от event loop. |
| **Atomic\<T\>** | Атомарные операции; два layout: stack (без escape) и heap (с refcount). |
| **AtomicArray\<T\>** | Массив с атомарным доступом к элементам. |
| **channel\<T\>** | Типизированный канал между потоками; блокирующий send/recv в thread-контексте. |
| **select** | Ожидание нескольких каналов/промисов; type-safe через match; только async-контекст. |
| **Readonly\<T\>** | Send-safe обёртка для передачи данных в потоки; рекурсивная проверка полей. |
| **Thread\<T\>** | Типизированный результат `Thread.spawn`; `await t.join()`. |
| **@embedded.isr** | Embedded: обработчики прерываний (`@embedded.isr`); запреты (no alloc, no throw, no await). |
| **Volatile\<T\>** | MMIO регистры; гарантирует отсутствие оптимизации компилятором. |
| **std/sync** | Критические секции на embedded: `interrupts.disable()`. |
| **Embedded-аннотации** | `@embedded.inline`, `@embedded.noHeap`, `@signal` — fine-grained контроль над поведением на embedded. |
| **@platform** | Декоратор условной компиляции: платформо-зависимые реализации одной функции/класса. |
| **Итоговая картина** | Сводная схема всей модели конкурентности: async, threads, embedded, связи между ними. |

### Блок 7: Модульная система

| Раздел | О чём |
|--------|-------|
| **Конвенции** | Соглашения по именованию файлов и модулей. |
| **Export** | Только именованные экспорты; `export default` запрещён; реэкспорт. |
| **Import** | ES-синтаксис; namespace-импорт (`import X from "./m"` = namespace); циклические импорты разрешены. |
| **Порядок инициализации** | Детерминированный порядок init модулей; решение circular deps через forward declarations. |
| **Точка входа** | 5 правил приоритета: конфиг → `main.tsc` → единственный файл → без export → библиотека. |
| **Библиотека** | Как объявить проект библиотекой; нет entry point. Четыре типа проектов: executable, library, C-wrapper, platform profile. |
| **Генерация C main** | Как TSC генерирует `main()` в C; `async main` запускает event loop. |
| **.d.tsc файлы** | C interop: `declare type`, `declare opaque type`, `declare function`; три вида деклараций. |
| **Scalar** | Тип для variadic C-функций (`printf`); `...args: Scalar[]`. |
| **Path Aliases** | `#` / `~` aliases в `paths` (tsc.package.json); почему не `@`; wildcard; разрешённые символы; приоритет резолюции. |
| **Declaration Merging** | Расширение деклараций без замены; augmentation паттерн. |
| **Inline C (`native`)** | Вставка C-кода напрямую в TSC; когда использовать. |
| **`unsafe {}`** | Отключение проверок TSClang (borrow checker, null checks); эскейп хетч. |

### Блок 8: Система сборки

| Раздел | О чём |
|--------|-------|
| **Build Profiles** | debug / release / embedded; пользовательские профили; флаги оптимизации. |
| **tsc.package.json** | Главный конфиг: поля верхнего уровня, зависимости, targets. |
| **Поля build конфига** | Детальные поля конфигурации сборки. |
| **Platform Profile** | AVR/Cortex/desktop-специфичные настройки: stack_size, MCU, частота. |
| **Полная таблица платформ** | Справочная таблица всех поддерживаемых платформ (Desktop, Mobile, Embedded, Retro, Consoles). |
| **declare library** | Требования библиотеки к платформе: поля `declare library`, проверка совместимости при установке. |
| **Pipeline сборки** | Шаги: parse → typecheck → IR → ownership → codegen → cmake → build. |
| **CLI команды** | `build`, `run`, `dev`, `init`, `install`, `update`, `lint`, `format` — описание и флаги. |
| **tsclang install vs update** | Разница: install фиксирует версии, update обновляет. |
| **Источники зависимостей** | npm-реестр, git, zip-архив, URL — все варианты вместе. |
| **devDependencies** | Зависимости разработки; не попадают в пакет; не устанавливаются с `--production`. |
| **Версионирование** | Semver-строки (`^`, `~`, `>=`). |
| **Резолюция semver-зависимостей** | Алгоритм резолюции конфликтов версий; flat dependency tree. |
| **Flat dependency tree** | Одна версия каждого пакета; конфликты — ошибка компилятора. |
| **Структура lock-файла** | Формат `tsc.lock`; фиксация точных версий для воспроизводимых сборок. |
| **Кеш** | Локальный кеш установленных пакетов; инвалидация. |
| **Consumer-side monomorphization** | Generic-код из зависимостей компилируется в consumer, не в библиотеке. |
| **Реестр** | Как работает пакетный реестр TSClang (`registry.tsclang.org`). |

### Блок 9: Стандартная библиотека

| Раздел | О чём |
|--------|-------|
| **Принципы** | Общие принципы stdlib: что входит, что выносится в реестр, платформенная доступность. |
| **Error** | Базовый класс `Error { message: string }`; C-output через struct с первым полем. |
| **Globals** | `console`, `setTimeout/setInterval`, `sleep`, `performance.now`, `process.*` — без импорта. |
| **Map\<K,V\>** | Hash map с открытой адресацией; ownership для значений; запрещён на embedded. |
| **Buffer** | Байтовый буфер фиксированного размера; основа для I/O. |
| **DataView** | Типизированный чтение/запись в Buffer: `getU32`, `setI16` и т.д. |
| **process.stdin/stdout/stderr** | Стандартные потоки; только desktop/server. |
| **Совместимость с платформами** | Таблица: что доступно на desktop vs embedded. |
| **Официальные пакеты в реестре (`@tsc/*`)** | C-wrappers для популярных C-библиотек: sqlite3, openssl, curl, zlib. |
| **std/io** | Базовые I/O абстракции: `Reader`, `Writer`. |
| **std/fs** | Файловая система: read, write, stat, watch. |
| **std/net** | `fetch` (глобальный); HTTP сервер; TCP/UDP сокеты. |
| **std/ws** | WebSocket клиент и сервер. |
| **std/math** | Математические константы (π, e, ...) и функции (sin, cos, sqrt, ...). |
| **std/string** | Unicode extension methods; Regex; кодирование (base64, utf8); форматирование. |
| **std/random** | `Random(seed)` (все платформы); `SecureRandom` (desktop); `HardwareRandom` (embedded). |
| **std/temporal** | PlainDate, PlainTime, PlainDateTime, Instant, Duration, ZonedDateTime, Now. |
| **std/threads** | Экспорты: Thread, Atomic, AtomicArray, channel, select, Readonly. |
| **std/hal** | Hardware Abstraction Layer: GPIO, UART, SPI, I2C — платформонезависимые интерфейсы; реализуется в platform profile. |
| **std/reactive** | `Signal<T>`, `effect`, `computed` — реактивный граф зависимостей. |
| **std/libc** | Базовые C bindings (printf, malloc, memcpy и др.); subset определяется platform profile. |
| **std/avr** | AVR-специфичные утилиты: ADC, PWM, sleep, watchdog. |
| **std/embedded** | Общие embedded утилиты поверх `std/hal`; работают на любой embedded платформе. |
| **HAL реализация в platform profile** | Как platform profile предоставляет конкретные реализации интерфейсов `std/hal`. |

### Блок 10: Компилятор

| Раздел | О чём |
|--------|-------|
| **Фазы компиляции** | Parse → AST → Typecheck → Lower to IR → Ownership Analysis → Codegen. |
| **IR** | Линейное IR между AST и C: явный порядок операций, простые проверки для borrow checker. |
| **Методология тестов** | Формат тест-корпуса: входной `.tsc` → ожидаемый C-output или ошибка компилятора. |

---

## Фазы реализации

### Навигация фаза → блоки

| Фаза | Что читать выше |
|------|----------------|
| 0  | Блок 9: Error, Globals |
| 1  | Блок 2 (кроме match, for-of) |
| 2  | Блок 3 (кроме строк, массивов, коллекций, Clone) |
| 3  | Блок 4 + из Блока 3: Строки, Массивы и коллекции, Clone |
| 4  | Блок 2: match; Блок 3: Классы, Интерфейсы, Extension Methods, instanceof; Блок 4: Замыкания |
| 5  | Блок 5 (целиком) |
| 6  | Блок 7 (целиком) |
| 7  | Блок 6: Уровни модели, Async runtime, State machine size, Promise, Правила await, async main, Рекурсивные async, AbortSignal |
| 8  | Блок 6: Уровни модели, Threads, Atomic, AtomicArray, channel, select, Readonly, @embedded.isr, Volatile, std/sync, Embedded-аннотации |
| 9  | Блок 8: tsc.package.json, CLI команды (init/build/run) |
| 10 | Блок 8: Pipeline сборки, Источники зависимостей, Версионирование |
| 11 | Блок 8: CLI команды (dev/lint/format), Platform Profile |
| 12 | Блок 9 (целиком); `std/threads` читать как API поверх механизма из фазы 8 |
| 13 | Блок 10: Фазы компиляции, IR, Методология тестов |
| 14 | Блок 8: Реестр |

### Фаза 0 — Core runtime

Минимальная инфраструктура для тестирования компилятора с первых шагов.

- `console.log` и базовый I/O — хардкод в компиляторе
- Заглушки базовых типов (без ownership, для отладки кодогенерации)
- Базовый `Error` — хардкод (нужен в фазе 5, не ждём stdlib)

### Фаза 1 — Базовый парсинг и кодогенерация

Компилятор транслирует простой процедурный код в C.

- Лексер и парсер
- Переменные (`let`, `const`), операторы, выражения
- Примитивные типы (`i8`–`i64`, `u8`–`u64`, `f32`, `f64`, `bool`, `usize`)
- Функции (без перегрузки)
- Управляющие конструкции (`if`/`else`, `while`, `switch`)
- Базовая кодогенерация C

> `for-of` — в фазе 3: нуждается в массивах и строках (heap owners).
> `match` — в фазе 4: нуждается в move-семантике и exhaustiveness check.

### Фаза 2 — Система типов

Компилятор понимает типы, генерирует корректные C-структуры.

- Type inference
- `null` / `T | null`
- Type aliases (`type`, `interface` без методов)
- Enum
- Generics — монорфизация (без ownership-aware bounds)
- Числовые автокасты, оператор `as`

### Фаза 3 — Модель памяти

Borrow checker работает; C-output безопасен по памяти. Строки и массивы
реализованы полноценно — они heap-allocated owners. `for-of` реализован
поверх `Iterable<T>`.

- Строки (`string` — UTF-8, heap owner)
- Массивы (heap owner)
- Ownership: T (owned), `Ref<T>`, `Mut<T>`, move семантика
- Borrow checker
- Cleanup / goto pattern в C-output
- `Shared<T>`, `Weak<T>` (ARC)
- Деструктуризация с ownership
- `Iterable<T>` протокол (`iter(): mut () => T | null`)
- `for-of` → while-цикл через `Iterable<T>`
- Generics апгрейд: монорфизация из фазы 2 расширяется для корректной обработки move-семантики при T = owned type (string, массив, класс)

### Фаза 4 — Объектная модель

Полноценная объектная система поверх ownership.

- Классы (методы, `mut`, `readonly`)
- Замыкания (включая `Ref<T>`/`Mut<T>`/move-захват)
- `match` с exhaustiveness checking и move семантикой
- Перегрузка функций (name mangling)
- Extension methods (явный импорт, zero overhead)
- `instanceof` (номинальная проверка для классов)

### Фаза 5 — Обработка ошибок

Зависит от фазы 3: корректный cleanup при throw требует знания owned переменных.

- `throws` / `try` / `catch` / `finally`
- Оператор `?` (propagate) и `!` (assert non-null)
- Result-struct C-output

### Фаза 6 — Модульная система

- `import` / `export`
- Entry point
- C interop: `extern "C"`, `.d.tsc`, `native`, `unsafe`

### Фаза 7 — Async/Await

Зависит от фаз 3–6: state machine должна корректно дропать owned переменные,
cleanup при throw внутри async; `async main` нуждается в entry point из фазы 6.

- State machine кодогенерация
- `Promise<T>`, комбинаторы (`all`, `race`, `any`, `allSettled`)
- `AbortSignal`
- `async main` / event loop integration
- Stack safety анализ на embedded

### Фаза 8 — Threads и низкоуровневая конкурентность

`select` работает поверх async; `channel` — bridge между event loop и threads.

- `std/threads`: `Thread<T>`, `channel<T>`, `select`
- `Atomic<T>`, `AtomicArray<T>`, `Readonly<T>`
- `@embedded.isr`, `Volatile<T>`, `std/sync`, Embedded-аннотации (embedded)

### Фаза 9 — CLI core + tsc.package.json

> Фазы 9–14 требуют готового компилятора (фазы 1–8 завершены).

Можно создать проект и скомпилировать его без единой зависимости.

- `tsclang init` — создание проекта, генерация `tsc.package.json`
- Чтение и валидация `tsc.package.json` (поля, targets, platform profile)
- `tsclang build` (базовый — только локальный код, без зависимостей)
- `tsclang run` (базовый)

### Фаза 10 — Package manager + pipeline сборки

Полноценная сборка проекта с зависимостями.

- `tsclang install` — резолюция и установка зависимостей
- `tsclang update`
- Источники: npm-реестр, git, zip, URL
- Semver резолюция конфликтов
- CMake интеграция
- Build profiles (debug / release / embedded)
- Platform profiles (AVR, Cortex, desktop)

### Фаза 11 — Расширенный CLI

- `tsclang dev` (watch mode, пересборка при изменениях)
- `tsclang lint` (заглушка: только синтаксические ошибки и базовые предупреждения)
- `tsclang lint -fix` / `tsclang format` (базовое форматирование)
- Pinned toolchain (avr-gcc, кросс-компиляция)
- Прочие продвинутые флаги

> Полноценный rule-based линтер — в фазе 13.

### Фаза 12 — Стандартная библиотека

Строится поверх всего предыдущего. Детали определяются по ходу реализации.

### Фаза 13 — Линтер и форматтер

> Большая отдельная система, детали не определены. Вернёмся позже.

Предварительно: отдельное приложение / набор правил поверх AST компилятора.
Полноценный rule-based линтер поверх заглушки из фазы 11.
Включает `tsclang lint` (все правила) и `tsclang lint -fix` (авто-исправление).

### Фаза 14 — Реестр пакетов

> Большая отдельная система, детали не определены. Вернёмся позже.

Предварительно: отдельный сервис (аналог npm registry) для публикации и
поиска TSClang-пакетов.
