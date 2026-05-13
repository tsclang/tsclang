# Threads (std/threads) — продвинутый уровень

[← Вверх](./index.md) | [Следующий →](./channels.md) | [Предыдущий ←](./promise.md)

---

Потоки работают как **изоляты** — без общей памяти. Связь через каналы (передача владения) или через `Atomic<T>` / `AtomicArray<T>`. Доступно **только на OS** (desktop/server).

```typescript
import { Thread, channel, select, after } from "std/threads"
```

## Thread.spawn

```typescript
const t = Thread.spawn(() => {
    return heavyComputation()   // isolates — нет shared memory
})

const result = await t.join()   // из async-контекста — неблокирующий
// const result = t.join()      // из другого потока — блокирует OS thread
```

`Thread.spawn` возвращает `Thread<T>`, где `T` выводится из return type callback. Под капотом — `channel<T>(1)`.

### Передача данных в поток

```typescript
const [tx, rx] = channel<i32[]>(64)

const t = Thread.spawn(() => {
    const result = heavyComputation()
    tx.send(result)   // move владения в канал
})

const result = await rx.receive()   // async-контекст: неблокирующий
t.join()
```

### Обработка ошибок

Если поток бросает — ошибка propagates через `join()`:

```typescript
const t = Thread.spawn(() => {
    if (fail) throw new IOError("disk full")
    return computeResult()
})

try {
    const result = await t.join()   // throws IOError если поток упал
} catch (e) { /* ... */ }
```

### Thread\<void\>

Для потоков без результата — `join()` только как точка синхронизации:

```typescript
const t = Thread.spawn(() => { doWork() })
await t.join()
```

### Когда какую форму использовать

| Задача | Форма |
|--------|-------|
| Запустить и получить один результат | `Thread<T>` + `await t.join()` |
| Стримить несколько значений | явный `channel<T>` |
| Несколько потоков → один получатель | каналы + `select` |
| Сложная координация | явные каналы |

## Atomic\<T\>

Единственный способ разделить значение между потоками без канала. Heap-allocated с атомарным ref count. Escape analysis: если `Atomic<T>` не уходит в `Thread.spawn` — размещается на стеке.

```typescript
import { Atomic, AtomicArray, LoadOrdering, StoreOrdering, RmwOrdering } from "std/threads"

const counter = new Atomic<i32>(0)

Thread.spawn(() => {
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
    RmwOrdering.AcqRel,        // success ordering
    LoadOrdering.Acquire       // failure ordering
): { success: boolean, value: i32 }
```

### Memory ordering

```typescript
enum LoadOrdering  { Relaxed, Acquire, SeqCst }
enum StoreOrdering { Relaxed, Release, SeqCst }
enum RmwOrdering   { Relaxed, Acquire, Release, AcqRel, SeqCst }
```

Компилятор запрещает неверные комбинации.

### C-output

```c
// Heap layout — если Atomic<T> уходит в Thread.spawn:
struct Atomic_i32 {
    _Atomic int32_t value;
    atomic_size_t ref_count;
};

// Stack layout — если не выходит за пределы текущего стека:
struct Atomic_i32_stack {
    _Atomic int32_t value;
};
```

## AtomicArray\<T\>

Массив атомарных значений — одна аллокация, C99 Flexible Array Member:

```typescript
const arr = new AtomicArray<i32>(1024)          // нулями
const arr = new AtomicArray<i32>([1, 2, 3, 4]) // из литерала
const arr = new AtomicArray<i32>(existing)      // из i32[] — move

arr.load(0, LoadOrdering.Acquire)              // i32
arr.store(0, 42, StoreOrdering.Release)        // void
arr.fetchAdd(0, 1, RmwOrdering.AcqRel)         // i32
arr.compareExchange(0, expected, desired,
    RmwOrdering.AcqRel,
    LoadOrdering.Acquire
)                                              // { success: boolean, value: i32 }
arr.length                                     // i32 — bounds checking
```

```c
struct AtomicArray_i32 {
    atomic_size_t ref_count;
    size_t length;
    _Atomic int32_t data[];  // C99 FAM
};
// malloc(sizeof(struct AtomicArray_i32) + sizeof(int32_t) * n)
```

- **compareExchange zero-cost**: компилятор не создаёт временную структуру, переменные используются напрямую
- **Bounds checking**: проверка индекса при каждом обращении
- **Relaxed на x86/ARM** практически бесплатен — используйте для счётчиков где порядок не важен

## Readonly\<T\>

Глубоко иммутабельная обёртка для zero-copy sharing между потоками. Compile-time проверка: все поля рекурсивно должны быть примитивами, `string`, `Atomic<T>`, `AtomicArray<T>` или `Readonly<U>`.

```typescript
import { Readonly } from "std/threads"

type Config = {
    maxRetries: i32
    timeout:    f64
    hosts:      string[]
}

const cfg = new Readonly<Config>({
    maxRetries: 3,
    timeout:    5000.0,
    hosts:      ["a.example.com", "b.example.com"]
})

Thread.spawn(() => {
    console.log(cfg.maxRetries)   // ✅ чтение безопасно
    cfg.maxRetries = 5            // ❌ ошибка компилятора: Readonly
})
```

### Правила конструктора

- `<T>` обязателен: `new Readonly<T>(expr)`
- Inline литерал: все поля `T` должны присутствовать
- Переменная: форма должна совпадать с `T` точно; subtype с лишними полями → ошибка
- `expr` moved после вызова

```typescript
// ❌ subtype с лишним owned полем
let d: DevConfig = { maxRetries: 3, timeout: 5000.0, hosts: [...], logLevel: "debug" }
const cfg = new Readonly<Config>(d)
// error: cannot move DevConfig into Readonly<Config>
//   field 'logLevel: string' would be silently dropped

// ❌ <T> опущен
const cfg = new Readonly({ maxRetries: 3 })
// error: type parameter required: new Readonly<YourType>(...)
```

### Readonly\<T\> с Atomic\<T\> внутри

```typescript
type Stats = {
    hits:   Atomic<i64>
    misses: Atomic<i64>
}

const stats = new Readonly<Stats>({
    hits:   new Atomic<i64>(0),
    misses: new Atomic<i64>(0)
})

Thread.spawn(() => {
    stats.hits.fetchAdd(1, RmwOrdering.Relaxed)   // ✅
})
```

### C-output

```c
struct Readonly_Config {
    atomic_size_t ref_count;
    Config data;
};
// malloc(sizeof(struct Readonly_Config))
```

Retain/release автоматически на границе `Thread.spawn`.

## Send-проверка

Компилятор проверяет захваченные переменные на границе `Thread.spawn`:

### Разрешённые типы

| Тип | Поведение |
|-----|-----------|
| Owned `T` | неявный move, **с рекурсивной проверкой полей** |
| Примитив | copy |
| `Atomic<T>` | retain/release автоматически |
| `AtomicArray<T>` | retain/release автоматически |
| `Readonly<T>` | retain/release автоматически |

### Запрещённые типы

| Тип | Ошибка |
|-----|--------|
| `Ref<T>` / `Mut<T>` | ошибка компилятора |
| `Shared<T>` / `Weak<T>` | ошибка компилятора |
| `await` внутри callback | ошибка компилятора |

### Рекурсивная Send-проверка owned типов

Компилятор обходит все поля рекурсивно. Любое поле `Shared<U>`, `Weak<U>`, `Ref<U>`, `Mut<U>` — ошибка с указанием пути:

```typescript
class Node {
    value: i32
    next: Shared<Node>   // ← проблема
}

const n = new Node()
Thread.spawn(() => { use(n) })
// error: cannot send `Node` to thread
//   field `next: Shared<Node>` is not thread-safe
//   hint: use Atomic<T>, channel<T>, or Readonly<T>
```

### Global State

```typescript
const CONFIG = { maxRetries: 3 };     // const — ok
let counter = 0;                       // ❌ если Thread.spawn захватывает
const ac = new Atomic<i32>(0);         // ✅ Atomic<T> — ok

class Server {
    static count: i32 = 0;             // ❌ mutable static при захвате
    static readonly MAX: i32 = 100;    // ✅ const static — ok
}
```

## Async и threads — разделённые миры

`await` внутри `Thread.spawn` — ошибка компилятора. Поток не имеет event loop. Блокирующие операции (`send`, `receive`, `t.join()`) вызываются без `await`:

```
Event loop:   await rx.receive()  ←──────────────┐  неблокирующий
                                                │
Thread:       tx.send(result)  ────────────────┘  блокирующий
```

## C-output

### Thread\<T\> — полный пример

```typescript
async function main(): void {
    const [tx, rx] = channel<i32[]>(64)

    const t = Thread.spawn(() => {
        const result = heavyComputation()
        tx.send(result)
    })

    const result = await rx.receive()
    t.join()
    console.log(result)
}
```

```c
// Compiler-generated channel(1) for Thread<i32[]>
Channel* _thread_ch = channel_new(sizeof(int32_t*), 1);

void _thread_fn(void* arg) {
    int32_t* result = heavyComputation();
    channel_send(_thread_ch, &result);
}

int main(void) {
    // ...
    thread_create(_thread_fn, NULL);
    int32_t** result = NULL;
    channel_receive(_thread_ch, &result);  // или poll в event loop
    printf("%d\n", **result);
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot send 'Node' to thread` | Поле с `Shared<T>` в структуре |
| `await inside Thread.spawn` | `await` запрещён в потоке |
| `mutable let captured by Thread.spawn` | Захват `let`-переменной |
| `Shared<T> not thread-safe` | `Shared<T>` в захвате |
| `ISR not supported on "desktop"` | `std/threads` на embedded — ошибка |

## См. также

- [Каналы и select](./channels.md) — channel\<T\>, bounded MPMC, select
- [Async/Await](./async.md) — event loop, state machines
- [ISR (Embedded)](./isr.md) — Atomic\<T\> и Volatile\<T\> в прерываниях
- [Модель памяти](../05-memory/shared.md) — Shared\<T\> vs Atomic\<T\>
