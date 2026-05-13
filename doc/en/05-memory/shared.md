# Shared\<T\> — Shared Ownership (ARC)

[← Up](./index.md) | [Next →](./weak.md) | [Previous ←](./mut.md)

---

`Shared<T>` — **ARC** (automatic reference counting) for shared ownership. Used for graphs, cyclic structures, and data with indefinite lifetime. Available **only on desktop/server** (requires heap).

## Creation

```typescript
class Node {
    value: i32;
}

let x: Shared<Node> = new Node();   // ARC — alloc + refcount = 1
x.value = 10;
console.log(x.value);               // 10
```

**Explicit type annotation** `Shared<T>` activates ARC. Without it — regular owned:

```typescript
let node = new Node();              // Owner — move semantics (stack/value)
let arc: Shared<Node> = new Node(); // Shared — ARC (heap, refcount)
```

## Retain (sharing ownership)

Assigning `Shared<T>` to another variable increments the counter:

```typescript
class Node {
    value: i32;
}
let a = new Shared<Node>();
a.value = 42;
let b = a;                          // retain — refcount = 2
console.log(b.value);               // 42
```

Both variables reference the same data. When each goes out of scope — `release`, and when refcount reaches 0 — deallocation.

## Read-only

`Shared<T>` is **strictly read-only**. Interior mutability is intentionally absent:

- Cannot call `mut` methods through `Shared<T>`
- Cannot pass as `Mut<T>`
- Data is available for reading only

This is an architectural decision: the event loop is single-threaded, mutation goes through `Channel`/actor pattern, and for counters — `Atomic<T>`.

## Breaking cycles with Weak\<T\>

Cyclic references (graphs, doubly-linked lists) require `Weak<T>` for back-references:

```typescript
class Node {
    value: i32;
    next: Weak<Node> | null;
}

let n = new Shared<Node>();
n.value = 1;
n.next = null;
let w = new Weak<Node>(n);
console.log(n.value);               // 1
```

Without `Weak<T>` the cycle `A → Shared<B> → Shared<A>` would never be freed (refcount would never reach 0).

## C-output

### Creating Shared

```typescript
class Node {
    value: i32;
}
let x: Shared<Node> = new Node();
x.value = 10;
console.log(x.value);
```

```c
typedef struct { int32_t _refcount; int32_t value; } Node;

int main(void) {
    TSC_INIT();
    Node *x = tsc_arc_alloc(sizeof(Node));
    x->value = 0;
    x->value = 10;
    printf("%d\n", x->value);
    tsc_arc_release(x);
    return 0;
}
```

- The `_refcount` field is automatically added at the beginning of the struct
- `tsc_arc_alloc` — heap allocation with refcount = 1
- `tsc_arc_release` at end of scope — decrement and free when refcount = 0

### Retain

```typescript
let a = new Shared<Node>();
a.value = 42;
let b = a;
console.log(b.value);
```

```c
Node *a = tsc_arc_alloc(sizeof(Node));
a->value = 42;
Node *b = tsc_arc_retain(a);       // refcount++
printf("%d\n", b->value);
tsc_arc_release(b);                 // refcount--
tsc_arc_release(a);                 // refcount-- → 0 → free
```

### Weak field (doubly-linked list)

```typescript
class Node {
    value: i32;
    next: Weak<Node> | null;
}
```

```c
typedef struct Node Node;
struct Node {
    int32_t _refcount;
    int32_t _weakcount;
    int32_t value;
    Node *next;                      // weak pointer (no retain)
};
```

When `Weak<T>` is present in fields, `_weakcount` is added.

## Restrictions

### Not on embedded

`Shared<T>` requires a heap allocator. On embedded (no heap) — compilation error:

```typescript
#[allocator(none)]
class Node { value: i32; }
let x: Shared<Node> = new Node();
// error: "Shared<T>" requires a heap allocator; "none" allocator does not support ARC
```

### No Mut from Shared

```typescript
let arc = new Shared<Data>();
function modify(d: Mut<Data>): void { /* ... */ }
modify(arc);    // error: Shared<T> is read-only, cannot create Mut<T>
```

### No interior mutability

Data cannot be modified through `Shared<T>` — for mutation you need an owner (`let`) or `Mut<T>`.

## Transfer matrix

| Source ↓ \ Parameter → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `Shared<T>` | ✅ borrow | ❌ | ❌ | ✅ retain |
| `let T` | ✅ auto borrow | ✅ auto mut borrow | ✅ move | ❌ |
| `const T` | ✅ auto borrow | ❌ | ❌ | ❌ |

## Compiler errors

| Code | Error | Solution |
|-----|--------|---------|
| `Shared<T>` on embedded | `"Shared<T>" requires a heap allocator` | Use owned + `Ref<T>` via parameters |
| `modify(arc: Shared<T>)` with `Mut<T>` parameter | `Shared<T> is read-only` | Pass owned or `Mut<T>` |
| `new Shared<T>()` with `#[allocator(none)]` | `"none" allocator does not support ARC` | Remove `#[allocator(none)]` or do not use `Shared<T>` |

## See also

- [Weak\<T\>](./weak.md) — weak reference for breaking cycles
- [Ref\<T\>](./ref.md) — immutable borrow
- [Mut\<T\>](./mut.md) — mutable borrow
- [const](../02-syntax/variables/const.md) — Shared\<T\> as a workaround for the no-move-from-const restriction
