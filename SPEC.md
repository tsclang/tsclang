# TSClang — Спецификация и фазы реализации

## Разделы

Спецификация языка разбита на разделы. Читай нужный раздел напрямую.

| Файл | Содержимое |
|------|-----------|
| [spec/01-intro.md](spec/01-intro.md) | Зачем, дизайн-философия, overview, установка |
| [spec/02-syntax.md](spec/02-syntax.md) | Синтаксис, операторы, управляющие конструкции |
| [spec/03-types.md](spec/03-types.md) | Базовые типы: числа, строки, null, массивы, Date, конвертация, Clone, Type Aliases |
| [spec/04-classes.md](spec/04-classes.md) | Классы и объектная система: generics, extension methods, enum, интерфейсы, instanceof, классы |
| [spec/05-memory.md](spec/05-memory.md) | Ownership, borrow checker, замыкания, итераторы |
| [spec/06-errors.md](spec/06-errors.md) | Обработка ошибок, throws, try/catch |
| [spec/07-concurrency.md](spec/07-concurrency.md) | Async/await, threads, embedded concurrency |
| [spec/08-modules.md](spec/08-modules.md) | Модульная система, C interop, .d.tsc, @platform |
| [spec/09-build.md](spec/09-build.md) | Типы проектов, система сборки, CLI, package manager |
| [spec/10-stdlib.md](spec/10-stdlib.md) | Стандартная библиотека |
| [spec/11-compiler.md](spec/11-compiler.md) | Архитектура компилятора, IR, методология тестов |
| [spec/12-migration.md](spec/12-migration.md) | Migration guide: TypeScript → TSClang |
| [spec/13-decorators.md](spec/13-decorators.md) | Декораторы: синтаксис, Descriptor API, встроенные декораторы, codegen |

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
| **Name mangling — формальная схема** | Полная EBNF-схема кодирования типов в C-имена: кодирование примитивов, пользовательских типов, методов, module slug, коллизии имён. |
| **Дефолтные параметры** | Синтаксис и C-output для параметров по умолчанию. |
| **Семантика передачи значений** | Примитивы копируются; сложные типы — move (при присваивании) или borrow через `Ref<T>`/`Mut<T>` (при передаче в функцию). Move из массива по индексу запрещён — только `Ref<T>`. Borrow полей объектов — не поддерживается. |
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

**[spec/03-types.md](spec/03-types.md) — базовые типы:**


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
| **Массивы и коллекции** | Динамические массивы (capacity/length); `Slice<T>` zero-copy view; `Map<K,V>`; `Set`; `Object`. |
| **Tuples** | Фиксированный кортеж `[A, B, C]`; labeled (dot-access); readonly; optional элементы; rest `...T[]`; C-output — struct. |
| **Clone** | Явное клонирование owned значений; `clone()` метод. |
| **Type Aliases** | `type UserId = i32` (opaque/номинальный) vs `type Point = { ... }` (структурный). |
| **String Literal Union** | Compile-time only; компилируется в C enum + rodata таблицу строк; явная конверсия в string. |
| **Utility Types** | Compile-time type operators: Partial, Required, Readonly, NonNullable, Pick, Omit, Record, ReturnType, Parameters, Awaited; правило А+Б для generic functions. |

**[spec/04-classes.md](spec/04-classes.md) — классы и объектная система:**

| Раздел | О чём |
|--------|-------|
| **Generics** | Монорфизация; bounds через `implements`/`extends`; ownership с generic-параметрами. |
| **Extension Methods** | Добавление методов к существующим типам через явный импорт; zero-overhead C-output. |
| **Enum** | Числовой, строковый, `const enum`; утилиты; switch/match с enum. |
| **Интерфейсы** | Структурная типизация; fat pointer (vtable) при наличии методов; `implements`. |
| **instanceof** | Проверка типа через сравнение vtable-адресов O(1); только для interface-переменных. |
| **Классы** | Номинальная типизация; `mut`-методы; `readonly`-поля; наследование только от `Error`. |
| **Семантика `this` и доступ к полям** | Правила `self`/`this`; доступ к полям внутри методов; разрешение неоднозначности. |

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
| **@static let** | Объект в BSS (static lifetime); несколько `Mut<T>` разрешены; при std/threads требует `Atomic<T>`. |
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
| **Embedded-аннотации** | `@embedded.noHeap`, `@signal` — fine-grained контроль над поведением на embedded. |
| **@embedded.singleton** | Единственный экземпляр класса в BSS; `Cls.instance()` → `Mut<Cls>`; нет malloc. |
| **@embedded.stack** | Статический стек для async-рекурсии на embedded: N frame slots в BSS. |
| **Async generators** | `async function*` + `for await`: потоковая обработка данных; backpressure; C-output как state machine; недоступны на `heap: false`. |
| **Кооперативная многозадачность** | Общий паттерн поверх `@static async function*`; ручной poll loop; `Tasks<N>` как обёртка. |
| **Итоговая картина** | Сводная схема всей модели конкурентности: async, threads, embedded, связи между ними. |

### Блок 7: Модульная система

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

### Блок 8: Система сборки

| Раздел | О чём |
|--------|-------|
| **Типы проектов** | Четыре вида: Executable, TSClang-библиотека, C-wrapper, Platform profile — структуры и tsc.package.json шаблоны. |
| **Build Profiles** | debug / release / embedded; пользовательские профили; флаги оптимизации. |
| **tsc.package.json** | Главный конфиг: поля верхнего уровня, зависимости, targets. |
| **Поля build конфига** | Детальные поля конфигурации сборки. |
| **Platform Profile** | AVR/Cortex/desktop-специфичные настройки: stack_size, MCU, частота. |
| **Полная таблица платформ** | Справочная таблица всех поддерживаемых платформ (Desktop, Mobile, Embedded, Retro, Consoles). |
| **@embedded.inline** | Value type без heap и vtable; копируется как C struct; рекурсивное разворачивание. |
| **@embedded.pool(N)** | Статический пул N слотов в BSS; `Cls.alloc()` → `Cls \| null`; release через ownership или `drop()`. |
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

### Блок 11: Декораторы

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

### Блок 10: Компилятор

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

---

## Фазы реализации

### Навигация фаза → блоки

| Фаза | Что читать выше |
|------|----------------|
| 0  | Блок 9: Error, Globals |
| 1  | Блок 2 (кроме match, for-of) |
| 2  | Блок 3: 03-types.md (кроме строк, массивов, коллекций, Clone) + 03-classes.md: Enum, Generics + String Literal Union + Utility Types |
| 3  | Блок 4 + из Блока 3 (03-types.md): Строки, Массивы и коллекции, Clone + @static let |
| 4  | Блок 2: match; Блок 3 (03-classes.md): Классы, Интерфейсы, Extension Methods, instanceof; Блок 4: Замыкания |
| 5  | Блок 5 (целиком) |
| 6  | Блок 7 (целиком) |
| 7  | Блок 6: Уровни модели, Async runtime, State machine size, Promise, Правила await, async main, Рекурсивные async, AbortSignal, AsyncMutex + Async generators + @embedded.singleton + @embedded.stack + Кооперативная многозадачность |
| 8  | Блок 6: Уровни модели, Threads, Atomic, AtomicArray, channel, select, Readonly, @embedded.isr, Volatile, std/sync, Embedded-аннотации + Блок 8: @embedded.inline + @embedded.pool |
| 9  | Блок 8: tsc.package.json, CLI команды (init/build/run) |
| 10 | Блок 8: Pipeline сборки, Источники зависимостей, Версионирование |
| 11 | Блок 8: CLI команды (dev/lint/format), Platform Profile |
| 12 | Блок 9 (целиком); `std/threads` читать как API поверх механизма из фазы 8 |
| 13 | Блок 11 (Декораторы): синтаксис, Модель выполнения, Дескрипторный API (SelfRef, MetaStore), Comptime-типы, async-методы, паттерны, кодогенерация, C-вывод |
| 14 | Блок 10: Фазы компиляции, IR, Name mangling, Debug Info, Optimization levels, Error messages, Методология тестов, Consumer-side monomorphization |
| 15 | Блок 8: Реестр |

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
- Type aliases (`type`, `interface` без методов) — из `03-types.md`
- Enum, Generics (монорфизация, без ownership-aware bounds) — из `03-classes.md`
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
- `@embedded.singleton` (единственный экземпляр в BSS)
- `@embedded.stack(name, N)` (статический стек для async-рекурсии)
- Кооперативная многозадачность через генераторы (общий паттерн)

### Фаза 8 — Threads и низкоуровневая конкурентность

`select` работает поверх async; `channel` — bridge между event loop и threads.

- `std/threads`: `Thread<T>`, `channel<T>`, `select`
- `Atomic<T>`, `AtomicArray<T>`, `Readonly<T>`
- `@embedded.isr`, `Volatile<T>`, `std/sync`, Embedded-аннотации (embedded)
- `@embedded.inline` (value type без heap/vtable)
- `@embedded.pool(N)` (статический пул слотов в BSS)

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

### Фаза 14 — IR и продвинутые возможности компилятора

- **Инкрементальная компиляция**: SHA-256 кэш в `.tsclang-cache/`; флаг `--no-cache`; сообщение `cache-hit-identical` при попадании
- **Async while-await**: state machine с Duff's device; `goto case_N` loop-back; `_emitAsyncWhile` с инлайном хвостовых стейтментов
- **Library format**: `resolvePackageImport` — обход дерева к `node_modules/<pkg>/index.tsc`; `tsc.package.json` с полем `main`; префикс символов = имя пакета

### Фаза 15 — Линтер и форматтер

- **Линтер** (`tsclang lint`): AST-обход через `walkAst(node, visitor)`, правила:
  - `no-unreachable` — код после `return`/`throw` в блоке → предупреждение
  - `prefer-const` — `let` без переприсваивания → предлагает `const`
  - `no-unused-var` — объявленная переменная без обращений → предупреждение
- **Авто-исправление** (`tsclang lint --fix`): патч исходника по номеру строки (`let` → `const`)
- **Форматтер** (`tsclang format`): нормализация пробелов и отступов (identity для корректного кода)

### Фаза 16 — Реестр пакетов

- **`tsclang search <query>`**: поиск по MOCK_REGISTRY (имя + description)
- **`tsclang publish`**: упаковка в `.tspkg` JSON-архив `{name, version, files: {rel: content}}`; счёт файлов
- **`tsclang install <pkg>[@ver]`**: установка из реестра в `node_modules/`; вывод `Installed pkg@ver`
- **`tsclang install <file.tspkg>`**: извлечение из локального архива в `node_modules/`
- **Диапазоны версий**: `^`, `~`, `*` — `resolveRange` на массиве версий

### Фаза 17 — Platform backends: Retro & Consoles

- **Profile checker** в pre-scan `top-level.js`: платформа → набор ограничений:
  - `_noFloatTargets = ['nes','genesis','ps1','spectrum']` — `f32`/`f64` TypeRef → ошибка
  - `_noHeapTargets` — `new ClassName()` → ошибка
  - `_noAsyncTargets` — `async function` → ошибка
- **`usize = uint16_t`** для `nes` и `spectrum` в `resolveType`
- **Embedded targets** расширены: `['avr','arm','stm32','nes','genesis','ps1','spectrum']`
- **Runtime headers**: `runtime_nes.h`, `runtime_ps2.h`, `runtime_ps1.h`, `runtime_genesis.h`, `runtime_dos.h`, `runtime_spectrum.h`
- **CMake toolchains**: `cmake/toolchain-{nes,ps2,ps1,genesis,dos,spectrum}.cmake`
- Аннотация `// @target: nes` или `#[profile(target: nes)]`

### Фаза 18 — Advanced tooling: Optimizer, WASM, DTS, Sourcemaps, LSP

#### 18.1 — AST Optimizer

Оптимизации на уровне AST до codegen. Активируется флагом `--opt` (или `#[profile(opt: true)]`).
GCC делает машинные оптимизации — AST-оптимизатор убирает очевидную избыточность до трансляции в C.

| Оптимизация | Пример | Результат |
|-------------|--------|-----------|
| Constant folding | `2 + 3` | `5` |
| Constant propagation | `const K = 10; K * 2` | `20` |
| Dead branch elimination | `if (false) { ... }` | удалить ветку |
| Unused const elimination | `const x = 5;` (не используется) | удалить |
| Strength reduction | `x * 2` → `x + x` | (опц., если нет сдвига) |

Реализация: `src/compiler/optimizer.js` — рекурсивный `foldExpr(node)` и `deadCode(stmts)`.
Вызывается из `compileTsc()` после парсинга, до codegen, если `--opt` передан.

#### 18.2 — WebAssembly backend

Таргет `wasm`: `--target wasm` или `#[profile(target: wasm)]`.

- `runtime_wasm.h` — без libuv; `console.log` → `wasm_log` (JS import); `tsc_throw` → `wasm_trap`
- `cmake/toolchain-wasm.cmake` — Emscripten `emcc` или `clang --target=wasm32-unknown-unknown`
- `--emit wasm` — вызов `emcc` для компиляции `.c` → `.wasm` + `.js` glue
- Ограничения: нет file I/O, нет threads (без atomics), heap через `malloc` (линейная память)
- `console.log` → `wasm_log(ptr, len)` через `__attribute__((import_module("env"), import_name("log")))`

#### 18.3 — Declaration emitter (`emit-dts`)

`tsclang emit-dts <file.tsc>` — генерирует `.d.tsc` файл с типами экспортируемых символов.

Формат выходного файла:
```
export declare function name(param: Type, ...): ReturnType;
export declare class Name {
  field: Type;
  method(param: Type): ReturnType;
}
export declare type Alias = Type;
export declare const name: Type;
```

Правила:
- Только `export`-декларации попадают в `.d.tsc`
- Тела функций и классов опускаются (только сигнатуры)
- Тип выводится из аннотации; без аннотации → `any`
- Файл создаётся рядом с исходником: `input.tsc` → `input.d.tsc`
- Команда выводит `Emitted input.d.tsc (N declarations)`

#### 18.4 — Source maps

`tsclang build --sourcemap` — дополнительно создаёт `<name>.tsc.map`:

```json
{
  "version": 1,
  "file": "input.tsc",
  "sourceC": "input.c",
  "mappings": [[tscLine, cLine], ...]
}
```

Каждый элемент mappings: `[номер строки в .tsc (1-based), номер строки в .c (1-based)]`.
Только строки с реальными стейтментами (не пустые, не `{`/`}`).

CLI интеграция:
- `tsclang debug <file.tsc>` — строит с `--sourcemap`, затем запускает `gdb` с `--source-directory`
- `tsclang debug` требует `gdb` в PATH; если не найден → предупреждение, бинарь запускается без отладки

#### 18.5 — Language Server Protocol (LSP)

`tsclang lsp` — запускает LSP-сервер на stdin/stdout (JSON-RPC 2.0).

Поддерживаемые методы:

| Метод | Запрос | Ответ |
|-------|--------|-------|
| `initialize` | `{capabilities}` | `{capabilities: {hoverProvider, completionProvider, definitionProvider}}` |
| `initialized` | — | ACK |
| `shutdown` / `exit` | — | завершение процесса |
| `textDocument/didOpen` | `{uri, text}` | сохранить в буфер |
| `textDocument/didChange` | `{uri, changes}` | обновить буфер |
| `textDocument/hover` | `{uri, position}` | `{contents: {kind:"markdown", value:"**type**: i32"}}` |
| `textDocument/completion` | `{uri, position}` | список символов из текущего скоупа + методов |
| `textDocument/definition` | `{uri, position}` | `{uri, range}` для объявления символа |

Архитектура:
- `src/lsp/server.js` — основной цикл: `process.stdin` → JSON-RPC dispatcher
- `src/lsp/analyzer.js` — хранит буфер документа, вызывает парсер + type inference, возвращает символы
- Ошибки парсинга → `textDocument/publishDiagnostics`
- Content-Length framing по протоколу LSP (заголовок `Content-Length: N\r\n\r\n`)

Тестирование LSP: shell-тест посылает один JSON-RPC запрос в stdin процесса и проверяет JSON-ответ.
