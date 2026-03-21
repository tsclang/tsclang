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

### 1.2 `interface` имеет два несовместимых режима

```typescript
interface Point { x: f64; y: f64 }        // → typedef struct (без vtable)
interface Drawable { draw(): void }        // → fat pointer (vtable)
```

Добавление первого метода к data-интерфейсу **ломает ABI** — меняет с `struct` на fat pointer. Все сайты использования перестают компилироваться. Это делает эволюцию API болезненной. В Rust эта проблема решена разделением `struct` и `trait`. Слияние `interface` в одно ключевое слово скрывает фундаментальное различие.

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

### 2.1 Union типы как параметры функций — нет C-output

```typescript
type StringOrInt = string | i32
function process(x: StringOrInt): void { ... }
```

`T | null` для сложных типов → указатель (`NULL`), для примитивов → `struct { bool; T }`. Но что с `string | i32`? Это tagged union в C — нужен дискриминант. В CONCEPT нигде не описан C-output для union типов как параметров функции (только для nullable). Это фундаментальный пробел кодогенерации.

### 2.2 Discriminated union в match — не специфицировано

```typescript
const area = match (shape) {
    { kind: "circle", r }  => Math.PI * r * r,
    { kind: "rect", w, h } => w * h,
}
```

Это discriminated union pattern — стандартный TS-паттерн. Но в TSC struct не могут иметь вариантные поля. `shape` — это что? `any`? Unnamed union? Если `kind: string` — это runtime-проверка строки в C. Никакой специфики нет. Это оставляет дыру в самом выразительном паттерне языка.

### 2.3 Generics без bounds — криптические ошибки

```typescript
function sort<T>(arr: Mut<T[]>, cmp: Comparator<T>): void { ... }
sort<User>(users, ...)   // ok
sort<i32[]>(data, ...)   // ошибка — но где именно и почему?
```

Без constraint bounds ошибка возникает при инстанцировании — компилятор укажет на строку в теле `sort`, а не на callsite. В сложных generic функциях это даёт ошибки вида "no member X on type T" — бесполезные для конечного разработчика.

### 2.4 `instanceof` — полностью отсутствует

```typescript
let shape: Drawable = new Circle()
// как проверить что это Circle в runtime?
```

Fat pointer хранит vtable pointer. Чтобы сделать runtime type check нужно либо сравнивать vtable адреса, либо иметь RTTI. Ни то ни другое не специфицировано. Паттерн "dispatch по типу через interface" невозможен без дополнительных соглашений.

### 2.5 `select` — не type-safe

```typescript
const result = await select({
    msg:     rx1.recv(),   // Message | null
    err:     errCh.recv(), // AppError | null
    timeout: after(500)    // null
})
if (result.msg) handleMsg(result.msg)
```

Тип `result` — структура где **ровно одно поле non-null** — это runtime-гарантия, не compile-time. Компилятор не может гарантировать exhaustiveness. Настоящий type-safe select должен возвращать tagged union, где в одной ветке гарантировано только одно значение. Текущая реализация заставляет проверять null во всех ветках вручную.

---

## 3. Ownership / Memory — незамеченные проблемы

### 3.1 `Ref<T>` в полях запрещено — блокирует view-паттерны

```typescript
class View {
    data: Ref<User[]>  // ❌ ошибка: нельзя хранить borrow в поле
}
```

Предложенные альтернативы: owned или `Shared`. Но `Shared<T>` требует ARC с refcount — это overhead для view-объектов. В практическом коде view-паттерн (парсер держит ссылку на input buffer, renderer держит ссылку на scene) очень распространён. Каждый такой случай требует либо передавать буфер в каждый метод явно, либо использовать ARC с overhead.

### 3.2 `Shared<T>` → нельзя `Mut<T>` — нет interior mutability

```typescript
let shared: Shared<Counter> = new Counter()
// как атомарно изменить Counter через shared reference?
```

Из матрицы совместимости: `Shared<T>` → `Mut<T>` = ❌. `Shared<T>` фактически иммутабелен без явного `mut` метода на самом объекте. Нет аналога Rust `RefCell<T>` — interior mutability через shared reference. Это ограничивает реальные паттерны: кэши, memoization, lazy initialization.

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

### 6.1 `gmtime` — не thread-safe

```c
time_t t = d.ms / 1000;
struct tm* tm = gmtime(&t);   // возвращает указатель на static struct tm
```

`gmtime` не реентерабельна. Одновременный вызов `Date.getFullYear()` из нескольких потоков = UB. Нужен `gmtime_r` (POSIX) или `gmtime_s` (Windows).

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

### 6.4 `Math.random()` — нет способа контролировать seed

```typescript
Math.random()  // глобальный, non-deterministic, нет seed
```

Для embedded firmware тестов и game replay нет способа контролировать `Math.random()` без замены всего кода на `std/random`. Нужен `Math.seed(n)` или явное объявление `Math.random()` deprecated.

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

## Приоритизация рисков

| # | Проблема | Критичность | Сложность fix |
|---|----------|-------------|---------------|
| 1 | Union types как параметры → нет C-output | 🔴 блокер | Средняя |
| 2 | `interface` dual semantics → ломает ABI при добавлении метода | 🔴 блокер | Высокая |
| 3 | `instanceof` отсутствует | 🔴 блокер | Средняя |
| 4 | `gmtime` не thread-safe | 🔴 блокер | Низкая |
| 5 | Async closures не специфицированы | 🟠 серьёзная | Средняя |
| 6 | `select` не type-safe | 🟠 серьёзная | Высокая |
| 7 | `Shared<T>` без interior mutability | 🟠 серьёзная | Высокая |
| 8 | `new Array(N)` ломает JS-код | 🟠 серьёзная | Низкая |
| 9 | State machine size на embedded — риск stack overflow | 🟡 важная | Средняя |
| 10 | `Date` 0-indexed vs Temporal 1-indexed | 🟡 важная | Низкая |
| 11 | `Reader.read(buf)` — move вместо Mut | 🟡 важная | Низкая |
| 12 | `??` conditional move — borrow checker underspecified | 🟡 важная | Высокая |
| 13 | Variadic C функции не типизированы | 🟡 важная | Высокая |
| 14 | Pinned toolchain отсутствует | 🟡 важная | Низкая |
| 15 | Mandatory formatting ломает IDE incremental compilation | 🟡 важная | Средняя |
