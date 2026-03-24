# TSClang — Потенциальные проблемы дизайна

> Независимый анализ поверх EDIT.md. Дублирующие пункты исключены.

---

## 1. Внутренние противоречия дизайна

### 1.1 Ключевое слово `type` — два разных подхода к типизации

```typescript
type UserId = i32          // номинальный (opaque) — отличается от i32
type Point = { x: f64 }   // структурный — совместим с любым { x: f64 }
```

Одно ключевое слово, противоположная семантика в зависимости от RHS. Пользователь не может предсказать поведение без знания правила. Хуже — это не указано явно в сигнатуре типа.

### 1.2 ~~`interface` имеет два несовместимых режима~~ ✅ РЕШЕНО

**Решение:** введено явное разделение `type` vs `interface`:
- `type Point = { x: f64; y: f64 }` — **гарантированно** `typedef struct`, методы запрещены ошибкой компилятора. Используй для embedded MMIO, бинарных структур, ABI-критичных данных.
- `interface Point { x: f64; y: f64 }` — data struct сейчас, может получить методы позже (тогда ABI изменится на vtable). Используй для stdlib-типов и API.

Ключевое слово `struct` удалено из языка — заменено на `type` (data-only) или `interface`.

### 1.3 `Date` vs `std/temporal` — конфликт соглашений в одном языке

```typescript
new Date(2024, 2, 20)          // месяц 0-indexed: 2 = март
new PlainDate(2024, 3, 20)     // месяц 1-indexed: 3 = март
```

Оба типа существуют в одном языке. Temporal создавался именно чтобы исправить эту путаницу в JS. Держать legacy `Date` с 0-indexed месяцами и одновременно Temporal с 1-indexed — значит воспроизвести старую ошибку JS намеренно.

### 1.4 Spread + const — непоследовательно

```typescript
const arr = [1, 2, 3]
const copy = [...arr]    // ❌ ошибка: cannot spread const

const arr2: Shared<i32[]> = [1, 2, 3]
const copy2 = [...arr2]  // ✅ ok — retain
```

Spread примитивного массива из const должен быть тривиальной копией — никаких проблем с ownership. Запрет spread на const примитивных массивов — ложная безопасность, которая ломает самый распространённый JS-паттерн.

### 1.5 Асимметрия `capacity` vs `length`

```typescript
arr.length = 10         // ❌ ошибка компилятора: use arr.resize(10)
arr.capacity = 200      // ✅ — записывается напрямую
```

`length` readonly, `capacity` — read/write. Но запись в `capacity` ниже `length` обрезает данные. Это более опасная операция, чем прямое присвоение length, и тем не менее она разрешена. Логика обратная ожидаемой.

---

## 2. Проблемы системы типов

### 2.1 ~~Union типы как параметры функций — нет C-output~~ ✅ РЕШЕНО

**Решение:** non-nullable union (`string | i32`, `A | B`) — **ошибка компилятора**. Единственный допустимый union — `T | null`. Для полиморфизма — class-иерархия (`abstract class`) или discriminated union через enum. Убирает пробел кодогенерации, упрощает C-output, сохраняет предсказуемость.

### 2.2 ~~Discriminated union в match — не специфицировано~~ ✅ РЕШЕНО

**Решение:** два паттерна в `match`:
1. **Interface fat pointer** — `match (shape) { Circle { r } => ..., _ => ... }` — сравнение vtable-адресов (instanceof под капотом). `_` обязателен для interface (компилятор не знает всех реализаций).
2. **type с литеральным дискриминатором** — `match (s) { { kind: "circle", r } => ... }` — для `type Circle2D = { kind: "circle"; r: f64 }`, runtime сравнение строк в C.

Оба паттерна задокументированы в CONCEPT.md §match.

### 2.3 ~~Generics без bounds — криптические ошибки~~ ✅ РЕШЕНО

**Решение:** добавлены constraint bounds через `implements` / `extends` (синонимы). `implements` семантически точнее ("T реализует контракт"), `extends` допустим для совместимости с TS-привычками. Линтер рекомендует `implements`. Структурные bounds (`T implements { id: i32 }`) тоже поддерживаются.

### 2.4 ~~`instanceof` — полностью отсутствует~~ ✅ РЕШЕНО

**Решение:** `instanceof` работает через сравнение vtable-адресов — O(1), без RTTI. Только для interface-переменных (fat pointer). Компилятор выполняет type narrowing внутри `if (x instanceof T)`. `instanceof` на class-переменной — ошибка компилятора (тип и так известен статически). `extends` запрещён для обычных классов — полиморфизм только через `interface` + `implements`; исключение: `extends Error` для error-классов.

### 2.5 ~~`select` — не type-safe~~ ✅ РЕШЕНО

**Решение:** `result` — opaque тип, обращение к полям напрямую — ошибка компилятора. Единственный способ потребить — `match (result) { { msg } => ..., { err } => ..., { timeout } => ... }`. Внутри каждого arm компилятор сужает тип (msg: `Message`, не `Message | null`). Exhaustiveness проверяется — компилятор знает все поля конкретного `select{}`. C-output без изменений — tagged union с `arm_id`.

---

## 3. Ownership / Memory — незамеченные проблемы

### 3.1 ~~`Ref<T>` в полях запрещено — блокирует view-паттерны~~ ✅ РЕШЕНО

**Решение:** два отдельных решения для двух разных паттернов.

**Parser/Renderer (view-паттерн):** передавать `Ref<T>` через параметры методов — единственная проблема многословность, технических ограничений нет ни на desktop ни на embedded. Для целевых доменов TSClang (embedded + системный код) методов обычно немного, это приемлемо.

**User Iterator:** итератор — замыкание, не класс. `Ref<T>` в замыкании разрешён (стековый, scope автоматически ограничен). Протокол — `interface Iterable<T> { iter(): mut () => T | null }`. `for...of` компилятор разворачивает в while-цикл с вызовом замыкания. Работает на embedded — нет heap, нет ARC. Подробно — CONCEPT.md §Iterable.

### 3.2 ~~`Shared<T>` → нельзя `Mut<T>` — нет interior mutability~~ ✅ РЕШЕНО

**Решение:** interior mutability не нужна для целевых доменов TSClang.

- **Embedded** — `Shared<T>` нет вообще (нет heap), проблема не применима.
- **Desktop single-thread** — event loop однопоточный, `Mut<T>` через ownership достаточно.
- **Desktop multi-thread** — actor-паттерн через `Channel` покрывает все кейсы (кэши, пулы, логгеры). Счётчики — `Atomic<T>`.
- **Реактивность** — `std/reactive` с explicit-deps работает без interior mutability.

`Shared<T>` остаётся строго read-only. Это сильная гарантия, не ограничение.

### 3.3 ~~Deconstructuring — нет partial move~~ ✅ РЕШЕНО

**Решение:** три правила:

1. **Деструктуризация без аннотации** — всегда borrow: `const { name, age } = user` → `name: Ref<string>, age: i32`
2. **Деструктуризация с аннотацией типа на паттерн** — move: `const { name, age }: { name: string; age: i32 } = user` → name moved, age copied. Линтер предупреждает.
3. **Деструктуризация в `match`** — всегда move: match потребляет значение целиком, все ветки exhaustive. Явный borrow через `{ field: Ref<T> }`.

Дополнительно: переименование в зарезервированное имя типа (`{ name: string }`) — ошибка компилятора.

### 3.4 ~~Cleanup при `throw` — код дублируется квадратично~~ ✅ РЕШЕНО

**Решение:** `goto cleanup` — единая точка очистки, O(N+M) вместо O(N×M). Все owned указатели объявляются `NULL` в начале функции (C99-совместимо). Loop-local переменные — inline free перед `goto`. Вложенные scopes — scope-local переменные освобождаются inline, outer через `cleanup`. Подробно с примерами — CONCEPT.md §"Стратегия cleanup при throw / ?".

### 3.5 ~~`any` — не различает owned vs borrowed~~ ✅ РЕШЕНО

**Решение:** `.d.tsc` файлы — C interop через типизированные декларации. Три вида:
1. `declare type Foo = { ... }` — C struct с известным layout (уже работало)
2. `declare opaque type Foo { destructor: c_free_fn }` — opaque handle, компилятор вызывает деструктор через `goto cleanup`
3. `declare function` с bare `T` (owned) или `Ref<T>` (borrowed) — существующая ownership система

`any` остаётся как escape hatch для случаев с непоследовательным C ownership. Подробно — CONCEPT.md §"Синтаксис .d.tsc файлов".

---

## 4. Async — незамеченные проблемы

### 4.1 ~~Размер state machine на embedded — риск stack overflow~~ ✅ РЕШЕНО

**Решение:** компилятор минимизирует struct — только переменные живые через хотя бы один await. Статический анализ worst-case async stack: обход графа вызовов, сумма sizeof по глубочайшему пути. При наличии `stack_size` в platform profile — превышение = ошибка компилятора с указанием виновника. Флаг `--report-stack` для профилирования без сборки. Подробно — CONCEPT.md §"State machine size и stack safety на embedded".

### 4.2 ~~`Promise.all` с разными типами ошибок — не специфицировано~~ ✅ РЕШЕНО

**Решение:** throws-union — специальный случай, допустим только в позиции `throws` (не как тип значения). Компилятор выводит union из ошибок всех входящих промисов. Fail-fast: первая ошибка по порядку индекса в массиве побеждает (на однопоточном event loop истинной одновременности нет). Для сбора всех ошибок — `Promise.allSettled` с типизированным кортежем результатов. Подробно — CONCEPT.md §"Promise.all" и §"Promise.allSettled".

### 4.3 ~~`AbortSignal` + однопоточный event loop — `atomic_bool` лишний~~ ✅ РЕШЕНО

**Решение:** `AbortSignal` — `Readonly<>`, может быть отправлен в `Thread.spawn`. Значит `abort()` может прийти из worker thread → `atomic_bool` оправдан на desktop. На embedded нет threads → компилятор генерирует `bool`. Это платформо-зависимый C-output, как с `usize`. Подробно — CONCEPT.md §"Отмена задач — AbortSignal".

### 4.4 ~~`onAbort` callback — race condition при threads~~ ✅ РЕШЕНО

**Решение:** `abort()` никогда не выполняет callbacks синхронно. Он только атомарно ставит флаг и планирует callbacks на event loop. Callbacks всегда выполняются в event loop-контексте — независимо откуда вызван `abort()`. Гонка невозможна.

---

## 5. Thread система — фундаментальный пробел

### 5.1 ~~`await` недоступен в `Thread.spawn` — нет bridge между async и threads~~ ✅ РЕШЕНО

**Решение:** Это намеренное дизайн-решение, не проблема. Async и threads — два разделённых мира: event loop неблокирующий, OS threads блокирующие. Канал — единственный bridge, и это правильно. OS-блокировка потока при полном канале — ожидаемое поведение, именно для этого и нужны потоки. Подробно — CONCEPT.md §"Thread<T> — типизированный результат".

### 5.2 ~~`Thread.spawn` не параметризован результатом~~ ✅ РЕШЕНО

**Решение:** Добавлен `Thread<T>` с типизированным `join()`. Обе формы валидны:
- `Thread<T>` + `await t.join()` — сахар для "запустить и получить результат", под капотом `channel<T>(1)`
- Явный `channel<T>` — для стриминга, нескольких значений, `select`

Компилируются в идентичный C-output. Подробно — CONCEPT.md §"Thread<T> — типизированный результат".

---

## 6. Стандартная библиотека — проблемы

### 6.1 ~~`gmtime` — не thread-safe~~ ✅ РЕШЕНО

**Решение:** `Date` (legacy) остаётся только для TS-совместимости. Для всей новой работы с временем — `std/temporal` (PlainDate, Instant, ZonedDateTime и т.д.), который не использует `gmtime`.

### 6.2 ~~Variadic C функции — не специфицировано~~ ✅ РЕШЕНО

**Решение:** `std/libc` экспортирует тип `Scalar` — объединение всех C-совместимых скалярных типов. Variadic функции объявляются с `...args: Scalar[]`. Пользовательские обёртки могут использовать `Scalar` как обычный тип параметра — компилятор генерирует `vprintf`-вызов при spread. Формат-строка не проверяется компилятором, только линтером. Подробно — CONCEPT.md §"Variadic C функции — тип Scalar".

### 6.3 `Reader.read(buf: u8[])` — принимает owned буфер

```typescript
interface Reader {
    read(buf: u8[]): i32 | null throws IOError  // buf — move!
}
```

После вызова `read(buf)` буфер `buf` moved и недоступен. Это противоречит стандартному паттерну I/O где один буфер используется многократно в цикле. Должно быть `Mut<u8[]>`.

### 6.4 ~~`Math.random()` — нет способа контролировать seed~~ ✅ РЕШЕНО

**Решение:** `std/random` с `new Random(seed)` (все платформы), `SecureRandom` (desktop/server), `HardwareRandom` (embedded). `Math.random()` оставлен как JS-совместимое легаси без seed.

---

## 7. Форматирование / DX

### 7.1 Mandatory formatting — ломает incremental compilation в IDE

Если разработчик печатает `a+b` — IDE получает syntax error вместо semantic error. Весь language server (автодополнение, типы, рефакторинг) перестаёт работать до исправления форматирования. Форматирование как compile error несовместимо с современными IDE workflow.

### 7.2 `new Array(N)` — семантически ломает JS-код

```typescript
let arr = new Array(100)  // capacity=100, length=0 — в TSC
// В JS: length=100
for (let i = 0; i < arr.length; i++) { ... }  // выполнится 0 раз!
```

Самый вероятный источник silent bugs при портировании JS кода. Ни компилятор, ни runtime не предупредят.

### 7.3 `for (let item of arr)` — присвоение `item` не специфицировано

```typescript
for (let item of arr) {
    item = newValue  // это ошибка? тихий no-op? замена элемента?
}
```

`let item` — `Mut<T>`. Но `item = x` — это переприсвоение переменной `item`, а не `*item = x`. Семантика не описана: либо это ошибка компилятора, либо тихо игнорируется, либо заменяет элемент массива.

---

## 8. Критические пробелы спецификации

### 8.1 Conditional move через `??` — borrow checker underspecified

```typescript
let s: string | null = getString()
const result = s ?? "default"
// если s != null — s moved. если s == null — s не moved.
// что borrow checker знает о s после этой строки?
```

Conditional move — нетривиальная семантика. После `??` переменная `s` может быть либо moved, либо null. Что произойдёт с `s ?? default1 ?? default2`? Нигде не специфицировано.

### 8.2 Async closures — не упомянуты

```typescript
const fn = async () => await fetchUser(1)           // допустимо?
arr.map(async item => await process(item))          // ?
await Promise.all(ids.map(id => fetchUser(id)))     // этот пример есть в концепте
```

Последний пример из концепта предполагает что `fetchUser` как non-async стрелка возвращает `Promise<User>`. Но явный `async () => ...` синтаксис для лямбд нигде не описан.

### 8.3 Match exhaustiveness для union типов

```typescript
function process(x: string | i32): void {
    match (x) {
        // как написать type-based branch?
        // нет синтаксиса "case string =>"
    }
}
```

Exhaustiveness match описана для enum и null-checks. Для union типов `string | i32` нет синтаксиса type-based branch. Единственный способ — через `typeof` или метаданные, которых в TSC нет.

### 8.4 Cross-compilation — нет pinned toolchain

```json
{ "target": "avr", "mcu": "atmega328p" }
```

Нет поля `toolchain` — где находится `avr-gcc`? На разных машинах путь разный. Нет механизма pinned toolchain (как в Rust `rust-toolchain.toml`). CI воспроизводимость невозможна без внешних соглашений.

---

---

## 9. Новые проблемы — семантическое ревью

### 9.1 ~~`Error` base class — не определён~~ ✅ РЕШЕНО

**Решение:** добавлен глобальный базовый класс `Error { message: string }`. `throw` принимает только наследников `Error` — ошибка компилятора иначе. Осознанный разрыв с TS (где `throw any`), обоснование зафиксировано в CONCEPT.md. Все error-классы в примерах обновлены на `extends Error`.

### 9.2 ~~`Map<K, V>` — не определён в stdlib~~ ✅ РЕШЕНО

**Решение:** добавлен раздел `Map<K, V>` в Standard Library → Globals. Hash map с открытой адресацией, монорфизация, ownership semantics для значений, запрещён на embedded.

### 9.3 ~~`Promise.then()` — используется, не определён~~ ✅ РЕШЕНО

**Решение:** добавлен раздел `Promise.then / .catch / .finally` с полным описанием семантики. Пример в `Promise.race` переписан через `async function withTimeout(ms)` без `.then()`.

### 9.4 ~~`await tx.send()` внутри `Thread.spawn` — семантически неоднозначно~~ ✅ РЕШЕНО

**Решение:** `await` внутри `Thread.spawn` — ошибка компилятора. `tx.send(msg)` и `rx.recv()` без `await` в thread-контексте = блокирует OS-поток (mutex/condvar). Channel API теперь показывает оба режима явно.

### 9.5 ~~Thread.spawn — нет рекурсивного Send-check для полей~~ ✅ РЕШЕНО

**Решение:** добавлена рекурсивная Send-проверка. Компилятор обходит все поля передаваемого типа; `Shared<U>`, `Weak<U>`, `Ref<U>`, `Mut<U>` в любом вложенном поле — ошибка компилятора с указанием пути (`field X.Y is not thread-safe`).

### 9.6 ~~Closure capture примитивов — не специфицировано~~ ✅ РЕШЕНО

**Решение:** примитивы всегда копируются в момент создания замыкания (copy semantics), сложные типы захватываются по `Ref` по умолчанию. Явно зафиксировано в разделе "Замыкания → Правила захвата".

### 9.7 ~~Тип замыкания с `Mut<T>` захватом~~ ✅ РЕШЕНО

**Решение:** замыкание с `Mut<T>` захватом имеет тип `() => T` — как и любое другое. Отдельный тип `mut () => T` рассматривался и отклонён: mutation явна через capture list, добавление `mut` в тип вирусно заражает весь higher-order API. Решение задокументировано в CONCEPT.md с обоснованием.

### 9.8 ~~Entry point — `async function main()` не является top-level statement~~ ✅ РЕШЕНО

**Решение:** полностью переработана система определения entry point. Приоритетная цепочка из 5 правил: `"main"` в конфиге → `main.tsc` → единственный файл → единственный файл без export → библиотека. `index.tsc` намеренно не является специальным именем (`index.js` — конвенция npm для экспортов, не запуска). Top-level код entry-файла автоматически становится `main()` в C; при наличии `await` на верхнем уровне — запускается event loop.

### 9.9 `Atomic<T>` — два layout, C-output показывает только один

Spec: "если `Atomic<T>` не уходит в `Thread.spawn` — размещается на стеке без ref count". Но C-output (`Atomic_i32`) всегда содержит `ref_count`. Нужно показать оба варианта и описать escape analysis.

### 9.10 `new Readonly<T>({ ... })` — синтаксис struct-литерала с type parameter

Ранее было `new Readonly(new Config { ... })` — undefined синтаксис. Исправлено на `new Readonly<Config>({ ... })`. Нужно зафиксировать правило: `new Readonly<T>(literal)` принимает struct-литерал совместимый с `T` структурно.

### 9.11 ~~`select` — контекст использования не указан~~ ✅ РЕШЕНО

**Решение:** `select` — только async-контекст. В `Thread.spawn` `await` запрещён компилятором — `await select(...)` не скомпилируется там автоматически. Зафиксировано в разделе `select`.

### 9.12 ~~`Buffer.length: i32` — ограничение 2GB~~ ✅ РЕШЕНО

**Решение:** добавлен тип `usize` — платформенный беззнаковый тип размера, транслируется в `size_t` в C. 64 бит на desktop/server, 32 на Cortex-M/ESP, 16 на AVR. `Buffer.length`, индексы и смещения теперь используют `usize`.

---

## Приоритизация рисков

| # | Проблема | Критичность | Сложность fix |
|---|----------|-------------|---------------|
| 1 | ~~Union types как параметры → нет C-output~~ | ✅ решено | — |
| 2 | ~~`interface` dual semantics~~ | ✅ решено | — |
| 3 | ~~`instanceof` отсутствует~~ | ✅ решено | — |
| 4 | ~~`gmtime` не thread-safe~~ | ✅ решено | — |
| 5 | ~~`Error` base class не определён~~ | ✅ решено | — |
| 6 | ~~`Map<K, V>` не определён в stdlib~~ | ✅ решено | — |
| 7 | ~~`await` в `Thread.spawn` — семантика не определена~~ | ✅ решено | — |
| 8 | ~~`Promise.then()` используется, не определён~~ | ✅ решено | — |
| 9 | Async closures не специфицированы | 🟠 серьёзная | Средняя |
| 10 | ~~Thread.spawn — нет рекурсивного Send-check~~ | ✅ решено | — |
| 11 | ~~`select` не type-safe~~ | ✅ решено | — |
| 12 | ~~`Shared<T>` без interior mutability~~ | ✅ решено | — |
| 13 | `new Array(N)` ломает JS-код | 🟠 серьёзная | Низкая |
| 14 | ~~Entry point detection — `async function main()`~~ | ✅ решено | — |
| 15 | ~~Тип замыкания с `Mut<T>` захватом~~ | ✅ решено | — |
| 16 | ~~State machine size на embedded — риск stack overflow~~ | ✅ решено | — |
| 17 | `Date` 0-indexed vs Temporal 1-indexed | 🟡 важная | Низкая |
| 18 | `Reader.read(buf)` — move вместо Mut | 🟡 важная | Низкая |
| 19 | `??` conditional move — borrow checker underspecified | 🟡 важная | Высокая |
| 20 | Variadic C функции не типизированы | 🟡 важная | Высокая |
| 21 | Pinned toolchain отсутствует | 🟡 важная | Низкая |
| 22 | `Atomic<T>` dual layout не показан в C-output | 🟡 важная | Низкая |
| 23 | ~~`Buffer.length: i32` — ограничение 2GB~~ | ✅ решено | — |
| 24 | Closure capture примитивов не описан | 🟡 важная | Низкая |
| 25 | ~~`select` — контекст (async vs thread) не указан~~ | ✅ решено | — |
