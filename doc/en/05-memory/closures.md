# Closures

[← Up](./index.md) | [Previous ←](./auto-drop.md)

---

Closures in TSClang compile to **stack structs** — no heap allocation. Capture rules depend on the variable type.

## Capture rules

### Primitives — always copy

Primitive types (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) are copied at closure creation time:

```typescript
let x: i32 = 42;
const fn = (): i32 => x + 1;    // x is copied
x = 99;
fn();    // → 43, not 100
```

### Complex types — Ref by default

Arrays, objects, strings, and classes are captured by `Ref<T>` by default:

```typescript
const items = [1, 2, 3];
const fn = (): i32 => items.length;    // fn holds Ref<items>
fn();    // ok — items is alive
```

A closure cannot outlive the source with Ref capture:

```typescript
let fn: () => i32;
{
    const items = [1, 2, 3];
    fn = (): i32 => items.length;    // captures Ref<items>
}
fn();    // error: items is dead
```

## Explicit capture list

`[var: Type]` before parameters — the same ownership types as everywhere else:

```typescript
[data: Data]()          // T — move, closure becomes the owner
[data: Ref<Data>]()     // Ref — immutable borrow (same as default)
[data: Mut<Data>]()     // Mut — mutable borrow
```

### Move capture `[var: T]`

The closure takes ownership. Solves the problem when the closure outlives the source:

```typescript
// error — Ref cannot outlive the function
function makeGreeter(): () => void {
    const name = "Alice";
    return (): void => console.log(name);    // name will die
}

// ok — name is moved into the closure
function makeGreeter(): () => void {
    const name = "Alice";
    return [name: string](): void => console.log(name);    // move
}
```

C-output — closure with move capture:

```c
typedef struct {
    String name;                     // owned String, moved in
    void (*fn)(struct Closure_0*);
} Closure_0;

static void Closure_0_fn(Closure_0* self) {
    printf("%s\n", self->name.data);
}

Closure_0 makeGreeter(void) {
    String name = { .data = "Alice", .length = 5, .capacity = 0 };
    return (Closure_0){ .name = name, .fn = Closure_0_fn };
    // name moved into struct — stack frame dies, struct lives
}

// caller:
Closure_0 greet = makeGreeter();    // struct on caller's stack
greet.fn(&greet);                    // call
String_drop(&greet.name);           // drop owned field when greet dies
```

A function accepting a closure is monomorphized for the specific type:

```c
// callTwice specialized for Closure_0
static void callTwice_Closure_0(Closure_0* f) {
    f->fn(f);
    f->fn(f);
}
```

### Mut capture `[var: Mut<T>]`

The closure mutates an outer object through explicit `Mut<T>`:

```typescript
let counter = new Counter();
const inc = [counter: Mut<Counter>](): void => counter.increment();
inc();
inc();
```

### Ref capture `[var: Ref<T>]`

Explicit form of what happens by default. Useful for documenting intent:

```typescript
const data = [1, 2, 3];
const fn = [data: Ref<i32[]>](): i32 => data.length;    // explicit borrow
```

## No `mut () => T`

A closure with `Mut<T>` capture has type `() => T` — same as any other. Mutation is visible in the capture list, not in the function type:

```typescript
const inc = [c: Mut<Counter>](): void => c.increment()
// type: () => void — same as a non-mutating closure

arr.forEach(item => log(item))       // () => void
arr.forEach(item => counter.inc())   // () => void — same type
```

> **Design decision:** a separate type `mut () => T` (analogous to `FnMut` in Rust) was rejected. Reason — virality: every higher-order function (`map`, `filter`, `forEach`) would require a `mut` overload, and generic callbacks — extra annotation. The capture list `[c: Mut<Counter>]` already makes mutation explicit — it cannot be written by accident.

## Mut-closure across await — forbidden

A closure with `[x: Mut<T>]` capture **moves** the borrow into the closure struct. If the closure lives across `await` — compiler error:

```typescript
async function bad() {
    let arr = [1, 2, 3]
    const fn = [arr: Mut<i32[]>]() => arr.push(1)    // arr moved into fn
    await something()    // fn lives across await — error
    fn()
}
// error: closure with Mut<T> capture cannot live across await
//   hint: use owned capture [arr: i32[]] or complete closure before await
```

### Solution 1: owned capture

```typescript
async function ok() {
    let arr = [1, 2, 3]
    const fn = [arr: i32[]]() => arr.push(1)    // owned — ok across await
    await something()
    fn()
}
```

### Solution 2: call the closure before await

```typescript
async function ok() {
    let arr = [1, 2, 3]
    const fn = [arr: Mut<i32[]>]() => arr.push(1)
    fn()                    // called — fn is dropped, borrow released
    await something()
}
```

### Solution 3: create the closure after await

```typescript
async function ok() {
    let arr = [1, 2, 3]
    await something()
    const fn = [arr: Mut<i32[]>]() => arr.push(1)    // fresh borrow
    fn()
}
```

## Iterators via closures

`Iterable<T>` uses a closure-iterator instead of a class with `Ref<T>` in a field:

```typescript
interface Iterable<T> {
    iter(): mut () => T | null    // closure-iterator
}
```

A closure is allowed because it is stack-based and cannot outlive the source:

```typescript
class LinkedList<T> implements Iterable<T> {
    private head: Node<T> | null = null

    iter(): mut () => T | null {
        let current: Ref<Node<T>> | null = this.head    // Ref in closure
        return mut () => {
            if (current == null) return null
            let val = current.value
            current = current.next
            return val
        }
    }
}
```

C-output — closure compiles to a stack struct, no heap:

```c
// for LinkedList<i32>
typedef struct {
    Node_i32* current;   // captured Ref<Node<i32>>
} LinkedList_i32_iter_t;

static int32_t* LinkedList_i32_iter_next(LinkedList_i32_iter_t* self) {
    if (self->current == NULL) return NULL;
    int32_t* val = &self->current->value;
    self->current = self->current->next;
    return val;
}
```

Works on embedded — no heap, no ARC.

## Errors

### Closure outlived its source

```typescript
let fn: () => i32;
{
    const items = [1, 2, 3];
    fn = (): i32 => items.length;
}
fn();    // error: items is dead, borrow dangling
```

Fix — move capture:

```typescript
function makeFn(): () => i32 {
    const items = [1, 2, 3];
    return [items: i32[]](): i32 => items.length;    // move — ok
}
```

### Mut-closure across await

```typescript
async function bad() {
    let arr = [1, 2, 3]
    const fn = [arr: Mut<i32[]>]() => arr.push(1)
    await something()
    fn()
}
// error: closure with Mut<T> capture cannot live across await
//   hint: use owned capture [arr: i32[]] or complete closure before await
```

Fixes — see section [Mut-closure across await](#mut-closure-across-await--forbidden) above.

## Capture summary table

| Variable type | Default capture | Explicit capture | Across await? |
|----------------|--------------------|--------------|--------------|
| Primitive (`i32`, `f64`...) | copy | — | ✅ always |
| Complex `let` / `const` | `Ref<T>` | `[x: T]` (move) | ❌ Ref across await |
| Complex `let` | `Ref<T>` | `[x: Mut<T>]` (mut) | ❌ Mut across await |
| Complex `let` | `Ref<T>` | `[x: T]` (owned) | ✅ owned across await |

## See also

- [Borrow Checker Rules](./borrow-rules.md) — restrictions on simultaneous borrows
- [Scope Constraint](./scope-constraint.md) — Ref/Mut across await
- [Auto Drop](./auto-drop.md) — drop captured owned values
- [Arrow Functions](../02-syntax/functions/arrow.md) — closure syntax
- [Async/Await](../07-concurrency/async-await.md) — state machines and capture
