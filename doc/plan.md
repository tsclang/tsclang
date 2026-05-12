# План документации TSClang

## Цель

Создать полноценную документацию для разработчиков на русском языке на основе спецификации.
Документация должна быть практичной, ориентированной на пользователя (разработчика), а не на автора компилятора.

## Целевая аудитория

1. Разработчик, пришедший с TypeScript и желающий начать писать на TSClang
2. Разработчик, оценивающий язык для embedded-разработки
3. Разработчик, ищущий конкретный API (метод строки, тип владения, HTTP-сервер)

## Принципы написания

- Язык: русский
- Примеры кода: рабочие, минимальные, с комментариями на английском
- Структура: от простого к сложному
- Каждый раздел самодостаточен — можно читать независимо
- Ссылки между разделами для углубления

## Структура файлов

**Вложенная структура:** каждый метод, функция, тип, конструкция — отдельный файл.
Никаких монолитных страниц на 50 KB. Если метод имеет 3 варианта вызова — это 3 файла
внутри директории метода.

Пример структуры:

```
doc/
  02-syntax/
    index.md                        # обзор раздела + ссылки
    variables/
      let.md
      const.md
    functions/
      declaration.md
      arrow.md
      anonymous.md
      iife.md
      default-params.md
      overload.md
        by-type.md
        by-count.md
        priority.md
    loops/
      for.md
      for-of.md
      while.md
      do-while.md
      break-continue.md
    match/
      syntax.md
      patterns/
        literal.md
        range.md
        destructuring.md
        wildcard.md
        union.md
      exhaustiveness.md
      vs-switch.md
    operators/
      arithmetic.md
      assignment.md
      comparison.md
      logical.md
      bitwise.md
      ternary.md
      optional-chaining.md
      nullish-coalescing.md
      spread.md
    truthy-falsy.md
    slices.md
```

## Правила содержимого файла

Каждый файл описывает **один** метод / функцию / конструкцию / тип и обязан содержать:

### 1. Полное описание

Что это, зачем нужно, как работает. Без воды — конкретно и по делу.
Упомянуть edge cases и неочевидное поведение.

### 2. Сигнатура / синтаксис

Точная сигнатура с типами параметров и возвращаемого значения.
Если у метода несколько вариантов (перегрузки) — описать каждый отдельно.

### 3. Примеры вызова или реализации

Минимум один рабочий пример на каждый вариант.
Примеры должны быть минимальными — без лишнего контекста.
Каждый пример с указанием результата (комментарий `// →`).

### 4. C-output

Для каждого примера — как он компилируется в C.
Показать сгенерированный C-код, чтобы разработчик понимал что происходит под капотом.
Особенно важно для ownership-конструкций (move, borrow, drop, cleanup).

### 5. Ошибки и их исправление

Типичные ошибки компилятора при неправильном использовании.
Формат: `код с ошибкой → текст ошибки → исправленный код`.
Обязательно включать hint из компилятора.

### 6. Навигация и ссылки

Каждый файл обязан содержать навигационные ссылки:

**Навигационная панель** — в начале файла, после заголовка:

```markdown
[← Уровень вверх](./index.md) | [Следующий →](./filter.md) | [Предыдущий ←](./sort.md)
```

Три ссылки:
- **Уровень вверх** (`←`) — переход к `index.md` родительской директории (обзор раздела)
- **Следующий** (`→`) — переход к следующему файлу на этом уровне (по логическому порядку, не алфавиту)
- **Предыдущий** (`←`) — переход к предыдущему файлу на этом уровне

Первый файл в разделе не имеет «Предыдущий», последний — «Следующий».

**Перекрёстные ссылки** — в конце файла, раздел «См. также»:

```markdown
## См. также

- [filter](./filter.md) — фильтрация элементов
- [reduce](./reduce.md) — аккумуляция
- [forEach](./for-each.md) — итерация без результата
```

Ссылки на родственные конструкции в других разделах — с полным путём:

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) — borrow элемента
```

**index.md в каждой директории** — обзор раздела со ссылками на все дочерние файлы.
Служит точкой входа при навигации «сверху вниз».

Пример шаблона файла:

```markdown
# map

Создаёт новый массив, применяя функцию к каждому элементу исходного.

## Сигнатура

\`\`\`typescript
arr.map<U>(f: (Ref<T>) => U): U[]
\`\`\`

Callback получает `Ref<T>` — borrow элемента, не ownership.

## Примеры

### Базовое использование

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
const doubled = nums.map(x => x * 2)
// → [2, 4, 6]
\`\`\`

### C-output

\`\`\`c
int32_t* doubled = malloc(3 * sizeof(int32_t));
for (size_t i = 0; i < 3; i++) {
    doubled[i] = nums[i] * 2;
}
\`\`\`

### Преобразование типа

\`\`\`typescript
const names: string[] = users.map(u => u.name)
// → ["Alice", "Bob"]
\`\`\`

## Ошибки

### Callback мутирует элемент

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => { x++ })  // ошибка: cannot assign to Ref<i32>
\`\`\`

Исправление:

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => x * 2)  // возвращаем новое значение
\`\`\`

## См. также

- [filter](./filter.md)
- [reduce](./reduce.md)
- [flatMap](./flat-map.md)
```

---

## Структура документации

### 01-intro.md — Введение в TSClang

**Цель:** объяснить что это, зачем, и дать первый работающий пример.

- Что такое TSClang (TS-синтаксис → C, Rust-безопасность, npm-экосистема)
- Дизайн-философия (3 приоритета: безопасность, производительность, TS-синтаксис)
- Для каких задач (desktop, embedded, серверы, ретро-платформы)
- Быстрый старт: установка, `hello world`, сборка и запуск
- Требования (Node.js, CMake, gcc/clang)
- CLI обзор: `tsclang build`, `tsclang lint`, `tsclang lsp`

**Источник:** `spec/01-intro.md`

---

### 02-syntax.md — Синтаксис

**Цель:** полное описание синтаксиса языка.

- Форматирование (ASI, K&R, отступы, кавычки, trailing comma)
- Переменные: `let` / `const` — разница в контексте ownership
- Функции: `function`, стрелочные, анонимные, IIFE
- Параметры: дефолтные, rest
- Перегрузка функций (по типам и количеству, приоритет resolution)
- Операторы: арифметические, присваивание, сравнения, логические, битовые
- Truthy / Falsy (таблица по типам)
- Циклы: `for`, `for-of`, `while`, `do-while`, `break`/`continue`, labeled
- `switch` / `match` — сравнение, exhaustiveness
- Spread оператор (массивы, объекты, ownership-правила)
- Индексация и срезы (массивы и строки, отрицательные индексы)

**Источник:** `spec/02-syntax.md`

---

### 03-types.md — Система типов

**Цель:** описание типизации, всех типов и конвертаций.

- Структурная vs номинальная типизация (`type`, `interface`, `class`)
- Type inference
- Числовые типы (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`)
  - Литералы (hex, binary, octal, разделители `_`)
  - Автокаст (3 механизма: widening, compile-time, `as`)
  - `usize` — платформенный тип
  - `number` = `f64` (перезаписываемый)
  - Performance warnings на AVR
- `string` — UTF-8 байты, C-layout, индексация, итерация, встроенные методы
- Специальные типы: `void`, `never`, `any`
- Null: `T | null`, optional `?`, optional chaining `?.`, nullish coalescing `??`
  - C-представление `T | null` (struct с флагом)
  - Embedded-паттерны: sentinel value, отдельный флаг
- Конвертация типов: число ↔ строка, JS-совместимые функции (`parseInt`, `parseFloat`)
- `Date` — создание, методы, форматирование
- Массивы: `T[]` (динамический), `T[N]` (фиксированный), методы, функциональные методы
- `Slice<T>` / `MutSlice<T>` — zero-copy view
- `Map<K,V>`, `Set<T>` — API, ownership, embedded-паттерны
- `Object` — статические методы
- Tuples: фиксированные, labeled, readonly, optional, rest, spread
- `Clone` — интерфейс, `clone()`, `structuredClone()`
- Type aliases (`type`)
- String literal union
- Utility types: `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`
- `Buffer`, `DataView`

**Источник:** `spec/03-types.md`

---

### 04-classes.md — Классы, интерфейсы, Enum, Generics

**Цель:** объектная система языка.

- Generics: синтаксис, bounds (`implements`/`extends`), монорпизация, ownership с generics
- Extension methods: объявление, импорт, конфликты
- Enum: числовой, строковый, `const enum`, утилиты, в switch/match
- Интерфейсы: данные vs контракт с методами, fat pointer, vtable
- `instanceof` — type narrowing через vtable
- Классы:
  - Нет наследования (кроме `extends Error`), композиция
  - Модификаторы: `public`, `private`, `static`, `mut`, `move`
  - Семантика `this` и доступ к полям
  - `readonly` поля
  - Конструктор: автогенерация, явный, `private`
  - Value object паттерн
  - Builder паттерн с `move`
- Выравнивание: `@packed`, `@align(N)`, диагностика padding
- Декораторы: обзор, ссылка на полный раздел

**Источник:** `spec/04-classes.md`, `spec/13-decorators.md`

---

### 05-memory.md — Модель памяти и Ownership

**Цель:** ключевая фича языка — безопасная работа с памятью.

- Типы владения: `T` (Owner), `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>`, `Slice<T>`
- Базовые правила: примитивы copy, сложные — ownership
- Owner (T): move при присвоении и передаче
- `Ref<T>`: immutable borrow, правила, запрет хранения в полях, паттерны решения
- `Mut<T>`: mutable borrow, один за раз
- `Shared<T>`: ARC, `Weak<T>` для разрыва циклов
- Правила Borrow Checker (4 правила)
- Матрица передачи аргументов (let/const/Ref/Mut/Shared → Ref/Mut/T/Shared)
- Interior Mutability — почему её нет
- `@static let` — глобальное мутабельное состояние
- Scope Constraint (без lifetime аннотаций): 4 правила
- Автоматический Drop и `goto cleanup`
- `Iterable<T>` — пользовательские итерируемые типы
- Доступ к полям и деструктуризация (borrow vs move)
- Срезы (borrow vs owned)
- Move из массива, мутация при borrow
- Возврат borrow из метода
- Замыкания: правила захвата, явный список захвата, Mut-closure через await

**Источник:** `spec/05-memory.md`

---

### 06-errors.md — Обработка ошибок

**Цель:** система ошибок — Result-based без setjmp/longjmp.

- Принцип: `throw`/`try`/`catch` в TS → Result-структуры в C
- Объявление `throws` в сигнатуре
- `Error` — базовый класс, `error.stack`
- `throw`, `try`/`catch`/`finally`
- Union catch, exhaustive handling
- Оператор `?` (propagate)
- Оператор `!` (unwrap/panic)
- C-output: Result-структуры, `if/else` по `ok` и `_kind`
- Ownership при ошибках (cleanup через `goto`)
- Ограничения

**Источник:** `spec/06-errors.md`

---

### 07-concurrency.md — Конкурентность

**Цель:** три уровня конкурентности и как их использовать.

- Обзор трёх механизмов (async/await, threads, ISR)
- **Async/Await:**
  - Архитектура async runtime (state machines)
  - State machine size, stack safety на embedded
  - `Promise<T>`: создание, `.then`/`.catch`/`.finally`
  - `Promise.all`, `Promise.any`, `Promise.race`, `Promise.allSettled`
  - Правила `await`, `async main`
  - Рекурсивные async функции
  - `@embedded.stack` — явный стек
  - Отмена задач: `AbortController`, `AbortSignal`
  - `AsyncMutex`
- **Threads (std/threads):**
  - Изоляты без общей памяти
  - `Atomic<T>`, `AtomicArray<T>`
  - `channel<T>`: bounded MPMC, ISR-safe операции
  - `select`: ожидание нескольких каналов
  - `Readonly<T>`: zero-copy sharing
  - `Thread<T>`: типизированный результат
  - Правила Thread.spawn, Send-проверка
- **@embedded.isr:**
  - `Volatile<T>` — MMIO регистры
  - ISR: сигнатура, правила, паттерны
  - `std/sync` — критические секции
  - `EmbeddedSignal` — мост ISR → async
- Embedded-аннотации: `@embedded.inline`, `@embedded.noHeap`
- `@signal` — POSIX-сигналы (desktop)
- Async generators: `async function*`, `for await`, `close()`
- Кооперативная многозадачность через генераторы

**Источник:** `spec/07-concurrency.md`

---

### 08-modules.md — Модули и C interop

**Цель:** как работает модульная система и взаимодействие с C.

- Export: именованные, `export default` запрещён
- Import: именованный, namespace, `import type`
- Порядок инициализации модулей, циклические импорты
- Module-level переменные
- Path aliases (`#`, `~`)
- Точка входа: `"main"`, `"builds"`, генерация C main
- Библиотеки: `"type": "library"`
- `.d.tsc` файлы: 5 видов деклараций
  - C struct, opaque type, C функции, константы, MMIO-регистры
  - Link конфигурация (system, bundled, fetch)
- `native` — inline C (синтаксис, интерполяция, ограничения)
- Callbacks: `FnPtr<T>`, `TSC_CLOSURE_*` макросы
- `unsafe {}` — отключение проверок
- `@platform` — условная компиляция
- Declaration Merging
- Variadic C функции: тип `Scalar`

**Источник:** `spec/08-modules.md`

---

### 09-build.md — Система сборки

**Цель:** как устроен проект, сборка, пакеты.

- Типы проектов: executable, библиотека, C-wrapper, platform package
- `tsc.package.json`: все поля
- C-wrapper: структура, публикация, link конфигурация (system/bundled/fetch)
- Platform package: `declare platform {}`, платформенные поля
- CLI: `tsclang build`, флаги (`--outDir`, `--target`, `--profile`, `--optimize`)
- Пакетный менеджер: `tsclang install`, `tsclang publish`, `tsclang search`
- Монорепозиторий: `"workspaces"`
- Сборка для embedded: AVR, ARM, ретро-платформы
- CMakeLists.txt: генерация, кастомизация
- Profiles: debug/release, оптимизация

**Источник:** `spec/09-build.md`

---

### 10-stdlib.md — Стандартная библиотека

**Цель:** справочник по всем модулям stdlib.

- Принципы: единый API через `std/`, lazy loading, tree-shaking
- Глобальные объекты: `console`, `Math`, `process`, таймеры, `performance`
- `Error` — базовый класс
- `Map<K,V>`, `Set<T>` — API, ownership
- `Buffer`, `DataView`
- `std/io` — Reader/Writer
- `std/fs` — файловые операции
- `std/net` — fetch, HTTP-сервер, TCP/UDP
- `std/ws` — WebSocket
- `std/math` — константы и методы (полная таблица)
- `std/string` — Unicode, кодирование, форматирование
- `std/json` — парсинг и сериализация
- `std/url` — URL и URLSearchParams
- `std/blob` — Blob и File
- `std/formdata` — multipart/form-data
- `std/regex` — NFA-regex, синтаксис, API
- `std/random` — Random, HardwareRandom
- `std/temporal` — PlainDateTime, Instant, Duration
- `std/reactive` — ReactiveVar, computed, effect
- `std/hal` — GPIO, UART, SPI, I2C
- `std/embedded` — Volatile, pointer, HashMap, StaticMap
- Совместимость с платформами (таблица)

**Источник:** `spec/10-stdlib.md`, `spec/19-stdlib-*.md`

---

### 11-compiler.md — Архитектура компилятора

**Цель:** для контрибьюторов и тех, кто хочет понять внутренности.

- Фазы компиляции (Parse → AST → Decorator → Typecheck → IR → Codegen)
- IR: basic blocks, инструкции, phi nodes
- Name mangling (формальная схема)
- Debug info: `#line` директивы, DAP-сервер
- Consumer-side monomorphization
- Incremental compilation (roadmap)
- Optimization levels (O0–O3, Os)
- Error messages: формат, категории, коды ошибок

**Источник:** `spec/11-compiler.md`

---

### 12-migration.md — Migration Guide: TypeScript → TSClang

**Цель:** помочь TS-разработчику перенести код.

- Автоматические правки (`tsclang migrate`)
- Что работает как есть (примеры)
- Что требует ручной правки (конкретные паттерны)
- Несовместимые паттерны (таблица альтернатив)
- Что добавляет TSClang (чего нет в TS)

**Источник:** `spec/12-migration.md`

---

## Сводная таблица разделов

| # | Файл | Содержание | Источник | Объём |
|---|------|-----------|----------|-------|
| 01 | intro | Что такое TSClang, быстрый старт, CLI | `spec/01-intro.md` | ~30 KB |
| 02 | syntax | Синтаксис, операторы, циклы, match/switch | `spec/02-syntax.md` | ~50 KB |
| 03 | types | Типы, числа, строки, массивы, Map/Set, tuples, utility types | `spec/03-types.md` | ~80 KB |
| 04 | classes | Классы, интерфейсы, enum, generics, extension methods | `spec/04-classes.md`, `spec/13-decorators.md` | ~40 KB |
| 05 | memory | Ownership, borrow checker, Ref/Mut/Shared, замыкания | `spec/05-memory.md` | ~50 KB |
| 06 | errors | throw/try/catch, Result, `?`/`!` операторы | `spec/06-errors.md` | ~15 KB |
| 07 | concurrency | async/await, threads, ISR, atomic, channels, generators | `spec/07-concurrency.md` | ~70 KB |
| 08 | modules | Импорт/экспорт, .d.tsc, native, unsafe, @platform | `spec/08-modules.md` | ~50 KB |
| 09 | build | Сборка, пакеты, C-wrapper, платформы | `spec/09-build.md` | ~50 KB |
| 10 | stdlib | Справочник всех std-модулей | `spec/10-stdlib.md`, `spec/19-stdlib-*.md` | ~60 KB |
| 11 | compiler | Архитектура компилятора (для контрибьюторов) | `spec/11-compiler.md` | ~30 KB |
| 12 | migration | Гайд миграции TypeScript → TSClang | `spec/12-migration.md` | ~15 KB |
| | | | **Итого** | **~540 KB** |

## Порядок написания

Рекомендуемый порядок (от самого важного и частого к продвинутому):

1. `01-intro.md` — входная точка для всех
2. `02-syntax.md` — базовые конструкции
3. `05-memory.md` — ключевая фича, нужна всем
4. `03-types.md` — система типов
5. `04-classes.md` — объектная система
6. `06-errors.md` — обработка ошибок
7. `08-modules.md` — модули и C interop
8. `07-concurrency.md` — конкурентность
9. `10-stdlib.md` — справочник API
10. `09-build.md` — система сборки
11. `12-migration.md` — миграция с TS
12. `11-compiler.md` — внутренности (для контрибьюторов)

## Оценка объёма

| Документ | Ориентировочный объём |
|----------|-----------------------|
| 01-intro | ~30 KB |
| 02-syntax | ~50 KB |
| 03-types | ~80 KB |
| 04-classes | ~40 KB |
| 05-memory | ~50 KB |
| 06-errors | ~15 KB |
| 07-concurrency | ~70 KB |
| 08-modules | ~50 KB |
| 09-build | ~50 KB |
| 10-stdlib | ~60 KB |
| 11-compiler | ~30 KB |
| 12-migration | ~15 KB |
| **Итого** | **~540 KB** |

## Формат

- Markdown (.md)
- Каждый файл — самостоятельный раздел
- Заголовки H1 для названия раздела, H2/H3 для подразделов
- Таблицы для справочной информации
- Блоки кода с указанием языка (```typescript, ```c, ```bash)
- `> **Примечание:**` для важных замечаний
- `> **Предупреждение:**` для критичных ограничений
