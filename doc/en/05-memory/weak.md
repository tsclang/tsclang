# Weak\<T\> — Weak Reference

[← Up](./index.md) | [Next →](./borrow-rules.md) | [Previous ←](./shared.md)

---

`Weak<T>` — weak reference for breaking cycles when using `Shared<T>`. Does not increment refcount. Access always returns `T | null` — data may have already been freed.

## Why

Cyclic references in `Shared<T>` prevent memory deallocation (refcount never reaches 0):

```typescript
class Node {
    next: Shared<Node>;     // strong ref → cycle!
}
```

`Weak<T>` breaks the cycle without holding data:

```typescript
class Node {
    next: Shared<Node>;
    prev: Weak<Node>;       // weak ref → no cycle
}
```

## Creation

```typescript
class Data {
    x: i32;
}
let d = new Shared<Data>();
d.x = 99;
let w = new Weak<Data>(d);   // weak reference, refcount not incremented
```

## Access (upgrade)

`Weak<T>` does not provide direct data access. You need `upgrade()` — returns `Shared<T> | null`:

```typescript
let d = new Shared<Data>();
d.x = 99;
let w = new Weak<Data>(d);
let strong = w.upgrade();     // Shared<Data> | null
if (strong != null) {
    console.log(strong.x);    // 99
}
```

If data has already been freed (refcount = 0), `upgrade()` returns `null`.

## Usage in fields

Typical pattern — doubly-linked list / graph:

```typescript
class Node {
    value: i32;
    next: Weak<Node> | null;
}

let n = new Shared<Node>();
n.value = 1;
n.next = null;
let w = new Weak<Node>(n);
console.log(n.value);         // 1
```

Back-references in graphs — via `Weak<T>`, forward ones — via `Shared<T>`.

## Optional chaining

Since `Weak<T>` may return `null`, use `?.` and `??`:

```typescript
let w = new Weak<Data>(arc);
let val = w.upgrade()?.x ?? 0;    // safe access with fallback
```

## C-output

### Weak creation and upgrade

```typescript
class Data {
    x: i32;
}
let d = new Shared<Data>();
d.x = 99;
let w = new Weak<Data>(d);
let strong = w.upgrade();
if (strong != null) {
    console.log(strong.x);
}
```

```c
typedef struct { int32_t _refcount; int32_t _weakcount; int32_t x; } Data;

int main(void) {
    TSC_INIT();
    Data *d = tsc_arc_alloc(sizeof(Data));
    d->x = 99;
    Data *w = tsc_weak_create(d);        // weak ref, _weakcount++
    Data *strong = tsc_weak_upgrade(w);  // NULL if already freed
    if (strong != NULL) {
        printf("%d\n", strong->x);
        tsc_arc_release(strong);         // upgrade returns retained
    }
    tsc_weak_release(w);                 // _weakcount--
    tsc_arc_release(d);                  // refcount-- → 0 → free
    return 0;
}
```

- `tsc_weak_create` — creates a weak reference, increments `_weakcount`, but **not** `_refcount`
- `tsc_weak_upgrade` — returns `NULL` or a retained pointer (`release` needed)
- `tsc_weak_release` — decrements `_weakcount`

### Struct with Weak field

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
    Node *next;          // weak pointer — no retain on assignment
};
```

Presence of `Weak<T>` in fields automatically adds `_weakcount` to the struct.

## Restrictions

### Only with Shared\<T\>

`Weak<T>` works **only** with `Shared<T>`. Cannot create `Weak<T>` from an owned value:

```typescript
let x = new Node();             // owned
let w = new Weak<Node>(x);      // error: Weak<T> requires Shared<T>
```

### Not on embedded

Like `Shared<T>`, `Weak<T>` is unavailable on embedded — no heap allocator.

### Upgrade may return null

Always check the result of `upgrade()`:

```typescript
let strong = w.upgrade();
if (strong != null) {
    // ok — data is alive
} else {
    // data has already been freed
}
```

## Compiler errors

| Code | Error | Solution |
|-----|--------|---------|
| `new Weak<T>(owned)` | `Weak<T> requires Shared<T>` | Create `Shared<T>` first |
| `Weak<T>` on embedded | `requires a heap allocator` | Use owned + parameters |
| `w.x` (direct access) | Access via `w.upgrade()?.x` | Always use `upgrade()` |

## See also

- [Shared\<T\>](./shared.md) — shared ownership (ARC)
- [Ref\<T\>](./ref.md) — immutable borrow
- [Mut\<T\>](./mut.md) — mutable borrow
- [const](../02-syntax/variables/const.md) — Shared\<T\> as a workaround for the restriction
