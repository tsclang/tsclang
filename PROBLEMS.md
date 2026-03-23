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

### 3.3 Deconstructuring — нет partial move

```typescript
const { name } = user    // всегда Ref<string> — borrow
const name: string = user.name  // move — только через явную аннотацию
```

Нет синтаксиса для partial move через деструктуризацию. В Rust `let User { name, age } = user` — это partial move. В TSC деструктуризация всегда создаёт borrows. Это вынуждает писать дополнительный код при построении нового объекта из полей старого.

### 3.4 Cleanup при `throw` — код дублируется квадратично

```c
// сгенерировано:
Foo* a = Foo_new();
Bar* b = Bar_new();
if (!_r.ok) {
    Foo_free(a);  // ← дубль
    Bar_free(b);  // ← дубль
    return ...;
}
use(a, b);
Foo_free(a);
Bar_free(b);
```

Cleanup-код дублируется для каждой `?`-точки. Для функции с N owned переменных и M точек propagation — O(N×M) строк cleanup в C. Rust решает через единую `drop` точку в конце scope. Альтернатива: `goto cleanup` подход с флагами.

### 3.5 `any` — не различает owned vs borrowed

```typescript
function getFromC(): any { ... }
let val: any = getFromC()
// это owned pointer? borrowed? stack pointer?
```

`any` = `void*`, borrow checker отключён. Нет способа пометить "это owned any" (нужен `free`) vs "это borrowed any" (не нужен `free`). C interop — главный источник memory bugs, и текущий подход создаёт неотслеживаемые утечки и dangling pointers.

---

## 4. Async — незамеченные проблемы

### 4.1 Размер state machine на embedded — риск stack overflow

```typescript
async function complexOp(): Result {
    const a = await step1()   // переменная живёт через все await
    const b = await step2(a)
    const c = await step3(b)
    // ... 10+ await точек
}
```

State machine на стеке включает ВСЕ локальные переменные живые через любой await. На AVR ATmega328p стек — 2KB. Несколько вложенных async вызовов легко переполняют стек без предупреждения. Компилятор должен вычислять и выдавать worst-case stack usage для embedded.

### 4.2 `Promise.all` с разными типами ошибок — не специфицировано

```typescript
async function a(): void throws IOError { ... }
async function b(): void throws NetworkError { ... }
await Promise.all([a(), b()])  // throws... что?
```

Если обе кидают разные ошибки — Promise.all должен кидать `IOError | NetworkError`. Не описано. Если `a()` упала а `b()` нет — теряется ли ошибка b? Нужна явная спецификация error union для Promise.all.

### 4.3 `AbortSignal` + однопоточный event loop — `atomic_bool` лишний

```c
struct AbortSignal {
    atomic_bool aborted;  // ← зачем если single-threaded?
};
```

Декларируется что event loop однопоточный и `Shared<T>` поэтому не атомарен. Но AbortSignal использует `atomic_bool`. Либо event loop НЕ гарантированно однопоточный (противоречие), либо `atomic_bool` — лишний overhead. На embedded это значимо.

### 4.4 `onAbort` callback — race condition при threads

```typescript
signal.onAbort(() => close(fd))  // вызывается синхронно в потоке abort()
```

Если `abort()` вызван из worker thread — callback выполняется в worker thread, пока основной поток может быть в середине state machine. Это race condition без предупреждения компилятора, даже несмотря на запрет `await` внутри callback.

---

## 5. Thread система — фундаментальный пробел

### 5.1 `await` недоступен в `Thread.spawn` — нет bridge между async и threads

```typescript
const t = Thread.spawn(() => {
    // это синхронная функция — нет await
    tx.send(result)   // блокирующий вызов если канал полон
})
```

Если канал полон — поток блокируется полностью (OS block). Нет механизма сделать CPU-bound поток async-aware. Async и threads работают как два несвязанных мира без composition.

### 5.2 `Thread.spawn` не параметризован результатом

```typescript
const t = Thread.spawn(() => {
    return heavyComputation()  // куда уходит return value?
})
const result = t.join()  // возвращает void?
```

Нет `Thread<T>` с `join(): T`. Единственный способ вернуть результат — через канал. Это лишний verbosity для простых parallel tasks.

---

## 6. Стандартная библиотека — проблемы

### 6.1 ~~`gmtime` — не thread-safe~~ ✅ РЕШЕНО

**Решение:** `Date` (legacy) остаётся только для TS-совместимости. Для всей новой работы с временем — `std/temporal` (PlainDate, Instant, ZonedDateTime и т.д.), который не использует `gmtime`.

### 6.2 Variadic C функции — не специфицировано

```typescript
import { printf } from "libc"
printf("Hello %s, age %d", name, age)  // variadic — как типизировать?
```

TSC система типов не поддерживает variadic функции. Весь libc interop для debug/logging требует падения в `any` без type safety.

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
| 11 | `select` не type-safe | 🟠 серьёзная | Высокая |
| 12 | `Shared<T>` без interior mutability | 🟠 серьёзная | Высокая |
| 13 | `new Array(N)` ломает JS-код | 🟠 серьёзная | Низкая |
| 14 | ~~Entry point detection — `async function main()`~~ | ✅ решено | — |
| 15 | ~~Тип замыкания с `Mut<T>` захватом~~ | ✅ решено | — |
| 16 | State machine size на embedded — риск stack overflow | 🟡 важная | Средняя |
| 17 | `Date` 0-indexed vs Temporal 1-indexed | 🟡 важная | Низкая |
| 18 | `Reader.read(buf)` — move вместо Mut | 🟡 важная | Низкая |
| 19 | `??` conditional move — borrow checker underspecified | 🟡 важная | Высокая |
| 20 | Variadic C функции не типизированы | 🟡 важная | Высокая |
| 21 | Pinned toolchain отсутствует | 🟡 важная | Низкая |
| 22 | `Atomic<T>` dual layout не показан в C-output | 🟡 важная | Низкая |
| 23 | ~~`Buffer.length: i32` — ограничение 2GB~~ | ✅ решено | — |
| 24 | Closure capture примитивов не описан | 🟡 важная | Низкая |
| 25 | ~~`select` — контекст (async vs thread) не указан~~ | ✅ решено | — |
