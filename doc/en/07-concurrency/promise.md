# Promise\<T\> — Result of an async Operation

[← Up](./index.md) | [Next →](./threads.md) | [Previous ←](./async.md)

---

`Promise<T>` — the return type of `async` functions. Encapsulates the result or error of an asynchronous operation.

## Creation

### From async Function (Automatic)

```typescript
async function fetchUser(id: i32): User throws NetworkError {
    const conn = await connect("https://api.example.com");
    const data = await conn.get(`/users/${id}`);
    return User.parse(data);
}
// fetchUser(42) returns Promise<User>
```

### Manually (Callback-based API Wrapper)

```typescript
function delay(ms: i32): Promise<void> {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(), ms);
    });
}

function readFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!fileExists(path)) reject(new IOError("not found"));
        else resolve(fs.readSync(path));
    });
}
```

- `resolve(value)` — completes Promise successfully
- `reject(error)` — completes with error; error type must match `throws`
- Repeated `resolve` or `reject` — no-op

## .then / .catch / .finally

Methods for inline result transformation without `await`:

### .then\<U\>

```typescript
const upper = fetchName().then(name => name.toUpperCase())   // Promise<string>
```

- Called only on success
- Returns `Promise<U>`
- If `fn` throws — Promise transitions to error

### .catch\<E\>

```typescript
const safe = readFile(path).catch((e: IOError) => "")       // Promise<string>
```

- Called only on matching error type
- Uncaught errors are propagated further

### .finally

```typescript
const result = fetchData(url).finally(() => closeConnection())
```

- Called always (on success and on error)
- Does not change Promise type and value
- `await` inside `fn` — compile error

### Chains

```typescript
const data = fetchRaw(url)
    .then(raw => parse(raw))
    .catch((e: ParseError) => defaultData)
    .finally(() => log("done"))
```

All three methods — sugar over `async/await`:

```typescript
p.then(fn)  →  async () => fn(await p)
p.catch(fn) →  async () => { try { return await p } catch (e: E) { return fn(e) } }
```

## Promise.all

Launch multiple async tasks in parallel. Waits for **all**, fail-fast on error:

```typescript
const [users, posts] = await Promise.all([
    fetchUsers(),   // Promise<User[]>
    fetchPosts(),   // Promise<Post[]>
]);
```

- All tasks start simultaneously
- First error wins, others are cancelled via AbortSignal
- Element types are inferred by the compiler

### Throws Union

If promises throw different error types — compiler infers union:

```typescript
async function a(): void throws IOError { ... }
async function b(): void throws NetworkError { ... }

// compiler infers: throws IOError | NetworkError
await Promise.all([a(), b()])

try {
    await Promise.all([a(), b()])
} catch (e: IOError | NetworkError) {
    if (e instanceof IOError) { ... }
    else if (e instanceof NetworkError) { ... }
}
```

If all promises throw the same type — union collapses.

### Order on Simultaneous Failure

On a single-threaded event loop the order is deterministic: the lowest index is processed first. Other errors are lost. To collect all errors — use `Promise.allSettled`.

## Promise.any

Waits for the **first successful** result:

```typescript
const data = await Promise.any([
    fetchFromMirror1(url),
    fetchFromMirror2(url),
    fetchFromMirror3(url),
])
```

- Result type: `T` (common type of all Promises)
- At least one task succeeds → others are cancelled
- All tasks failed → `Promise.any` throws last error

## Promise.race

Waits for the **first to complete** (success or error):

```typescript
async function withTimeout(ms: i32): never throws TimeoutError {
    await sleep(ms)
    throw new TimeoutError()
}

const result = await Promise.race([
    fetchData(url),
    withTimeout(5000),
])
```

- Returns result of the first completed task
- Other tasks are cancelled
- Result type: common type of all Promises

Interaction with AbortController:

```typescript
const ctrl = new AbortController()

const result = await Promise.race([
    fetchFromA(url, { signal: ctrl.signal }),
    fetchFromB(url, { signal: ctrl.signal }),
])

ctrl.abort()   // loser will stop at next await
```

## Promise.allSettled

Waits for **all**, collects all results including errors — **never throws**:

```typescript
type SettledResult<T, E extends Error> =
    | { status: "fulfilled"; value: T }
    | { status: "rejected";  error: E }
```

Returns a **tuple** — each element typed by its promise:

```typescript
async function fetchUser(id: i32): User throws NetworkError { ... }
async function validateForm(data: FormData): void throws ValidationError { ... }

const [r1, r2] = await Promise.allSettled([fetchUser(1), validateForm(data)])
// r1: SettledResult<User, NetworkError>
// r2: SettledResult<void, ValidationError>

match (r1) {
    { status: "fulfilled", value } => console.log(value.name)
    { status: "rejected",  error } => console.log(error.message)
}
```

- Result order matches task order
- Use when you need the result of each task independently

## Comparison Table

| Method | Waits | On Error | Result |
|-------|------|------------|-----------|
| `Promise.all` | all | throws immediately | `T[]` (or tuple) |
| `Promise.any` | first success | throws if all failed | `T` |
| `Promise.race` | first (any) | throws if first failed | `T` |
| `Promise.allSettled` | all | never throws | `SettledResult<T>[]` |

## C-output

```typescript
async function fetch(url: string): string throws NetworkError {
    return new Promise((resolve, reject) => {
        httpGet(url, (err, data) => {
            if (err) reject(new NetworkError(err));
            else resolve(data);
        });
    });
}
```

```c
// State machine for async function with Promise
typedef struct {
    int _state;
    String* url;
    String* result;
    bool _ok;
    union {
        String* _value;
        NetworkError* _error;
    };
} FetchTask;

bool FetchTask_poll(FetchTask* t) {
    switch (t->_state) {
    case 0:
        httpGet(t->url, fetch_callback, t);
        t->_state = 1;
        return false;
    case 1:
        // result received via callback
        return t->_ok;
    }
}
```

## Errors

| Error | Cause |
|--------|---------|
| `cannot await i32, expected Promise<T>` | `await` on a non-Promise value |
| `await outside async function` | `await` in a synchronous function |
| `Promise.all unavailable on embedded` | `Promise.all` requires heap |
| `type mismatch in resolve` | Type mismatch in `resolve(value)` |

## See Also

- [Async/Await](./async.md) — async functions, state machines, await rules
- [Channels and select](./channels.md) — connecting async with threads via channels
- [Errors](../06-errors/index.md) — throws, try/catch
