# TSClang — Спецификация и фазы реализации

## Разделы

Спецификация языка организована по логическим слоям в `spec/`.

| Раздел | Содержимое |
|--------|-----------|
| [01-intro](spec/01-intro/) | Зачем, дизайн-философия, overview, установка |
| [02-syntax](spec/02-syntax/) | Синтаксис: форматирование, переменные, операторы, truthy/falsy |
| [03-types](spec/03-types/) | Типы: числа, строки, null, enum, Date, Type Aliases, конвертация, special types |
| [04-ownership](spec/04-ownership/) | Ownership, borrow checker, Clone, Shared/Weak, const vs let |
| [05-control-flow](spec/05-control-flow/) | Управляющие конструкции: match, switch, for-of, while |
| [06-functions](spec/06-functions/) | Функции: перегрузка, name mangling, closures, extension methods, extern "C", default params |
| [07-classes](spec/07-classes/) | Классы: generics, интерфейсы, instanceof, this, packed/align |
| [08-collections](spec/08-collections/) | Массивы, tuples, slices, spread/destructuring |
| [09-errors](spec/09-errors/) | Обработка ошибок: throws, try/catch, cleanup |
| [10-async](spec/10-async/) | Async/await: state machines, Promise, AbortSignal, AsyncMutex, async generators, @static generators, @stack |
| [11-concurrency](spec/11-concurrency/) | Threads, Atomic, channel, ISR, Volatile, std/sync, embedded annotations |
| [12-modules](spec/12-modules/) | Модульная система, C interop, .d.tsc, @platform, import/export |
| [13-build](spec/13-build/) | Система сборки, CLI, tsc.package.json, package manager, embedded inline/pool |
| [14-stdlib](spec/14-stdlib/) | Стандартная библиотека (IO, FS, Net, WS, HAL, AVR, Reactive, Regex) |
| [15-decorators](spec/15-decorators/) | Декораторы: синтаксис, Descriptor API, codegen |
| [16-tooling](spec/16-tooling/) | Компилятор, IR, LSP, Linter, Оптимизатор |
| [17-migration](spec/17-migration/) | Migration guide: TypeScript → TSClang |

Маппинг тестовых фаз → разделы: [spec/PHASES.md](spec/PHASES.md).
Лог миграции spec → spec: [spec/PROGRESS.md](spec/PROGRESS.md).

---

## Оглавление

### 01 — Введение ([spec/01-intro/](spec/01-intro/))

| Раздел | О чём |
|--------|-------|
| **Зачем** | Мотивация: TS-разработчики упираются в C, нужен язык с TS-синтаксисом, C-бэкендом и моделью безопасности Rust. |
| **Для чего** | Целевые области по приоритету: сервер → десктоп → системный уровень → embedded → игры → ретро. |
| **Дизайн-философия** | Иерархия приоритетов (безопасность памяти → производительность → TS-синтаксис) и принцип: TS-разработчик должен чувствовать себя дома. |
| **Overview** | Краткое техническое описание: расширение `.tsc`, CLI `tsclang`, выход `.c/.h + CMakeLists.txt`. |
| **Установка** | Требования (Node, CMake, gcc/clang/avr-gcc) и команды npm-установки CLI. |

### 02 — Синтаксис ([spec/02-syntax/](spec/02-syntax/))

| Раздел | О чём |
|--------|-------|
| **Форматирование** | Форматирование — никогда не ошибка компилятора; правила пробелов, кавычек, ASI, отступов; `tsclang lint`. |
| **Переменные** | `let` — мутабельная, `const` — иммутабельная; влияет на передачу как `Mut<T>` и вызов `mut`-методов. |
| **Операторы** | Арифметика, присваивание, сравнения, логика, битовые, прочие; таблица приоритетов. |
| **Truthy / Falsy** | Правила неявного приведения к boolean (отличия от JS). |

### 03 — Система типов ([spec/03-types/](spec/03-types/))

| Раздел | О чём |
|--------|-------|
| **Типизация** | Структурная (`type`, `interface`) vs номинальная (`class`); объектные литералы; `as`; type inference. |
| **Числовые типы** | Полный набор i8..i64, u8..u64, f32, f64; правила автокаста. |
| **usize** | Платформенный тип размера (`size_t`): 64 бит на desktop, 16 на AVR. |
| **Конвертация типов** | Число↔строка; JS-совместимые глобальные функции (`parseInt`, `parseFloat`). |
| **Строки** | UTF-8 байтовый массив; индексация возвращает `u8`; встроенные методы; `std/string` extensions. |
| **Специальные типы** | `any`, `never`, `void`, `unknown` — семантика и ограничения. |
| **Null** | Nullable типы (`T | null`); optional chaining `?.`; `??` оператор. |
| **Date** | Legacy JS-совместимый API (0-indexed месяцы); для нового кода — `std/temporal`. |
| **Enum** | Числовой, строковый, `const enum`; утилиты; switch/match с enum. |
| **Type Aliases** | `type UserId = i32` (opaque/номинальный) vs `type Point = { ... }` (структурный). |
| **String Literal Union** | Compile-time only; компилируется в C enum + rodata таблицу строк; явная конверсия в string. |
| **Utility Types** | Compile-time type operators: Partial, Required, Readonly, NonNullable, Pick, Omit, Record, ReturnType, Parameters, Awaited; правило А+Б для generic functions. |

### 04 — Ownership и модель памяти ([spec/04-ownership/](spec/04-ownership/))

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
| **@static let** | Объект в BSS (static lifetime); несколько `Mut<T>` разрешены; при std/threads требует `Atomic<T>`. |
| **Clone** | Явное клонирование owned значений; `clone()` метод. |
| **const vs let** | Подробная семантика иммутабельности и ограничения `const`. |

### 05 — Управляющие конструкции ([spec/05-control-flow/](spec/05-control-flow/))

| Раздел | О чём |
|--------|-------|
| **switch / case** | Ветвление по значению; fallthrough запрещён. |
| **match** | Паттерн-матчинг с exhaustiveness check; fat-pointer matching и discriminated union. |
| **for-of цикл** | Итерация по массивам и строкам; семантика `item` внутри цикла. |
| **while / do-while** | Циклы с условием; `async/await` внутри циклов. |

### 06 — Функции ([spec/06-functions/](spec/06-functions/))

| Раздел | О чём |
|--------|-------|
| **Функции** | Объявление, стрелочные функции, возвращаемые типы, вывод типа. |
| **Перегрузка функций** | Перегрузка по типам и количеству параметров; C-output через name mangling (`foo_i32`, `foo_string`). |
| **extern "C"** | `extern "C"` функции не могут быть перегружены — манглинг невозможен. |
| **Name mangling** | Полная EBNF-схема кодирования типов в C-имена: кодирование примитивов, пользовательских типов, методов, module slug, коллизии имён. |
| **Дефолтные параметры** | Синтаксис и C-output для параметров по умолчанию. |
| **Extension Methods** | Добавление методов к существующим типам через явный импорт; zero-overhead C-output. |
| **Замыкания** | Правила захвата (примитивы — copy, сложные — `Ref`); явный capture list; C-output — struct. |

### 07 — Классы и объектная система ([spec/07-classes/](spec/07-classes/))

| Раздел | О чём |
|--------|-------|
| **Generics** | Монорфизация; bounds через `implements`/`extends`; ownership с generic-параметрами. |
| **Интерфейсы** | Структурная типизация; fat pointer (vtable) при наличии методов; `implements`. |
| **instanceof** | Проверка типа через сравнение vtable-адресов O(1); только для interface-переменных. |
| **Классы** | Номинальная типизация; `mut`-методы; `readonly`-поля; наследование только от `Error`. |
| **Семантика `this`** | Правила `self`/`this`; доступ к полям внутри методов; разрешение неоднозначности. |
| **packed / align** | Управление layout: `@packed` (no padding) и `@align(N)` для embedded/FFI. |

### 08 — Коллекции ([spec/08-collections/](spec/08-collections/))

| Раздел | О чём |
|--------|-------|
| **Массивы и коллекции** | Динамические массивы (capacity/length); `Slice<T>` zero-copy view; `Map<K,V>`; `Set`; `Object`. |
| **Tuples** | Фиксированный кортеж `[A, B, C]`; labeled (dot-access); readonly; optional элементы; rest `...T[]`; C-output — struct. |
| **Индексация и срезы** | Синтаксис `arr[i]`, `arr[a..b]` для массивов и строк. |
| **Spread оператор / Destructuring** | `...arr` для массивов и объектов; правила ownership при spread; деструктуризация с ownership. |
| **Move из массива** | Семантика `arr[i]` как move; borrow через `arr[i]` как `Ref`. |
| **Мутация коллекции при borrow** | Запрет: активный borrow блокирует мутацию коллекции. |

### 09 — Обработка ошибок ([spec/09-errors/](spec/09-errors/))

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
| **Cleanup при throw** | `goto cleanup` паттерн в C-output: O(N+M) вместо дублирования, все указатели NULL-инициализированы. |
| **Ограничения** | `throw` запрещён в `@interrupt` обработчиках; в `Thread.spawn` — особая семантика. |

### 10 — Async/Await ([spec/10-async/](spec/10-async/))

| Раздел | О чём |
|--------|-------|
| **Уровни модели** | Четыре механизма: async/await (все платформы), threads (desktop), @embedded.isr (embedded), аннотации. |
| **Async runtime** | Event loop → state machines в C → Runtime Interface → libuv / io_uring / poll loop. |
| **State machine size** | Компилятор минимизирует struct: только live переменные через await; статический анализ stack. |
| **Promise\<T\>** | Базовый тип async-значения; `.then/.catch/.finally`; как работает под капотом. |
| **Promise.all / any / race / allSettled** | Комбинаторы: семантика, C-output, типизация ошибок. |
| **Правила await** | Где можно/нельзя использовать `await`; async propagation. |
| **async main** | Entry point с event loop; top-level `await`. |
| **Рекурсивные async** | Ограничения; риски стека на embedded. |
| **AbortSignal** | Отмена задач; `atomic_bool` на desktop vs `bool` на embedded; callbacks через event loop. |
| **AsyncMutex** | Честная FIFO-очередь для координации async-функций на event loop; отличие от `Mutex` (std/sync, только для thread-контекста). |
| **`@static async function*`** | Единственный экземпляр генератора в BSS; `new Gen()` не нужен — генератор живёт в BSS. |
| **`@stack(name, N)`** | Статический стек для async-рекурсии на embedded: N frame slots в BSS + макросы `import { push, pop, empty } from "std/stack"`. |
| **Async generators** | `async function*` + `for await`: потоковая обработка данных; backpressure; C-output как state machine; недоступны на `heap: false`. |
| **Кооперативная многозадачность** | Общий паттерн поверх `@static async function*`; ручной poll loop; `Tasks<N>` как обёртка. |

### 11 — Конкурентность ([spec/11-concurrency/](spec/11-concurrency/))

| Раздел | О чём |
|--------|-------|
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
| **Embedded-аннотации** | `@signal` — fine-grained контроль над поведением на embedded. |
| **Итоговая картина** | Сводная схема всей модели конкурентности: async, threads, embedded, связи между ними. |

### 12 — Модульная система ([spec/12-modules/](spec/12-modules/))

| Раздел | О чём |
|--------|-------|
| **Конвенции** | Соглашения по именованию файлов и модулей. |
| **Export** | Только именованные экспорты; `export default` запрещён; реэкспорт. |
| **Import** | ES-синтаксис; namespace-импорт (`import X from "./m"` = namespace); циклические импорты разрешены. |
| **Порядок инициализации** | Детерминированный порядок init модулей; решение circular deps через forward declarations. |
| **Точка входа** | 5 правил приоритета: конфиг → `main.tsc` → единственный файл → без export → библиотека. |
| **Определение проекта как библиотеки** | Как объявить проект библиотекой; нет entry point. |
| **Генерация C main** | Как TSC генерирует `main()` в C; `async main` запускает event loop. |
| **.d.tsc файлы** | C interop: `declare type`, `declare opaque type`, `declare function`; три вида деклараций. |
| **Scalar** | Тип для variadic C-функций (`printf`); `...args: Scalar[]`. |
| **Path Aliases** | `#` / `~` aliases в `paths` (tsc.package.json); почему не `@`; wildcard; разрешённые символы; приоритет резолюции. |
| **Declaration Merging** | Расширение деклараций без замены; augmentation паттерн. |
| **Inline C (`native`)** | Вставка C-кода напрямую в TSC; когда использовать. |
| **`unsafe {}`** | Отключение проверок TSClang (borrow checker, null checks); эскейп хетч. |
| **@platform** | Декоратор условной компиляции: платформо-зависимые реализации одной функции/класса. |

### 13 — Система сборки ([spec/13-build/](spec/13-build/))

| Раздел | О чём |
|--------|-------|
| **Типы проектов** | Четыре вида: Executable, TSClang-библиотека, C-wrapper, Platform profile — структуры и tsc.package.json шаблоны. |
| **Build Profiles** | debug / release / embedded; пользовательские профили; флаги оптимизации. |
| **tsc.package.json** | Главный конфиг: поля верхнего уровня, зависимости, targets. |
| **Поля build конфига** | Детальные поля конфигурации сборки. |
| **Platform Profile** | AVR/Cortex/desktop-специфичные настройки: stack_size, MCU, частота. |
| **Полная таблица платформ** | Справочная таблица всех поддерживаемых платформ (Desktop, Mobile, Embedded, Retro, Consoles). |
| **`@struct` class** | Value type без heap и vtable; копируется как C struct; inline-размещение. |
| **`@pool(N)` class** | Статический пул N слотов в BSS; `new Cls()` берёт слот; release через ownership или `drop()`. |
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
| **Реестр** | Как работает пакетный реестр TSClang (`registry.tsclang.org`). |
| **Strict Mode** | Granular compile-time правила: `no-any`, `no-unsafe`, `no-native`, `no-extern-c`, `safe-div`, `no-lossy-cast`, `no-dynamic-alloc`. Для safety-critical кода (IEC 61508). |

### 14 — Стандартная библиотека ([spec/14-stdlib/](spec/14-stdlib/))

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
| **std/json** | `JSON.parse` / `JSON.stringify`; типобезопасный разбор через generics. |
| **std/url** | `URL` класс: парсинг, поля (hostname, pathname, searchParams и др.). |
| **std/blob** | Immutable blob байтовых данных; источник для FormData и fetch body. |
| **std/formdata** | `FormData` для multipart/form-data запросов; интеграция с `std/net`. |
| **std/regex** | NFA-движок для регулярных выражений; PCRE через опциональный `@tsc/pcre`. |
| **std/random** | `Random(seed)` (все платформы); `SecureRandom` (desktop); `HardwareRandom` (embedded). |
| **std/temporal** | PlainDate, PlainTime, PlainDateTime, Instant, Duration, ZonedDateTime, Now. |
| **std/threads** | Экспорты: Thread, Atomic, AtomicArray, channel, select, Readonly. |
| **std/hal** | Hardware Abstraction Layer: GPIO, UART, SPI, I2C — платформонезависимые интерфейсы; реализуется в platform profile. |
| **std/reactive** | `Signal<T>`, `effect`, `computed` — реактивный граф зависимостей. |
| **std/libc** | Базовые C bindings (printf, malloc, memcpy и др.); subset определяется platform profile. |
| **std/avr** | AVR-специфичные утилиты: ADC, PWM, sleep, watchdog. |
| **std/embedded** | Общие embedded утилиты поверх `std/hal`: `HashMap<K,V,N>` (struct-of-arrays, djb2+linear probing), `StaticMap` (perfect hash switch), `Tasks<N>` (кооперативный планировщик), `pointer<T>` (raw-указатель), `Volatile<T>` (MMIO-регистры), `MMIO` через `declare const`. |
| **HAL реализация в platform profile** | Как platform profile предоставляет конкретные реализации интерфейсов `std/hal`. |

### 15 — Декораторы ([spec/15-decorators/](spec/15-decorators/))

| Раздел | О чём |
|--------|-------|
| **Философия** | Compile-time трансформации AST; не рантайм; ограничения на embedded. |
| **Синтаксис применения** | Места применения: class/method/prop/param/function; с аргументами и без. |
| **Определение декоратора** | `decorator function` синтаксис; перегрузки для разных мест применения; фабрики. |
| **Модель выполнения** | `before()` / `after()` вызовы; захват переменных в замыканиях. |
| **Порядок применения** | Снизу вверх; фабрики вызываются сверху вниз; `@static` всегда последним. |
| **Встроенные comptime-типы** | `TypeRef`, `TypeSet`, `FuncRef`, `FieldRef` — типы для generic-параметров декораторов. |
| **Дескрипторный API** | `ClassDesc` (+ `addField`, `addMethod`), `MethodDesc`, `PropDesc`, `ParamDesc`, `FunctionDesc`, `SelfRef` (`ctx.self.field<T>()`), `MetaStore`. |
| **Comptime-метаданные** | `meta.set<T>()`, `meta.get<T>()` — compile-time аннотации; в C-output не попадают. |
| **Декораторы на async-методах** | State machine wrap; проброс AbortSignal; ограничения на захват `Mut<T>`. |
| **Дженерики и декораторы** | Generic constraints вместо TypeRef; `R extends number` паттерн. |
| **Доступ к параметрам метода** | `ctx.args` — доступ к аргументам; `ctx.result` — к возвращаемому значению в `after()`. |
| **Декоратор и платформа** | Heap-аллокации в декораторах; поле `allocator`; ошибка на `heap: false`. |
| **Экспорт и импорт** | Как экспортировать декоратор из модуля и импортировать в другой. |
| **Паттерны** | Готовые паттерны: мемоизация через `cls.addField`, logging, validation. |
| **Фазы компилятора** | Когда декоратор-пасс выполняется относительно typecheck и ownership analysis. |
| **Модель кодогенерации** | Цепочка wrapper-функций в C; именование; компиляция `ctx.self.field<T>(name)`. |
| **C-вывод** | Примеры итогового C-output: `@log` на методе, `@timing` на async, `@minLength` на свойстве. |

### 16 — Инструментарий ([spec/16-tooling/](spec/16-tooling/))

| Раздел | О чём |
|--------|-------|
| **Фазы компиляции** | Parse → AST → Decorator pass → Typecheck → Lower to IR → Ownership Analysis → Codegen. |
| **Decorator pass** | Позиция декоратор-пасса в pipeline: после парсинга, до typecheck; алгоритм обхода. |
| **IR** | Линейное IR между AST и C: explicit order, basic blocks, phi nodes; async lowering в IR. |
| **Name mangling** | Compiler-side реализация манглинга: генерация уникальных C-имён, разрешение коллизий между модулями. |
| **Debug Info** | `#line` директивы для сохранения соответствия `.tsc` ↔ `.c`; конфигурация путей; `tsclang debug --dap`; embedded (OpenOCD/SWD). |
| **Методология тестов** | Формат тест-корпуса: входной `.tsc` → ожидаемый C-output или ошибка компилятора. |
| **Consumer-side monomorphization** | Generic-код из зависимостей компилируется в consumer, не в библиотеке; формат скомпилированной библиотеки. |
| **Incremental compilation** | *(roadmap)* Граф зависимостей + IR-кеш; инвалидация по хешу файла. |
| **Optimization levels** | `-O0` / `-O1` / `-Os`; что делает TSClang на IR-уровне vs что передаётся C-компилятору. |
| **Error messages** | Формат `file:line:col: error[EXXX]: message`; категории ошибок; правила оформления hint. |
| **LSP** | Language Server Protocol: hover, completion, definition, diagnostics; JSON-RPC 2.0 на stdin/stdout. |
| **Linter** | AST-правила: `no-unreachable`, `prefer-const`, `no-unused-var`; авто-исправление через `--fix`. |
| **Оптимизатор** | AST-оптимизации: constant folding, dead branch elimination, unused const elimination, borrow elision. |

### 17 — Migration Guide ([spec/17-migration/](spec/17-migration/))

Руководство по миграции с TypeScript на TSClang: отличия, несовместимости, паттерны адаптации.

---

## Фазы реализации

### Навигация фаза → разделы spec

Подробный маппинг: [spec/PHASES.md](spec/PHASES.md).

| Фаза | Разделы spec |
|------|----------------|
| 0  | [01-intro](spec/01-intro/), [14-stdlib](spec/14-stdlib/) (Error, Globals) |
| 1  | [02-syntax](spec/02-syntax/), [03-types](spec/03-types/) (примитивы) |
| 2  | [03-types](spec/03-types/) (null, enum, type aliases, tuples, utility types) |
| 3  | [04-ownership](spec/04-ownership/), [03-types](spec/03-types/) (строки), [08-collections](spec/08-collections/) |
| 4  | [07-classes](spec/07-classes/), [05-control-flow](spec/05-control-flow/) (match), [06-functions](spec/06-functions/) (closures) |
| 5  | [09-errors](spec/09-errors/) |
| 6  | [12-modules](spec/12-modules/) |
| 7  | [10-async](spec/10-async/) |
| 8  | [11-concurrency](spec/11-concurrency/), [13-build](spec/13-build/) (@struct, @pool) |
| 9  | [13-build](spec/13-build/) (CLI, tsc.package.json) |
| 10 | [13-build](spec/13-build/) (pipeline, зависимости, версионирование) |
| 11 | [13-build](spec/13-build/) (dev/lint/format, Platform Profile) |
| 12 | [14-stdlib](spec/14-stdlib/) |
| 13 | [15-decorators](spec/15-decorators/) |
| 14 | [14-stdlib](spec/14-stdlib/) (std/reactive) |
| 15 | [14-stdlib](spec/14-stdlib/) (std/regex) |
| 16 | [16-tooling](spec/16-tooling/) (LSP) |
| 17 | [16-tooling](spec/16-tooling/) (Linter) |
| 18 | [16-tooling](spec/16-tooling/) (Оптимизатор) |
| 19 | [14-stdlib](spec/14-stdlib/) (IO/Net/WS) |

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
- Enum, Generics (монорфизация, без ownership-aware bounds)
- Числовые автокасты, оператор `as`
- String Literal Union (compile-time → C enum + rodata)
- Utility Types (Partial, Required, Readonly, NonNullable, Pick, Omit, Record, ReturnType, Parameters, Awaited)
- Tuples (`[A, B, C]`, labeled, readonly, optional, rest)

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
- `@static let` — borrow checker rules (multiple `Mut<T>` allowed; std/threads exception)

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
- `AsyncMutex` (FIFO-очередь для async-координации)
- `async main` / event loop integration
- Stack safety анализ на embedded
- `async function*` + `for await` (async generators, только heap-платформы)
- `@static function*` (единственный экземпляр в BSS)
- `@stack(name, N)` (статический стек для async-рекурсии)
- Кооперативная многозадачность через генераторы (общий паттерн)

### Фаза 8 — Threads и низкоуровневая конкурентность

`select` работает поверх async; `channel` — bridge между event loop и threads.

- `std/threads`: `Thread<T>`, `channel<T>`, `select`
- `Atomic<T>`, `AtomicArray<T>`, `Readonly<T>`
- `@embedded.isr`, `Volatile<T>`, `std/sync`, Embedded-аннотации (embedded)
- `@struct` (value type без heap/vtable)
- `@pool(N)` (статический пул слотов в BSS)

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

> Полноценный rule-based линтер — в фазе 17.

### Фаза 12 — Стандартная библиотека

Строится поверх всего предыдущего. Включает `std/embedded` с `HashMap<K,V,N>`, `StaticMap`, `Tasks<N>`. Детали определяются по ходу реализации.

### Фаза 13 — Декораторы

- Decorator pass (после парсинга, до typecheck)
- `decorator function` синтаксис; фабрики; перегрузки по месту применения
- Модель выполнения: `before()` / `after()`; захват переменных
- Встроенные comptime-типы: `TypeRef`, `TypeSet`, `FuncRef`, `FieldRef`
- Descriptor API: `ClassDesc` (`addField`, `addMethod`), `MethodDesc`, `PropDesc`, `ParamDesc`, `FunctionDesc`, `SelfRef`, `MetaStore`
- `ctx.self.field<T>(name)` — compile-time доступ к полям экземпляра
- `ctx.args` / `ctx.result` — доступ к параметрам и результату
- Встроенные декораторы: `@static`, `@readonly`, `@override`, `@abstract`, `@deprecated`
- Порядок применения (снизу вверх), comptime-метаданные (`meta`)
- Async-методы: state machine wrap, AbortSignal проброс
- Дженерики в декораторах: generic constraints
- Декоратор и платформа: ограничения на `heap: false`
- Кодогенерация: цепочка wrapper-функций, именование, C-output

### Фаза 14 — Reactive

- `Signal<T>`, `effect`, `computed` — реактивный граф зависимостей

### Фаза 15 — Regex

- NFA-движок для регулярных выражений
- PCRE через опциональный `@tsc/pcre`

### Фаза 16 — LSP

- Language Server Protocol (JSON-RPC 2.0 на stdin/stdout)
- Методы: `initialize`, `textDocument/hover`, `textDocument/completion`, `textDocument/definition`
- `textDocument/publishDiagnostics` при ошибках парсинга

### Фаза 17 — Линтер и форматтер

- **Линтер** (`tsclang lint`): AST-обход через `walkAst(node, visitor)`, правила:
  - `no-unreachable` — код после `return`/`throw` в блоке → предупреждение
  - `prefer-const` — `let` без переприсваивания → предлагает `const`
  - `no-unused-var` — объявленная переменная без обращений → предупреждение
- **Авто-исправление** (`tsclang lint --fix`): патч исходника по номеру строки (`let` → `const`)
- **Форматтер** (`tsclang format`): нормализация пробелов и отступов (identity для корректного кода)

### Фаза 18 — AST Optimizer

Оптимизации на уровне AST до codegen. Активируется флагом `--opt` (или `#[profile(opt: true)]`).

| Оптимизация | Пример | Результат |
|-------------|--------|-----------|
| Constant folding | `2 + 3` | `5` |
| Constant propagation | `const K = 10; K * 2` | `20` |
| Dead branch elimination | `if (false) { ... }` | удалить ветку |
| Unused const elimination | `const x = 5;` (не используется) | удалить |
| Strength reduction | `x * 2` → `x + x` | (опц., если нет сдвига) |
| Borrow elision (field access) | `const name = user.name` (String field) | `const String *name = &user.name` (borrow вместо ARC copy) |

**Borrow elision для field access** — открытый дизайн-вопрос. Сейчас `const name = user.name` где `name: string` создаёт ARC copy (`tsc_string_clone`). Оптимизатор может заменить это на pointer borrow (`&user.name`), но это требует lifetime analysis — borrow не должен пережить owner. Возможные варианты: (а) pointer borrow + lifetime guard, (б) copy-on-write с defer, или (в) оставить как есть. Финальное решение отложено до реализации phase 18.

Реализация: `src/compiler/optimizer.js` — рекурсивный `foldExpr(node)` и `deadCode(stmts)`.
Вызывается из `compileTsc()` после парсинга, до codegen, если `--opt` передан.

### Фаза 19 — IO/Net/WS

Стандартная библиотека для I/O, сети и WebSocket.

- **std/io** — базовые I/O абстракции: `Reader`, `Writer`
- **std/fs** — файловая система: read, write, stat, watch
- **std/net** — `fetch` (глобальный); HTTP сервер; TCP/UDP сокеты
- **std/ws** — WebSocket клиент и сервер
