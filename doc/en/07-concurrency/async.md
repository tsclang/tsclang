# Async/Await — Standard Approach

[← Up](./index.md) | [Next →](./promise.md) | [Previous ←](./index.md)

---

`async/await` is the main concurrency mechanism in TSC. Works on **all platforms**: desktop (libuv/io_uring), embedded (poll loop, no heap).

## Architecture

```
TSC code (async/await)
        ↓
  TSC compiler
        ↓
  state machines in C   ← like Rust generates Future
        ↓
  Runtime Interface (abstraction)
        ↓
  ┌─────────────┬──────────────┬──────────────┐
  │   libuv     │   io_uring   │  poll loop   │
  │  (desktop)  │   (Linux)    │  (embedded)  │
  └─────────────┴──────────────┴──────────────┘
```

Single event loop, single thread of execution. `Shared<T>` and `Weak<T>` are **not atomic** — zero overhead.

## async Functions

```typescript
async function fetchUser(id: i32): User throws NetworkError {
    const conn = await connect("https://api.example.com");
    const data = await conn.get(`/users/${id}`);
    return User.parse(data);
}
```

The compiler infers `Promise<T>` as the return type. Both forms are equivalent:

```typescript
async function fetchUser(id: i32): User { ... }           // Promise<User> inferred
async function fetchUser(id: i32): Promise<User> { ... }  // explicit
```

On **embedded**, `async fn` compiles to a state machine without runtime, without heap:

```c
typedef struct { int _state; /* captured variables */ } FetchUserTask;
bool FetchUserTask_poll(FetchUserTask* t) { switch (t->_state) { ... } }
```

## State Machine

The struct contains only variables **live across at least one await**. A variable used before await and no longer needed is not included in the struct:

```typescript
async function op(): Result {
    const tmp = heavyCompute()    // tmp does not survive await → NOT in struct
    const a = await step1(tmp)    // tmp is dead here
    const b = await step2(a)      // struct: { _state, a, b } — only live vars
}
```

### Size and Alignment

**Formula:**

```
sizeof(StateMachine) = sizeof(_state) + sum(sizeof(V) for V in live_vars) + padding
```

| Platform | `_state` type | Size | Alignment |
|-----------|-------------|--------|-----------|
| AVR | `uint8_t` | 1 B | 1 B |
| ARM Cortex-M | `uint32_t` | 4 B | 4 B |
| x86-64 | `int32_t` | 4 B | 8 B |

Maximum number of states: number of await points + 2 (`STATE_INIT`, `STATE_DONE`). On AVR — maximum 253 await points.

### throws Overhead

`async fn throws E` adds error storage to the state machine:

```c
typedef struct {
    uint8_t        _state;
    /* live variables */
    bool           _ok;
    union {
        ReturnType _value;
        ErrorType  _error;
    };
} AsyncThrowsTask;
```

### Static Stack Analysis

The compiler sums `sizeof` all state machines along the deepest call path. Exceeding `stack_size` from the profile is an error:

```
error: async call stack exceeds platform limit (256 bytes)
  op: 12 bytes
  └─ step2: 8 bytes
       └─ fetchRaw: 244 bytes  ← culprit
hint: reduce live variables across await in fetchRaw
```

The `--report-stack` flag outputs the full picture without building.

## Await Rules

- `await` **only** inside `async` functions — otherwise compile error
- `await` **only** on `Promise<T>` — await on a plain value is a compile error

```typescript
// ✅ ok
async function foo(): i32 {
    return await bar();   // bar(): Promise<i32>
}

// ❌ await outside async
function bad(): void {
    await foo();   // error: await outside async function
}

// ❌ await on non-Promise
async function bad2(): void {
    const x: i32 = 42;
    await x;   // error: cannot await i32, expected Promise<T>
}
```

## Borrows Across Await — Forbidden

`Ref<T>` and `Mut<T>` cannot survive an `await` point. Only owned values (`T`) are captured into the state machine struct:

```typescript
// ❌ borrow lives across await
async function bad(data: Buffer): Promise<void> {
    const header = data.readHeader()  // Ref<Header> — borrow from data
    await fetchMore()                 // ← header lives across await — error
    process(header)
}

// ✅ Clone before await
async function ok(data: Buffer): Promise<void> {
    const header = data.readHeader().clone()  // owned copy
    await fetchMore()
    process(header)
}

// ✅ Finish using borrow before await
async function ok2(data: Buffer): Promise<void> {
    const size = data.readHeader().size   // used and released
    await fetchMore()
    data.resize(size)
}
```

## async main

The entry point may be `async` — the compiler starts the event loop automatically:

```typescript
async function main(): void {
    const user = await fetchUser(42);
    console.log(user.name);
}
```

- Desktop/server — standard event loop (libuv/io_uring)
- Embedded — poll loop, state machine without heap

## Recursive async Functions

A regular async function — fixed-size state machine on the stack. Recursive — unknown size, compiler places on **heap**:

```typescript
async function traverse(node: Ref<TreeNode>): void {
    await process(node)
    if (node.left)  await traverse(node.left)   // ← recursion
    if (node.right) await traverse(node.right)
}
// warning: async function `traverse` is recursive — state machine heap-allocated
```

| Platform | Recursive async | Behavior |
|-----------|-------------------|-----------|
| Desktop/server | ✅ | heap allocation, warning |
| Embedded | ❌ | compile error: no heap available |

### @embedded.stack — Explicit Stack for Recursion

Decorator for cases when recursion on embedded is necessary (tree traversal, DFS):

```typescript
@embedded.stack("nodes", 64)
async function traverse(root: Ref<Node>): Promise<void> {
    while (!@embedded.stack_empty("nodes")) {
        const n = @embedded.stack_pop<Ref<Node>>("nodes")
        await process(n)
        if (n.left)  @embedded.stack_push("nodes", n.left)
        if (n.right) @embedded.stack_push("nodes", n.right)
    }
}
```

```c
static Node* nodes_stack[64];
static uint8_t nodes_stack_top = 0;

void traverse_poll(Traverse_SM* sm) {
    switch (sm->_state) {
        case 0:
            nodes_stack[nodes_stack_top++] = sm->root;
            sm->_state = 1; break;
        case 1:
            if (nodes_stack_top == 0) { sm->_state = 0xFF; return; }
            sm->n = nodes_stack[--nodes_stack_top];
            process_poll(&sm->n_state);
            sm->_state = 2; break;
    }
}
```

Size N is a compile-time constant. Overflow → runtime panic.

### Additional Restrictions on Embedded

| Construct | Desktop | Embedded |
|-----------|---------|----------|
| Recursive async | ✅ heap | ❌ → use `@embedded.stack` |
| `Ref<T>` across `await` | ❌ always | ❌ always |
| `Promise.all` / `Promise.race` | ✅ | ❌ requires heap |
| `@static async function` | works | required when `allocator: "static"` |

## Task Cancellation — AbortController / AbortSignal

Cooperative cancellation of async operations. The compiler inserts a flag check automatically.

### Basic Example

```typescript
const controller = new AbortController()
const signal = controller.signal

setTimeout(() => controller.abort(new TimeoutError()), 5000)

try {
    const data = await fetch(url, { signal })
} catch (e: NetworkError | AbortError) {
    if (e instanceof AbortError) console.log("cancelled:", e.cause)
}
```

### AbortController

```typescript
class AbortController {
    readonly signal: AbortSignal
    abort(reason?: Error): void   // idempotent — repeated call is no-op
}
```

### AbortSignal

```typescript
class AbortSignal {
    readonly aborted: boolean
    readonly reason:  Error | null

    onAbort(callback: () => void): void           // resource cleanup
    static timeout(ms: i32): AbortSignal           // helper — auto-cancel after N ms
    static any(signals: AbortSignal[]): AbortSignal // combine multiple signals
}
```

Convenient helper `AbortSignal.timeout`:

```typescript
const data = await fetch(url, { signal: AbortSignal.timeout(5000) })
```

Signal combining with `AbortSignal.any`:

```typescript
const deadline = AbortSignal.timeout(5000)
const userCancel = controller.signal

const combined = AbortSignal.any([deadline, userCancel])
await fetch(url, { signal: combined })
```

### Automatic Checks

If a function accepts `signal?: AbortSignal` — the compiler inserts a check at the beginning of each state:

```typescript
async function loadConfig(path: string, signal?: AbortSignal): Config {
    const raw  = await readFile(path)    // ← auto-check signal
    const json = await parseJson(raw)   // ← auto-check signal
    return validate(json)
}
```

```c
case STATE_READ_FILE:
    if (signal && atomic_load(&signal->aborted)) {
        ctx->state = STATE_ERROR;
        ctx->error = signal->reason ? signal->reason : &AbortError_default;
        break;
    }
    // ... read logic ...
```

### Cleanup on Cancellation

The state machine is not interrupted immediately — enters **unwind** mode, freeing owned resources:

```typescript
async function processFile(path: string, signal?: AbortSignal): Buffer {
    const file = await openFile(path)       // owned FileHandle
    // ← if signal.aborted → unwind: file._free() automatically
    const data = await readAll(file)
    // ← if signal.aborted → unwind: data._free() + file._free()
    return data
}
```

```c
case STATE_CLEANUP:
    if (ctx->file) FileHandle_free(ctx->file);
    ctx->state = STATE_ERROR;
    break;
```

### signal.onAbort — Resource Cleanup

For resources not managed via `await`:

```typescript
async function readSocket(fd: i32, signal?: AbortSignal): Buffer {
    signal?.onAbort(() => close(fd))   // close fd on cancellation
    const data = await recv(fd)
    return data
}
```

Callbacks execute in the event loop (not synchronously with `abort()`). `await` inside callback — compile error.

### AbortError and throws

- `AbortError` **is not declared in `throws`** — presence of `signal?: AbortSignal` already declares cancelability
- Caught via `catch (e: AbortError)` for graceful fallback
- For cleanup — use `signal.onAbort()`, not `catch`

```typescript
// ✅ — AbortError not in throws
async function loadConfig(path: string, signal?: AbortSignal): Config throws IOError {
    return await readFile(path)
}

try {
    const cfg = await loadConfig(path, signal)
} catch (e: AbortError) {
    return defaultConfig   // graceful fallback
} catch (e: IOError) {
    throw e
}
```

### signal.addEventListener

JS-compatible syntax (only `"abort"`):

```typescript
signal.addEventListener("abort", () => cleanup())   // ✅ OK
signal.addEventListener("load", () => ...)          // ❌ compile error
```

### C-output is Platform-dependent

```c
/* desktop — abort() may come from worker thread */
struct AbortSignal {
    atomic_bool    aborted;
    Error*         reason;
    AbortCallback* callbacks;
};

/* embedded — no threads, plain bool */
struct AbortSignal {
    bool           aborted;
    AbortCallback* callbacks;
    /* reason removed — no heap for Error* */
};
```

## AsyncMutex — Coordination of async Functions

A regular `Mutex` (std/sync) will block the event loop. For async functions — use `AsyncMutex` from `std/async`:

```typescript
import { AsyncMutex } from "std/async"

const mutex = new AsyncMutex()

async function critical(): Promise<void> {
    await mutex.lock()   // non-blocking: yields event loop
    try {
        await doWork()
    } finally {
        mutex.unlock()
    }
}

// Or via runExclusive — automatic unlock:
await mutex.runExclusive(async () => {
    await doWork()
})
```

- Fair queue (FIFO)
- `Mutex` (std/sync) — only for synchronous code and `Thread.spawn`
- `AsyncMutex` — for async functions
- `Mutex.lock()` in async context — **compiler warning**

## Errors

| Error | Cause |
|--------|---------|
| `await outside async function` | `await` in a synchronous function |
| `cannot await i32, expected Promise<T>` | `await` on a non-Promise value |
| `borrow lives across await point` | `Ref<T>` / `Mut<T>` survives `await` |
| `async function is recursive — state machine heap-allocated` | Warning on desktop, error on embedded |
| `ISR not supported on "desktop"` | `@embedded.isr` outside embedded |

## See Also

- [Promise\<T\>](./promise.md) — return type of async functions
- [Channels and select](./channels.md) — connecting async code with threads
- [Generators](./generators.md) — async function*, for await
- [Memory Model](../05-memory/index.md) — ownership, borrows across await
