# Scope Constraint

[← Up](./index.md) | [Next →](./auto-drop.md) | [Previous ←](./argument-passing.md)

---

TSClang has no explicit lifetime annotations (like `'a` in Rust). Instead — a set of **conservative rules** that the compiler checks statically. This simplifies syntax at the cost of some restrictions.

## Rule 1: Ref/Mut cannot be global

`Ref<T>` and `Mut<T>` cannot be stored in global variables — a borrow cannot outlive a function.

```typescript
let global: Ref<User>;  // error

function foo(u: Ref<User>) {
    global = u;  // error: borrow cannot outlive the function
}
```

### Alternatives

```typescript
// Option 1: owned field
let global: User;             // owned — ok

// Option 2: Shared<T> (desktop)
let global: Shared<User>;     // ARC — ok

// Option 3: @static let (global mutable state)
@static let global: User;
```

## Rule 2: Cannot return a reference to a local

A returned `Ref<T>` cannot reference an object created inside the function body — the object will die on exit.

```typescript
function bad(): Ref<User> {
    const u = new User();    // u will die at end of function
    return u;                // error: u will die at end of function
}
```

### Fix: return owned

```typescript
function ok(): User {
    const u = new User();
    return u;    // ok — move, caller receives ownership
}
```

## Rule 3: Returned Ref<T> is bound to the source

The compiler tracks which input `Ref<T>` is the source of the returned value.

### Single input Ref

The returned `Ref<T>` is bound to the sole source:

```typescript
function first(a: Ref<string>, n: i32): Ref<string> {
    return a   // ok — result bound to a
}

const s = "hello"
const r = first(s, 42)
console.log(r)    // ok — r is valid as long as s is alive
```

### Multiple input Refs

The result is bound to the **minimum** lifetime among all sources. This is conservative — the compiler does not know which exact `Ref` will be returned at runtime:

```typescript
function getLonger(a: Ref<string>, b: Ref<string>): Ref<string> {
    return a.length > b.length ? a : b
}

const s1 = "hello"
const s2 = "world!"
const longer = getLonger(s1, s2)
// longer is valid as long as both s1 and s2 are alive
console.log(longer)    // ok

// if s1 or s2 is dropped before longer — compiler error
```

### If the result must outlive the sources

```typescript
// clone — owned copy, not bound to sources
function getLongerOwned(a: Ref<string>, b: Ref<string>): string {
    return (a.length > b.length ? a : b).clone()
}
```

### Returning a borrow from a method

A returned `Ref<T>` from a method is bound to `this`:

```typescript
class Config {
    data: string[];

    getFirst(): Ref<string> {
        return this.data[0];    // bound to this
    }
}

const config = new Config();
const s = config.getFirst();    // s is bound to config
console.log(s);                 // ok
```

Error on dangling:

```typescript
let s: Ref<string>;
{
    const config = new Config();
    s = config.getFirst();    // borrow bound to config
}                             // config dies
console.log(s);               // error: config died, s is dangling
```

## Rule 4: Ref/Mut cannot outlive await

`Ref<T>` and `Mut<T>` cannot remain alive across an `await` point. Reason: the async state machine saves state between suspension points, and the borrow source may be invalidated while the coroutine is suspended.

```typescript
async function bad(arr: Ref<i32[]>): Promise<void> {
    const x = arr[0];       // borrow from arr
    await sleep(10);        // "Ref<T>" cannot live across "await"
    console.log(x);         //   use ".clone()" to make an owned copy
}
```

### Solution 1: Clone before await

Value primitives (copy types) are already safe — they are not a borrow:

```typescript
async function ok(arr: Ref<i32[]>): Promise<void> {
    const val: i32 = arr[0];    // i32 — copy, not borrow
    await sleep(10);
    console.log(val);           // ok
}
```

For complex types — `clone()`:

```typescript
async function ok(arr: Ref<User[]>): Promise<void> {
    const copy = arr[0].clone();    // owned copy
    await sleep(10);
    console.log(copy);
}
```

### Solution 2: Use the borrow before await

```typescript
async function ok(arr: Ref<i32[]>): Promise<void> {
    console.log(arr[0]);       // borrow used and released
    await sleep(10);           // ok — no live borrows
    console.log(arr[0]);       // new borrow after await
}
```

### Solution 3: New borrow after await

```typescript
async function ok(arr: Ref<i32[]>): Promise<void> {
    await sleep(10);
    console.log(arr[0]);       // fresh borrow, created after await
}
```

### Owned values across await — ok

Owned values (`T`) are captured in the state machine struct and survive `await`:

```typescript
async function fetch(): Data {
    let d = new Data();
    d.value = 42;
    return d;
}

async function run(): void {
    const d = await fetch();    // d — owned, captured in state machine
    console.log(d.value);       // ok
}
```

C-output shows `d` as a field of the state machine struct:

```c
typedef struct {
    int32_t _state; int _result; bool _done;
    Data d;                        // owned — saved across suspension
    fetch_state _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (fetch_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            fetch_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->d = self->_await_0._result;   // move from awaited result
            printf("%d\n", self->d.value);
            self->_done = true;
            return;
    }
}
```

## Why no automatic re-borrow

Technically the compiler could silently drop the borrow at `await` and restore it after. This is **intentionally not done**:

1. **`await` is a boundary where other tasks run.** The user must see that the borrow is interrupted here.
2. **Hidden re-borrow masks the fact** that `r` after `await` is already a different borrow, not the one from before.
3. **The explicit pattern** (`arr[0]` after `await` instead of `r`) is shorter and clearer.

## Errors

### Ref lives across await

```typescript
async function foo(arr: Ref<i32[]>): Promise<void> {
    const x = arr[0];
    await sleep(10);
    console.log(x);
}
// "Ref<T>" cannot live across "await"; use ".clone()" to make an owned copy
```

### Borrow bound to a dead object

```typescript
let s: Ref<string>;
{
    const config = new Config();
    s = config.getFirst();
}
console.log(s);    // error: borrow outlived its source
```

## See also

- [Borrow Checker Rules](./borrow-rules.md) — simultaneous borrows
- [Argument Passing](./argument-passing.md) — Ref/Mut/owned in parameters
- [Auto Drop](./auto-drop.md) — automatic deallocation
- [Closures](./closures.md) — Mut-closure across await
- [Async/Await](../07-concurrency/async-await.md) — async functions and state machines
