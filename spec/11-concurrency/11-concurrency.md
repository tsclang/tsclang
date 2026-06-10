# Конкурентность: Threads, ISR, Embedded

Async/await и генераторы — см. [10-async/](../10-async/)

## Уровни модели

TSC разделяет конкурентность на три независимых механизма:

| Механизм | Платформа | Уровень |
|----------|-----------|---------|
| `async/await` | все | стандартный |
| `std/threads` | OS (desktop/server) | продвинутый |
| `@isr` | embedded (AVR/Cortex) | системный |

---

## 2. Threads (std/threads) — продвинутый уровень

Только там где есть OS. Потоки работают как **изоляты** — без общей памяти. Связь через каналы (передача владения) или через `Atomic<T>` / `AtomicArray<T>`.

### Atomic<T>

Единственный способ разделить значение между потоками без канала. Текущая реализация: два явных варианта — `new Atomic<T>(val)` (stack, без ref count) и `new Shared<Atomic<T>>(val)` (heap, с ARC). Автоматический escape analysis *[NOT YET IMPLEMENTED]*.

```typescript
import { Atomic, AtomicArray, LoadOrdering, StoreOrdering, RmwOrdering } from "std/threads"

const counter = new Atomic<i32>(0)

Thread.spawn(() => {
    // компилятор: counter._retain() перед spawn
    // компилятор: counter._release() в конце потока
    counter.fetchAdd(1, RmwOrdering.AcqRel)
})

counter.load(LoadOrdering.Acquire)          // i32
counter.store(0, StoreOrdering.Release)     // void
counter.fetchAdd(1, RmwOrdering.AcqRel)     // i32 — старое значение
counter.fetchSub(1, RmwOrdering.AcqRel)     // i32
counter.fetchAnd(0xFF, RmwOrdering.AcqRel)  // i32
counter.fetchOr(0x01,  RmwOrdering.AcqRel)  // i32
counter.fetchXor(0x01, RmwOrdering.AcqRel)  // i32
counter.swap(42, RmwOrdering.AcqRel)        // i32 — старое значение
counter.compareExchange(
    expected, desired,
    RmwOrdering.AcqRel,   // success ordering
    LoadOrdering.Acquire  // failure ordering — провал только читает (default: Acquire)
): { success: boolean, value: i32 }
```

Memory ordering типы — компилятор запрещает неверные комбинации:

```typescript
enum LoadOrdering  { Relaxed, Acquire, SeqCst }           // только для load / failure
enum StoreOrdering { Relaxed, Release, SeqCst }           // только для store
enum RmwOrdering   { Relaxed, Acquire, Release, AcqRel, SeqCst }  // read-modify-write
```

C-output — два варианта в зависимости от escape analysis:

```c
// Stack layout — если Atomic<T> не выходит за пределы текущего стека:
typedef struct { _Atomic int32_t value; } Atomic_i32;
Atomic_i32 a = {.value = 0};

// Heap (shared) layout — если Atomic<T> уходит в Thread.spawn (ARC retain/release):
typedef struct { int32_t _refcount; int32_t _weakcount; _Atomic int32_t value; } Atomic_i32_shared;
Atomic_i32_shared *a = tsc_arc_alloc(sizeof(Atomic_i32_shared));
atomic_init(&a->value, 0);
// ... использование через atomic_store_explicit / atomic_load_explicit ...
tsc_arc_release(a);
```

Escape analysis: компилятор обходит все передачи `Atomic<T>` — если ни одна не попадает в `Thread.spawn` и не возвращается наружу, используется stack layout без ref count.

### AtomicArray<T>

Массив атомарных значений — одна аллокация, все элементы атомарны. Использует C99 Flexible Array Member.

```typescript
// инициализация
const arr = new AtomicArray<i32>(1024)          // нулями, размер 1024
const arr = new AtomicArray<i32>([1, 2, 3, 4]) // из литерала — без двойного цикла
const arr = new AtomicArray<i32>(existing)      // из i32[] — move, без двойного цикла

arr.load(0, LoadOrdering.Acquire)              // i32
arr.store(0, 42, StoreOrdering.Release)        // void
arr.fetchAdd(0, 1, RmwOrdering.AcqRel)         // i32
arr.compareExchange(0, expected, desired,
    RmwOrdering.AcqRel,
    LoadOrdering.Acquire
)                                              // { success: boolean, value: i32 }
arr.length                                     // number — bounds checking при каждом обращении
```

C-output (calloc для данных):
```c
typedef struct { int32_t length; _Atomic int32_t *data; } AtomicArray_i32;
AtomicArray_i32 arr = {.length = 4, .data = calloc(4, sizeof(_Atomic int32_t))};
atomic_store_explicit(&arr.data[0], 42, memory_order_release);
const int32_t v = atomic_load_explicit(&arr.data[0], memory_order_acquire);
// ... cleanup: free(arr.data);
```

Заметки компилятора:
- **compareExchange zero-cost**: `const { success, value } = arr.compareExchange(...)` — компилятор не создаёт временную структуру на стеке, переменные используются напрямую
- **Relaxed на x86/ARM практически бесплатен** — используй `RmwOrdering.Relaxed` для счётчиков профилировщика и статистики где порядок не важен; значительно быстрее чем JS `Atomics` который всегда использует более тяжёлую семантику
- **Bounds checking**: `length` хранится в структуре — компилятор вставляет проверку индекса при каждом обращении к элементу

### Правила Thread.spawn

| Тип | Разрешено | Поведение |
|-----|-----------|-----------|
| Owned `T` | ✅ | неявный move |
| Примитив | ✅ | copy |
| `Atomic<T>` | ✅ | retain/release автоматически |
| `AtomicArray<T>` | ✅ | retain/release автоматически |
| `Readonly<T>` | ✅ | retain/release автоматически |
| `Ref<T>` / `Mut<T>` | ❌ | ошибка компилятора |
| `Shared<T>` / `Weak<T>` | ❌ | ошибка компилятора |
| `await` внутри callback | ❌ | ошибка компилятора |

Только там где есть OS. Потоки работают как **изоляты** — без общей памяти. Связь через каналы с передачей владения или через `Atomic<T>`.

> **`await` внутри `Thread.spawn` — ошибка компилятора.** Поток не имеет event loop. Блокирующие операции (send, receive) вызываются без `await` — они блокируют OS-поток через mutex/condvar.

### channel<T>

**Bounded SPSC** — кольцевой буфер, одна аллокация. Capacity обязателен.

```typescript
import { Thread, select } from "std/threads"

const ch = new Channel<Message>(128)   // capacity = 128

// send
await ch.send(msg)   // async-контекст: yield event loop если полный (backpressure)
ch.send(msg)         // thread-контекст: блокирует OS-поток если полный
ch.trySend(msg)      // boolean — false если полный, не блокирует (async, thread, ISR ✅)
ch.close()           // закрыть канал; получатель вычитает остаток, затем получает null

// receive
const msg = await ch.receive()   // async-контекст: yield event loop пока пуст
const msg = ch.receive()         // thread-контекст: блокирует OS-поток пока пуст
ch.tryReceive()                  // Message | null — не блокирует (async, thread, ISR ✅)

// состояние канала — snapshot (ISR-safe ✅, только для мониторинга и адаптивной логики)
ch.length      // number — текущее кол-во элементов
ch.capacity    // number — максимальная ёмкость
ch.isEmpty()   // boolean — length == 0
ch.isFull()    // boolean — length >= capacity
```

**ISR-safe операции** (`trySend`, `tryReceive`, `length`, `capacity`, `isEmpty`, `isFull`) не делают системных вызовов и не аллоцируют память — безопасны для вызова из прерываний.

**Адаптивный producer в ISR** — типичный паттерн для робототехники и real-time систем:

```typescript
// isFull — бинарная адаптация: два режима качества
@isr("LIDAR_SCAN")
function onScan(): void {
    const resolution = tx.isFull ? Resolution.Low : Resolution.High
    tx.trySend(captureScan(resolution))   // drop если всё ещё полный
}

// length — градуальная адаптация: три ступени качества
@isr("CAMERA_FRAME")
function onFrame(): void {
    const quality = ch.length < ch.capacity / 3  ? Quality.High
                  : ch.length < ch.capacity * 2/3 ? Quality.Medium
                  : Quality.Low

    ch.trySend(captureFrame(quality))   // drop если всё ещё полный после адаптации
}
```

`length` и `isEmpty()` — snapshot: значение может измениться к моменту следующей инструкции. Для control flow это допустимо (worst case — один кадр не того качества). Для гарантий «exactly once» использовать `trySend()` — он атомарен.

Ownership: `tx.send(msg)` — move `msg` в канал. При удалении канала с непрочитанными элементами компилятор вызывает деструкторы всех оставшихся объектов.

C-output — SPSC ring buffer (thin wrapper над runtime `TscChannel_TNAME`):
```c
typedef struct { TscChannel_i32 *_inner; } Channel_i32;
Channel_i32 ch = { ._inner = tsc_channel_create_i32(10) };
tsc_channel_send_i32(ch._inner, 42);
tsc_channel_release_i32(ch._inner);
```

### select

Ждёт первого готового из нескольких каналов. Ровно одно поле результата non-null.

`select` — синхронная операция, не требует `await`.

```typescript
const result = select({
    a: ch1.receive(),   // ждём i32
    b: ch2.receive(),   // ждём i32
})

// result — struct с _arm полем для диспатча
if (result._arm === 0) {
    console.log(result.a);
} else if (result._arm === 1) {
    console.log(result.b);
}
```

`result` — struct с полями `_arm` (int) и именованными полями для каждого канала. Доступ к полям — прямой (`result.a`). `_arm == -1` означает «ни один канал не готов».

Fairness: компилятор обходит каналы последовательно через `tryReceive()`. Если хотя бы один готов — возвращает сразу.

C-output — sequential try_receive с tagged result:
```c
typedef struct { int32_t _arm; int32_t a; int32_t b; } _SelectResult_0;
typedef struct { bool has_value; int32_t value; } opt_i32;
_SelectResult_0 result = {-1, 0, 0};
// arm 0 — try ch1:
{ opt_i32 _sel_a = tsc_channel_try_receive_i32(ch1._inner);
  if (_sel_a.has_value) { result.a = _sel_a.value; result._arm = 0; } }
// arm 1 — try ch2 (only if arm 0 missed):
if (result._arm < 0) {
  opt_i32 _sel_b = tsc_channel_try_receive_i32(ch2._inner);
  if (_sel_b.has_value) { result.b = _sel_b.value; result._arm = 1; } }
```
Компилятор генерирует `_SelectResult_N` по конкретному вызову `select{}` — типы полей известны на этапе компиляции. `_arm == -1` означает «ни один канал не готов».

### Readonly<T>

Глубоко иммутабельная обёртка для zero-copy sharing крупных данных между потоками. Compile-time проверка: все поля рекурсивно должны быть примитивами, `string`, `Atomic<T>`, `AtomicArray<T>` или `Readonly<U>`. Любое мутабельное поле — ошибка компилятора.

```typescript
import { Readonly } from "std/threads"

type Config = {
    maxRetries: i32
    timeout:    f64
    hosts:      string[]
}

// создаём один раз — передаём во все потоки
const cfg = new Readonly<Config>({
    maxRetries: 3,
    timeout:    5000.0,
    hosts:      ["a.example.com", "b.example.com"]
})

Thread.spawn(() => {
    // компилятор: cfg._retain() перед spawn
    // компилятор: cfg._release() в конце потока
    console.log(cfg.maxRetries)   // ✅ чтение безопасно из любого потока
    cfg.maxRetries = 5            // ❌ ошибка компилятора: Readonly
})
```

**Правило конструктора:** `new Readonly<T>(expr)` — `<T>` обязателен, `expr` должен быть типа строго `T` (поле-в-поле, без структурных subtypes). После вызова `expr` moved, исходная переменная недоступна.

- Inline литерал: все поля `T` должны присутствовать, лишние поля → ошибка компилятора
- Переменная: форма должна совпадать с `T` точно; subtype с лишними полями → ошибка, т.к. owned поля были бы dropped неявно

```typescript
// ✅ inline литерал — форма совпадает с Config
const cfg = new Readonly<Config>({ maxRetries: 3, timeout: 5000.0, hosts: [...] })

// ✅ переменная — тип точно Config
let c: Config = { maxRetries: 3, timeout: 5000.0, hosts: [...] }
const cfg = new Readonly<Config>(c)

// ❌ subtype с лишним owned полем
let d: DevConfig = { maxRetries: 3, timeout: 5000.0, hosts: [...], logLevel: "debug" }
const cfg = new Readonly<Config>(d)
// error: cannot move DevConfig into Readonly<Config>
//   field 'logLevel: string' would be silently dropped
//   hint: new Readonly<Config>({ maxRetries: d.maxRetries, timeout: d.timeout, hosts: d.hosts })

// <T> может быть выведен из аргумента
const cfg = new Readonly({ maxRetries: 3 })  // ok: T inferred
```

Нельзя создать `Readonly<T>` если `T` содержит `Shared<U>`, `Weak<U>`, `Ref<U>`, `Mut<U>` или мутабельное поле — ошибка компилятора.

C-output — zero overhead (`const` copy, без аллокации):
```c
// Readonly<Point> ro = p;
const Point ro = p;
```

Thread-safe retain/release для `Readonly<T>` в `Thread.spawn` — планируется. Текущая реализация: `const` copy без refcount.

Зачем не `const`: `const` локальная переменная — это гарантия компилятора только в текущем потоке. `Readonly<T>`:
1. **Thread-safe** *(запланировано)* — атомарный ref count, safe для `Thread.spawn`
2. **Deep** — рекурсивная проверка; `const obj` может хранить `Shared<T>` внутри
3. **Owned** — автоматическое управление памятью

Типичное использование: конфиги, lookup-таблицы, скомпилированные шейдеры, статичные данные уровня — один раз создать, раздать во все потоки без копирования.

```typescript
// ✅ Readonly<T> с Atomic<T> внутри — допустимо
type Stats = {
    hits:   Atomic<i64>   // мутабельный, но сам по себе thread-safe
    misses: Atomic<i64>
}

const stats = new Readonly<Stats>({
    hits:   new Atomic<i64>(0),
    misses: new Atomic<i64>(0)
})

// несколько потоков читают конфиг и пишут в атомики одновременно
Thread.spawn(() => {
    stats.hits.fetchAdd(1, RmwOrdering.Relaxed)   // ✅
})
```

### Thread<T> — типизированный результат

`Thread.spawn` возвращает `Thread<T>`, где `T` выводится из return type callback. Обе формы получения результата валидны и компилируются в идентичный C-output:

```typescript
// Форма 1: Thread<T> — сахар для простого "запустить и получить результат"
const t = Thread.spawn(() => heavyComputation())   // Thread<HeavyResult>

const result = await t.join()   // из async-контекста — не блокирует event loop
// const result = t.join()      // из другого потока — блокирует OS thread

// Форма 2: явный канал — для сложных случаев (стриминг, несколько значений, select)
const ch = new Channel<HeavyResult>(1)
Thread.spawn(() => { ch.send(heavyComputation()) })
const result = await ch.receive()
```

Под капотом `Thread<T>` — это `new Channel<T>(1)`, генерируемый компилятором автоматически. Никакой скрытой магии — только удобная обёртка над явным примитивом.

Если поток бросает — ошибка propagates через `join()`:

```typescript
const t = Thread.spawn(() => {
    if (fail) throw new IOError("disk full")
    return computeResult()
})

try {
    const result = await t.join()   // throws IOError если поток упал
} catch (e: IOError) { ... }
```

`Thread<void>` — для потоков без результата, `join()` используется только как точка синхронизации:

```typescript
const t = Thread.spawn(() => { doWork() })
await t.join()   // ждём завершения, результата нет
```

**Когда какую форму использовать:**

| Задача | Форма |
|--------|-------|
| Запустить и получить один результат | `Thread<T>` + `await t.join()` |
| Стримить несколько значений | явный `channel<T>` |
| Несколько потоков → один получатель | явные каналы + `select` |
| Сложная координация | явные каналы |

**Async и threads — два намеренно разделённых мира:**

`await` внутри `Thread.spawn` — ошибка компилятора. Поток не имеет event loop. Блокирующие операции (`send`, `receive`, `t.join()`) вызываются без `await` и блокируют OS-поток через mutex/condvar. Канал — единственный bridge между ними:

```
Event loop:   await rx.receive()  ←──────────────┐  неблокирующий
                                               │
Thread:       tx.send(result)  ────────────────┘  блокирующий (если полный)
```

```typescript
import { Thread, select } from "std/threads"

async function main(): void {
    const ch = new Channel<i32[]>(64)

    const t = Thread.spawn(() => {
        // тяжёлые вычисления в отдельном потоке
        const result = heavyComputation()
        ch.send(result)   // move владения в канал
    })

    const result = await ch.receive()   // ждём результат
    t.join()
    console.log(result)
}
```

**Global State в контексте потоков:**

```typescript
const CONFIG = { maxRetries: 3 };     // const — ok, читать из потоков можно
let counter = 0;                       // ошибка компилятора если Thread.spawn захватывает
const ac = new Atomic<i32>(0);         // Atomic<T> — ok из потоков

class Server {
    static count: i32 = 0;             // mutable static — ошибка при захвате в Thread.spawn
    static readonly MAX: i32 = 100;    // const static — ok
}
```

Компилятор проверяет захваченные переменные **на границе `Thread.spawn`**:
- Мутабельный `let` или глобаль → ошибка компилятора
- `Shared<T>` или `Weak<T>` → ошибка компилятора
- `Ref<T>` / `Mut<T>` → ошибка компилятора
- `@static let` → ошибка компилятора (используй `Atomic<T>`)
- `await` внутри callback → ошибка компилятора
- Owned `T` → неявный move, **с рекурсивной проверкой полей** (см. ниже)
- Примитив → copy
- `Atomic<T>` / `AtomicArray<T>` / `Readonly<T>` → retain/release автоматически

> **Реализовано:** Все правила выше проверяются в `_emitSpawnBlock()` (emit-helpers.js). Рекурсивная Send-проверка обходит поля класса; Array/Set/Map/opt-типы отвергаются как не-Send. Разрешённые типы: примитивы, string, Atomic, Readonly.

**Рекурсивная Send-проверка owned типов:**

Перед move в `Thread.spawn` компилятор рекурсивно обходит все поля типа. Тип считается thread-safe если каждое поле является:
- примитивом
- `string` (owned, после move принадлежит потоку)
- `Atomic<T>` / `AtomicArray<T>` / `Readonly<T>`
- другим owned типом, рекурсивно прошедшим ту же проверку

Любое поле `Shared<U>`, `Weak<U>`, `Ref<U>`, `Mut<U>` — ошибка компилятора с указанием пути к проблемному полю:

```typescript
class Node {
    value: i32
    next: Shared<Node>   // ← проблема
}

const n = new Node()
Thread.spawn(() => { use(n) })
// error: cannot send `Node` to thread
//   field `next: Shared<Node>` is not thread-safe
//   hint: use Atomic<T>, channel<T>, or Readonly<T> for shared state
```

```typescript
class Message {
    id:   i32
    body: string   // ok — owned string, после move принадлежит потоку
}

const msg = new Message(1, "hello")
Thread.spawn(() => { process(msg) })  // ✅ — все поля thread-safe
```

---

## 3. @isr — только Embedded

ISR — аппаратное прерывание. Не поток, не closure. Никакого захвата контекста.

### Volatile<T> — регистры MMIO

`Volatile<T>` гарантирует что каждое чтение/запись доходит до памяти (не кэшируется в регистр процессора). Транслируется в `volatile T*` в C. Используется исключительно для Memory-Mapped I/O.

```typescript
import { Volatile, pointer } from "std/embedded"

// описываем регистры периферии — type гарантирует: никакого vtable, только data
type UartRegs = {
    dr:        Volatile<u32>   // Data Register
    rsr:       Volatile<u32>   // Status Register
    _reserved: u32[4]          // пропуск памяти
    fr:        Volatile<u32>   // Flag Register
}

// маппинг на физический адрес
const UART0 = pointer<UartRegs>(0x101f1000)

UART0.dr.write(0x41)              // C: *(volatile uint32_t*)0x101f1000 = 0x41
const status = UART0.fr.read()   // C: *(volatile uint32_t*)0x101f1018 — не кэшируется
```

> `Volatile<T>` ≠ `Atomic<T>`: атомики используют инструкции синхронизации которые периферия не понимает. Для MMIO регистров — только `Volatile<T>`.

Два гарантии `Volatile<T>`:
1. **No cache** — каждое чтение/запись физически идёт на шину, не кэшируется в регистр процессора
2. **No reordering** — компилятор не переставляет инструкции чтения/записи `Volatile<T>` относительно друг друга (критично для последовательности инициализации периферии)

### @isr

Функция-прерывание. Только embedded платформы.

**Сигнатура:** всегда `(): void` — без параметров, без возвращаемого значения, без `throws`. Любое отклонение — ошибка компилятора:
```typescript
@isr(14)
function handler(): void { ... }          // ✅

@isr(14)
function handler(x: i32): void { ... }   // ❌ параметры запрещены

@isr(14)
function handler(): i32 { ... }          // ❌ return type должен быть void

@isr(14)
function handler(): void throws IOError { ... }  // ❌ throws запрещён
```

Два варианта аргумента:

```typescript
@isr("TIMER1_OVF")   // по имени вектора — AVR (avr-libc naming)
@isr(14)              // по номеру вектора — ARM Cortex-M (IRQn)
```

Пример:

```typescript
import { Atomic, RmwOrdering } from "std/threads"

// type — stack-allocated struct, не class (нет heap)
type TimerEvent = { irq: u32; tick: u32 }

static readonly irqCount = new Atomic<u32>(0)
static readonly irqCh = new Channel<TimerEvent>(32)

@isr(14)   // ARM Cortex-M: IRQ14
function onTimerInterrupt(): void {
    // Atomic<T> — ok
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)

    // type-литерал — stack allocation, не heap
    const ev: TimerEvent = { irq: 14, tick: irqCount.load(RmwOrdering.Relaxed) }
    tx.trySend(ev)   // non-blocking

    // Volatile<T> — ok
    TIMER_REG.sr.write(0x0)   // сброс флага прерывания
}

@isr("TIMER1_OVF")   // AVR: именованный вектор
function onTimerOverflow(): void {
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)
}
```

Компилятор генерирует платформенный атрибут:
```c
// AVR — строковый аргумент
ISR(TIMER1_OVF_vect) {
void onTimerInterrupt(void) { ... }

// AVR — строковый аргумент
ISR(TIMER1_OVF_vect) {
    counter++;
}
```

Context saving — полностью на стороне C компилятора через `__attribute__((interrupt))`. TSC не генерирует код сохранения регистров.

**Ошибка на desktop:**

```typescript
@isr("TIMER1_OVF")  // ❌ error: ISR not supported on "desktop"
function onTimer(): void {
    counter++;
}
```

**Когда использовать:**
- Hardware interrupts (timer, UART, external)
- Альтернатива — native, но менее удобно

**Сравнение с native:**

```typescript
// ✅ Через @isr — удобно
@isr("TIMER1_OVF")
function onTimer(): void {
    counter++;
}

// ⚠️ Через native — неудобно, разрывает код
native `ISR(TIMER1_OVF_vect) {`;
counter++;
native `}`
```

### Правила @isr

| Операция | Разрешено |
|----------|-----------|
| `Atomic<T>` / `AtomicArray<T>` | ✅ |
| `Volatile<T>` (MMIO) | ✅ |
| `tx.trySend()` / `rx.tryReceive()` | ✅ (не блокирует) |
| Примитивы на стеке (`i32`, `u8`, etc.) | ✅ |
| `type`-литералы на стеке (`{ field: u32 }`) | ✅ (stack allocation) |
| Модульные переменные (`static`, `const`, `let` на уровне модуля) | ✅ (статическая память) |
| Фиксированные массивы `T[N]` | ✅ (стек) |
| `await` | ❌ ошибка компилятора |
| `new` (heap allocation) | ❌ ошибка компилятора |
| `tx.send()` / `rx.receive()` (блокирующие) | ❌ ошибка компилятора |
| `Shared<T>` / `Weak<T>` | ❌ ошибка компилятора |
| string concatenation | ❌ ошибка компилятора (heap) |
| `Map`, `Set` операции | ❌ ошибка компилятора (heap) |
| `throw` / `throws` | ❌ ошибка компилятора |
| `interrupts.disable()` внутри ISR | ❌ ошибка компилятора (прерывания уже отключены) |
| Два `@isr` с одним вектором | ❌ ошибка компилятора (duplicate vector) |

**Почему heap запрещён в ISR:**
1. **Safety** — аллокация может завершиться OOM → crash системы
2. **Determinism** — heap имеет непредсказуемое время → нарушение real-time
3. **Atomicity** — аллокатор использует блокировки → deadlock внутри ISR
4. **Stack** — аллокация требует стекового пространства, ISR работает на ограниченном стеке

Ошибка компилятора:
```
error[TSC-E081]: heap allocation in ISR context
  --> src/handler.tsc:5:10
    |
  5 |     const ev = new Event(14)
    |                ^^^^^^^^^^^^^ heap allocation forbidden in ISR
    |
    = hint: use pre-allocated buffer or static data structure
    = note: use global buffer or channel + trySend instead
```

**Правильные паттерны:**

```typescript
// ✅ Примитив на стеке + канал
const _sensorChannel = new Channel<u16>(32)

@isr(14)
function handler(): void {
    const reading: u16 = ADC.read()       // примитив — стек, не heap
    _sensorChannel.trySend(reading)       // non-blocking
}

// ✅ Глобальный статический буфер
const _buffer: u8[64] = [0, ...]
let _bufferLen: i32 = 0

@isr("UART_RX")
function uartRx(): void {
    if (_bufferLen < 64) {
        _buffer[_bufferLen++] = UART.read()
    }
}

// ✅ Atomic счётчик
const _counter = new Atomic<u32>(0)

@isr("TIMER1_OVF")
function timerOverflow(): void {
    _counter.fetchAdd(1, RmwOrdering.Relaxed)
}
```

**Вызов функций из ISR:** компилятор проверяет только прямые операции внутри ISR-функции. Если вызываемая функция внутри делает `new` или `await` — ошибка выдаётся на месте нарушения, не на месте вызова. Ответственность за ISR-safety вызываемых функций — на разработчике.

`std/threads` на embedded targets — ошибка компилятора (нет OS).

### std/sync — критические секции (embedded)

Для безопасного доступа к составным данным которые меняет IRQ — временный запрет прерываний:

```typescript
import { interrupts } from "std/sync"

interrupts.disable(() => {
    // прерывания выключены на время выполнения лямбды
    // гарантирует атомарность группы операций
    const snapshot = sensorData.x  // читаем составную структуру безопасно
    const y = sensorData.y
    process(snapshot, y)
})
// прерывания автоматически включаются по выходу
```

C-output (платформозависимый):
```c
// ARM Cortex-M
__asm volatile("cpsid i");   // disable interrupts
{ /* тело лямбды */ }
__asm volatile("cpsie i");   // enable interrupts

// x86
__asm volatile("cli");
{ /* тело лямбды */ }
__asm volatile("sti");

// AVR
uint8_t sreg = SREG; cli();
{ /* тело лямбды */ }
SREG = sreg;  // восстанавливаем флаги (не просто sei())
```

> Внутри `interrupts.disable()` те же ограничения что и в `@isr`: нет `await`, нет `new`.

### EmbeddedSignal — мост ISR → async

`channel<T>` подходит для передачи данных из ISR в async-код, но для простых событий без полезной нагрузки (ADC готов, таймер сработал, кнопка нажата) он избыточен: занимает буфер и требует обёртку.

`EmbeddedSignal` — нулевой overhead: один `volatile bool` в BSS.

```typescript
import { EmbeddedSignal } from "std/embedded"

// статически выделяется в BSS — не heap
const adcReady = new EmbeddedSignal()

@isr("ADC_vect")
function adc_isr(): void {
    ADCSRA  // сброс флага прерывания (читаем регистр)
    adcReady.set()    // ✅ ISR-safe: просто volatile bool = true в C
}

async function readADC(): u16 {
    ADCSRA |= (1 << 6)         // запускаем преобразование
    await adcReady.wait()      // ждём сигнала от ISR
    return ADCL | (ADCH << 8)
}
```

C-output:

```c
// BSS — один volatile bool
static volatile bool _sig_adcReady = false;

// ISR — один store
ISR(ADC_vect) {
    (void)ADCSRA;
    _sig_adcReady = true;
}

// State machine poll для readADC
bool readADC_poll(ReadADC_SM* sm) {
    switch (sm->_state) {
    case 0:
        ADCSRA |= (1 << 6);
        sm->_state = 1;
        return false;
    case 1:
        if (!_sig_adcReady) return;   // ещё не готово — выходим
        _sig_adcReady = false;        // auto-reset
        sm->_result = ADCL | (ADCH << 8);
        sm->_done = true;
        return;
    }
}
```

Никакого heap, никакого рантайма. Главный цикл просто опрашивает state machines:

```c
// main loop (кооперативный планировщик):
while (1) {
    readADC_poll(&sm_readADC);
    processData_poll(&sm_processData);
    // ...
}
```

**API:**

```typescript
class EmbeddedSignal {
    set(): void         // ISR-safe: устанавливает флаг (volatile store)
    wait(): Promise<void>  // async: опрашивает флаг; auto-reset при срабатывании
    clear(): void       // ручной сброс (если нужен без await)
    readonly isSet: boolean   // ISR-safe: проверка без ожидания
}
```

**Правила:**
- `new EmbeddedSignal()` компилируется в один бит в `volatile uint32_t` в BSS — без heap
- `await signal.wait()` разрешён только в `async` функции
- `signal.set()` / `signal.isSet` / `signal.clear()` разрешены в ISR
- Один `EmbeddedSignal` на одно событие: если несколько ISR могут сигналить — использовать `channel<T>` или отдельный signal на каждый

#### Оптимизация: автоматическая битовая упаковка

Компилятор собирает все `EmbeddedSignal` в модуле и упаковывает их в один `volatile uint32_t` (bank). Каждый сигнал — один бит. Это даёт быструю проверку в главном цикле: **один `if` на все 32 события разом**.

Если сигналов больше 32 — компилятор автоматически добавляет второй bank. Синтаксис TSC не меняется.

**C-output для трёх сигналов:**

```c
// Один volatile uint32_t вместо трёх volatile bool
static volatile uint32_t _sig_bank_0 = 0;
#define _SIG_adcReady    (1u << 0)
#define _SIG_timerTick   (1u << 1)
#define _SIG_buttonPress (1u << 2)

// ISR: set-only — один OR, атомарно на большинстве платформ
ISR(ADC_vect)       { _sig_bank_0 |= _SIG_adcReady;    }
ISR(TIMER1_OVF_vect){ _sig_bank_0 |= _SIG_timerTick;   }
ISR(INT0_vect)      { _sig_bank_0 |= _SIG_buttonPress;  }

// Главный цикл — быстрый путь
void main_loop(void) {
    while (1) {
        if (!_sig_bank_0) continue;   // ← нет событий — пропускаем ВСЁ

        // Snapshot-and-clear: атомарный снимок
        // AVR: cli/sei (8 тактов); Cortex-M: LDREX/STREX (без блокировки прерываний)
        uint32_t pending = _tsc_signal_snapshot(&_sig_bank_0);

        if (pending & _SIG_adcReady)    readADC_poll(&sm_readADC);
        if (pending & _SIG_timerTick)   onTimer_poll(&sm_onTimer);
        if (pending & _SIG_buttonPress) onButton_poll(&sm_onButton);
    }
}
```

Платформенная реализация `_tsc_signal_snapshot`:

```c
// AVR: прерывания на 2 инструкции
static inline uint32_t _tsc_signal_snapshot(volatile uint32_t *bank) {
    uint8_t sreg = SREG; cli();
    uint32_t v = *bank; *bank = 0;
    SREG = sreg;
    return v;
}

// ARM Cortex-M: lock-free (LDREX/STREX)
static inline uint32_t _tsc_signal_snapshot(volatile uint32_t *bank) {
    uint32_t v;
    do { v = __LDREX(bank); } while (__STREX(0, bank));
    return v;
}
```

**Выгода:** на системе в режиме ожидания (idle) — ни одного лишнего вызова `poll()`. Экономия тактов и потребления батареи пропорциональна числу задач.

**Когда что использовать:**

| Сценарий | Инструмент |
|----------|-----------|
| ISR → флаг "событие произошло" | `EmbeddedSignal` |
| ISR → передача данных (ADC value, UART byte) | `channel<T>.trySend()` |
| ISR → разделяемый счётчик | `Atomic<T>.fetchAdd()` |
| ISR → сложная составная структура | `interrupts.disable()` + глобальная переменная |

### Итоговая таблица Low-level инструментов

| Задача | TSC синтаксис | Гарантия |
|--------|---------------|----------|
| MMIO регистры | `Volatile<T>` | Прямое обращение к шине, no reorder |
| Обработчик прерывания | `@isr(N)` / `@isr("NAME")` | `__attribute__((interrupt))`, context saved |
| Общее состояние с IRQ | `static Atomic<T>` | Атомарный доступ без гонок |
| Составные данные с IRQ | `interrupts.disable()` | Критическая секция |
| Сигнал ISR → async (нет данных) | `EmbeddedSignal` | бит в `uint32_t`, auto-reset, быстрый idle |
| Данные ISR → async (поток) | `channel.trySend()` | Передача без блокировки |

---

## 4. Embedded-аннотации

Декораторы для fine-grained контроля над поведением на embedded платформах.

> **Примечание:** `@struct` (forced inline для функций) перенесён в [06-functions.md](../06-functions/06-functions.md#inline-function--принудительный-inline) как `@inline`. Здесь `@struct` используется только для классов (value-type) — см. [07-classes-ownership.md](../07-classes/07-classes-ownership.md#struct--value-type-class).

### `@embedded.noHeap`

Статическая проверка компилятором: функция не использует heap.

```typescript
@embedded.noHeap
function process(data: Ref<u8[]>): i32 {
    // ❌ ошибка компиляции: new Array использует heap
    const temp = new Array<u8>(10);
    
    // ❌ ошибка: new Map использует heap
    const map = new Map<string, i32>();
    
    // ✅ ok: stack allocation (fixed size)
    const temp: u8[10] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    // ✅ ok: borrowed reference
    return data.length;
}
```

**Когда использовать:**
- ISR (прерывания) — heap внутри ISR = crash
- Функции в no-heap платформах
- Явное документирование ограничений

**Альтернатива через `declare platform`:**

```typescript
// В platform profile
declare platform {
    heap: false  // Компилятор проверит все new Array/Map
}
```

Доступен на всех платформах (desktop, embedded).

### `@signal` — POSIX-сигналы (desktop)

Аналог `@isr` для desktop — обработка POSIX-сигналов.

```typescript
@signal("SIGINT")
function onInterrupt(): void {
    console.log("Ctrl+C pressed");
    cleanup()
    process.exit(0)
}

@signal("SIGTERM")
function onTerminate(): void {
    console.log("Termination requested");
    gracefulShutdown()
}

@signal("SIGHUP")
function onHangup(): void {
    console.log("SIGHUP received");
    reloadConfig();
}
```

**Безопасность:** `@signal` реализован через libuv (`uv_signal_t`), а не через прямой `signal()`. Настоящий C signal handler только пишет байт в pipe; callback вызывается в event loop. Поэтому внутри `@signal` хэндлера доступен любой TSClang-код — `console.log`, async-вызовы и др.

C-output:
```c
// callback вызывается в event loop (async-signal-safe)
static void _onInterrupt(uv_signal_t* handle, int signum) {
    printf("Ctrl+C pressed\n");
    cleanup();
    exit(0);
}

// В main() — регистрация через libuv
uv_signal_t _sig_int, _sig_term, _sig_hup;
uv_signal_init(loop, &_sig_int);  uv_signal_start(&_sig_int, _onInterrupt, SIGINT);
uv_signal_init(loop, &_sig_term); uv_signal_start(&_sig_term, _onTerminate, SIGTERM);
uv_signal_init(loop, &_sig_hup);  uv_signal_start(&_sig_hup, _onHangup, SIGHUP);
```

Поддерживаемые сигналы:

| Сигнал | Когда |
|--------|-------|
| `SIGINT` | Ctrl+C |
| `SIGTERM` | kill (graceful) |
| `SIGHUP` | Terminal closed / reload config |
| `SIGUSR1`, `SIGUSR2` | User-defined |
| `SIGPIPE` | Broken pipe |
| `SIGALRM` | Timer |

На embedded `@signal` → ошибка компиляции.

### Сводная таблица аннотаций

| Аннотация | Desktop | Embedded | Проверка |
|-----------|---------|----------|----------|
| `@inline` (бывший `@struct` для функций) | ✅ | ✅ | — |
| `@embedded.noHeap` | ✅ | ✅ | Compile-time |
| `@isr` | ❌ | ✅ | Compile-time |
| `@signal` | ✅ | ❌ | Compile-time |


## 6. Кооперативная многозадачность через генераторы

Паттерн для "параллельного" выполнения нескольких задач без потоков и без OS.
Каждая задача — генератор, `yield` уступает управление следующей. Round-robin loop тикает все задачи по очереди.

Работает на любой платформе. На embedded — основной способ многозадачности.

```typescript
function* inputTask(): Generator<void> {
    while (true) {
        if (keyboard.available()) {
            handleKey(keyboard.read())
        }
        yield
    }
}

function* logicTask(): Generator<void> {
    while (true) {
        updateLogic()
        yield
    }
}

function* renderTask(): Generator<void> {
    while (true) {
        renderScreen()
        yield
    }
}

function main(): void {
    const tasks = [inputTask(), logicTask(), renderTask()]
    while (true) {
        for (const t of tasks) t.next()
    }
}
```

```c
// C-output — три state machine, round-robin без heap
static InputTask_state input_task;
static LogicTask_state logic_task;
static RenderTask_state render_task;

void main(void) {
    while (1) {
        InputTask_next(&input_task);
        LogicTask_next(&logic_task);
        RenderTask_next(&render_task);
    }
}
```

**Размер:** каждая task ≈ 4–16 байт (зависит от живых переменных через `yield`).

| Подход | Heap | Сложность | Применение |
|--------|------|-----------|-----------|
| Sync polling | нет | низкая | простой loop, одна задача |
| **Generators round-robin** | нет | средняя | несколько задач, embedded и desktop |
| Async/Await + runtime | нужен | высокая | desktop/server |
| Threads | нужен | высокая | CPU-bound, OS |

---

## Итоговая картина

```
┌─────────────────────────────────────────────────────┐
│  TSC Concurrency Model                               │
│                                                      │
│  async/await ──── event loop ──── все платформы      │
│       │                                              │
│       └── async generators / for await ─ heap only  │
│       │                                              │
│       └── Shared<T>/Weak<T> не атомарны              │
│       └── Weak narrowing безопасен                   │
│                                                      │
│  std/threads ───── isolates ────── OS only            │
│       │                                              │
│       ├── channel<T>: передача владения              │
│       ├── Atomic<T> / AtomicArray<T>: shared счётчики│
│       ├── Readonly<T>: zero-copy immutable sharing   │
│       └── компилятор проверяет на Thread.spawn       │
│                                                      │
│  @isr ─── ISR ─────────── embedded only     │
│       │                                              │
│       └── только Volatile<T> + Atomic<T>             │
│       └── нет захвата контекста                      │
│                                                      │
│  @signal ──────── POSIX signal ──── desktop only     │
│                                                      │
│  @platform ────── условная компиляция ─── все        │
│  @inline / @embedded.noHeap ──── все        │
└─────────────────────────────────────────────────────┘
```
