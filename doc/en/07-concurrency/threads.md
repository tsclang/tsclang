# Threads (std/threads) — Advanced Level

[← Up](./index.md) | [Next →](./channels.md) | [Previous ←](./promise.md)

---

Threads operate as **isolates** — without shared memory. Communication via channels (ownership transfer) or via `Atomic<T>` / `AtomicArray<T>`. Available **only on OS** (desktop/server).

```typescript
import { Thread, channel, select, after } from "std/threads"
```

## Thread.spawn

```typescript
const t = Thread.spawn(() => {
    return heavyComputation()   // isolates — no shared memory
})

const result = await t.join()   // from async context — non-blocking
// const result = t.join()      // from another thread — blocks OS thread
```

`Thread.spawn` returns `Thread<T>`, where `T` is inferred from the callback return type. Under the hood — `channel<T>(1)`.

### Passing Data to a Thread

```typescript
const [tx, rx] = channel<i32[]>(64)

const t = Thread.spawn(() => {
    const result = heavyComputation()
    tx.send(result)   // move ownership into channel
})

const result = await rx.receive()   // async context: non-blocking
t.join()
```

### Error Handling

If a thread throws — error propagates through `join()`:

```typescript
const t = Thread.spawn(() => {
    if (fail) throw new IOError("disk full")
    return computeResult()
})

try {
    const result = await t.join()   // throws IOError if thread crashed
} catch (e) { /* ... */ }
```

### Thread\<void\>

For threads without a result — `join()` is only a synchronization point:

```typescript
const t = Thread.spawn(() => { doWork() })
await t.join()
```

### When to Use Which Form

| Task | Form |
|--------|-------|
| Launch and get single result | `Thread<T>` + `await t.join()` |
| Stream multiple values | explicit `channel<T>` |
| Multiple threads → single receiver | channels + `select` |
| Complex coordination | explicit channels |

## Atomic\<T\>

The only way to share a value between threads without a channel. Heap-allocated with atomic ref count. Escape analysis: if `Atomic<T>` does not escape into `Thread.spawn` — placed on the stack.

```typescript
import { Atomic, AtomicArray, LoadOrdering, StoreOrdering, RmwOrdering } from "std/threads"

const counter = new Atomic<i32>(0)

Thread.spawn(() => {
    counter.fetchAdd(1, RmwOrdering.AcqRel)
})

counter.load(LoadOrdering.Acquire)          // i32
counter.store(0, StoreOrdering.Release)     // void
counter.fetchAdd(1, RmwOrdering.AcqRel)     // i32 — old value
counter.fetchSub(1, RmwOrdering.AcqRel)     // i32
counter.fetchAnd(0xFF, RmwOrdering.AcqRel)  // i32
counter.fetchOr(0x01,  RmwOrdering.AcqRel)  // i32
counter.fetchXor(0x01, RmwOrdering.AcqRel)  // i32
counter.swap(42, RmwOrdering.AcqRel)        // i32 — old value
counter.compareExchange(
    expected, desired,
    RmwOrdering.AcqRel,        // success ordering
    LoadOrdering.Acquire       // failure ordering
): { success: boolean, value: i32 }
```

### Memory Ordering

```typescript
enum LoadOrdering  { Relaxed, Acquire, SeqCst }
enum StoreOrdering { Relaxed, Release, SeqCst }
enum RmwOrdering   { Relaxed, Acquire, Release, AcqRel, SeqCst }
```

The compiler forbids invalid combinations.

### C-output

```c
// Heap layout — if Atomic<T> escapes into Thread.spawn:
struct Atomic_i32 {
    _Atomic int32_t value;
    atomic_size_t ref_count;
};

// Stack layout — if it does not escape current stack:
struct Atomic_i32_stack {
    _Atomic int32_t value;
};
```

## AtomicArray\<T\>

Array of atomic values — single allocation, C99 Flexible Array Member:

```typescript
const arr = new AtomicArray<i32>(1024)          // zeroed
const arr = new AtomicArray<i32>([1, 2, 3, 4]) // from literal
const arr = new AtomicArray<i32>(existing)      // from i32[] — move

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

- **compareExchange zero-cost**: compiler does not create a temporary struct, variables are used directly
- **Bounds checking**: index check on every access
- **Relaxed on x86/ARM** is practically free — use for counters where ordering does not matter

## Readonly\<T\>

Deeply immutable wrapper for zero-copy sharing between threads. Compile-time check: all fields recursively must be primitives, `string`, `Atomic<T>`, `AtomicArray<T>`, or `Readonly<U>`.

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
    console.log(cfg.maxRetries)   // ✅ reading is safe
    cfg.maxRetries = 5            // ❌ compile error: Readonly
})
```

### Constructor Rules

- `<T>` is required: `new Readonly<T>(expr)`
- Inline literal: all fields of `T` must be present
- Variable: shape must match `T` exactly; subtype with extra fields → error
- `expr` moved after the call

```typescript
// ❌ subtype with extra owned field
let d: DevConfig = { maxRetries: 3, timeout: 5000.0, hosts: [...], logLevel: "debug" }
const cfg = new Readonly<Config>(d)
// error: cannot move DevConfig into Readonly<Config>
//   field 'logLevel: string' would be silently dropped

// ❌ <T> omitted
const cfg = new Readonly({ maxRetries: 3 })
// error: type parameter required: new Readonly<YourType>(...)
```

### Readonly\<T\> with Atomic\<T\> Inside

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

Retain/release automatically at `Thread.spawn` boundary.

## Send Check

The compiler checks captured variables at the `Thread.spawn` boundary:

### Allowed Types

| Type | Behavior |
|-----|-----------|
| Owned `T` | implicit move, **with recursive field check** |
| Primitive | copy |
| `Atomic<T>` | retain/release automatically |
| `AtomicArray<T>` | retain/release automatically |
| `Readonly<T>` | retain/release automatically |

### Forbidden Types

| Type | Error |
|-----|--------|
| `Ref<T>` / `Mut<T>` | compile error |
| `Shared<T>` / `Weak<T>` | compile error |
| `await` inside callback | compile error |

### Recursive Send Check for Owned Types

The compiler traverses all fields recursively. Any field `Shared<U>`, `Weak<U>`, `Ref<U>`, `Mut<U>` — error with path:

```typescript
class Node {
    value: i32
    next: Shared<Node>   // ← problem
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
let counter = 0;                       // ❌ if captured by Thread.spawn
const ac = new Atomic<i32>(0);         // ✅ Atomic<T> — ok

class Server {
    static count: i32 = 0;             // ❌ mutable static when captured
    static readonly MAX: i32 = 100;    // ✅ const static — ok
}
```

## Async and Threads — Separate Worlds

`await` inside `Thread.spawn` — compile error. A thread has no event loop. Blocking operations (`send`, `receive`, `t.join()`) are called without `await`:

```
Event loop:   await rx.receive()  ←──────────────┐  non-blocking
                                                │
Thread:       tx.send(result)  ────────────────┘  blocking
```

## C-output

### Thread\<T\> — Full Example

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
    channel_receive(_thread_ch, &result);  // or poll in event loop
    printf("%d\n", **result);
}
```

## Errors

| Error | Cause |
|--------|---------|
| `cannot send 'Node' to thread` | Field with `Shared<T>` in struct |
| `await inside Thread.spawn` | `await` forbidden in thread |
| `mutable let captured by Thread.spawn` | Capture of `let` variable |
| `Shared<T> not thread-safe` | `Shared<T>` in capture |
| `ISR not supported on "desktop"` | `std/threads` on embedded — error |

## See Also

- [Channels and select](./channels.md) — channel\<T\>, bounded MPMC, select
- [Async/Await](./async.md) — event loop, state machines
- [ISR (Embedded)](./isr.md) — Atomic\<T\> and Volatile\<T\> in interrupts
- [Memory Model](../05-memory/shared.md) — Shared\<T\> vs Atomic\<T\>
