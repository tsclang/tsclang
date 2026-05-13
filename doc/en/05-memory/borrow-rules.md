# Borrow Checker Rules

[← Up](./index.md) | [Next →](./argument-passing.md) | [Previous ←](./weak.md)

---

The borrow checker guarantees memory safety at compile time. Three rules control how `Ref<T>` and `Mut<T>` may coexist.

## Rule 1: No two Mut at the same time

Only **one** `Mut<T>` may be active on an object at a time. This eliminates data races and aliasing bugs.

```typescript
class Box {
    x: i32;
}

let b = new Box();
b.x = 1;

function take(m: Mut<Box>): void { m.x = 2; }
function take2(m: Mut<Box>): void { m.x = 3; }

take(b);
take2(b);   // error: sequential calls ok — borrow released after take()
```

The error occurs with **simultaneous** existence of two `Mut<T>`:

```typescript
let b = new Box();
b.x = 1;

function take(m: Mut<Box>): void { m.x = 2; }
function take2(m: Mut<Box>): void { m.x = 3; }

take(b);
take2(b);   // TypeError: Cannot create two simultaneous mutable borrows of 'b'
```

> **Note:** sequential calls `take(b)`, then `take2(b)` — are allowed. The borrow lives only for the duration of the function call, after which it is released.

### C-output: sequential Mut calls

```typescript
class Box { x: i32; }
function mutate(m: Mut<Box>): void { m.x = 2; }
let b = new Box();
b.x = 1;
mutate(b);
mutate(b);
console.log(b.x);
```

```c
#include "runtime.h"

typedef struct { int32_t value; } Box;

void mutate_mut_Box(Box *m) {
    m->x = 2;
}

int main(void) {
    TSC_INIT();
    Box b = {0};
    b.x = 1;
    mutate_mut_Box(&b);
    mutate_mut_Box(&b);
    printf("%d\n", b.x);    // 2
    return 0;
}
```

Each call passes `&b` — pointer to the same object. Between calls the borrow is inactive.

## Rule 2: No Mut + Ref at the same time

While a `Ref<T>` exists, creating a `Mut<T>` on the same object is not allowed — and vice versa.

```typescript
class Box {
    x: i32;
}

let b = new Box();
b.x = 1;

function mutate(m: Mut<Box>): void { m.x = 2; }
function read(r: Ref<Box>): i32 { return r.x; }

const r = read(b);
mutate(b);          // TypeError: Cannot create mutable borrow of 'b'
                    //         while immutable borrow is active
console.log(r);
```

Error: `r` holds `Ref<Box>` (the result of `read` may reference `b`), and `mutate(b)` tries to create `Mut<Box>`.

### Fix: use the borrow before mutation

```typescript
let b = new Box();
b.x = 1;

function mutate(m: Mut<Box>): void { m.x = 2; }
function read(r: Ref<Box>): i32 { return r.x; }

console.log(read(b));    // Ref-borrow: created and released
mutate(b);               // Mut-borrow: ok — no active Ref
```

### C-output: Ref and Mut in sequence

```typescript
class Counter { value: i32; }
function increment(c: Mut<Counter>): void { c.value += 1; }
function read(c: Ref<Counter>): i32 { return c.value; }

let cnt = new Counter();
cnt.value = 0;
increment(cnt);
increment(cnt);
console.log(read(cnt));
```

```c
#include "runtime.h"

typedef struct { int32_t value; } Counter;

void increment_mut_Counter(Counter *c) {
    c->value += 1;
}

int32_t read_ref_Counter(const Counter *c) {
    return c->value;
}

int main(void) {
    TSC_INIT();
    Counter cnt = {0};
    cnt.value = 0;
    increment_mut_Counter(&cnt);    // Mut — read-write pointer
    increment_mut_Counter(&cnt);
    printf("%d\n", read_ref_Counter(&cnt));  // Ref — const pointer
    return 0;
}
```

Name mangling: `_mut_` for `Mut<T>`, `_ref_` for `Ref<T>`.

## Rule 3: Multiple Ref at the same time allowed

Multiple `Ref<T>` on the same object are safe, because all are read-only.

```typescript
function len(arr: Ref<i32[]>): i32 {
    return arr.length as i32;
}

const nums: i32[] = [1, 2, 3, 4];
const a = len(nums);    // Ref-borrow #1
const b = len(nums);    // Ref-borrow #2 — ok
console.log(a + b);     // → 8
```

### C-output: multiple Ref

```c
#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int32_t len_ref_Array_i32(const Array_i32 *arr) {
    return (int32_t)arr->length;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4};
    const Array_i32 nums = {.data = _lit_0, .length = 4, .capacity = 4};
    const int32_t a = len_ref_Array_i32(&nums);   // &nums — const pointer
    const int32_t b = len_ref_Array_i32(&nums);   // &nums — another const pointer
    printf("%d\n", a + b);
    return 0;
}
```

Both calls pass `&nums` (const pointer). Reading does not change data — no conflicts.

## Mutating a collection while a borrow is active

Borrowing an element = borrowing the entire collection. Mutating the collection while at least one `Ref<T>` is alive — error.

```typescript
class User { name: string; }

let users: User[] = [new User()];
let u: Ref<User> = users[0];   // borrow on users
users.push(new User());         // cannot mutate 'users' while a borrow is active
```

### Fix: limit the borrow scope

```typescript
let users: User[] = [new User()];
{
    let u: Ref<User> = users[0];   // borrow begins
    console.log(u.name);
}                                  // borrow ends
users.push(new User());            // ok — no active borrows
```

## Summary table

| Situation | Allowed? |
|----------|-----------|
| One `Mut<T>` | ✅ |
| Two `Mut<T>` simultaneously | ❌ |
| One `Ref<T>` | ✅ |
| Multiple `Ref<T>` simultaneously | ✅ |
| `Mut<T>` + `Ref<T>` simultaneously | ❌ |
| `Ref<T>` on collection + collection mutation | ❌ |
| Sequential borrows (one released, another created) | ✅ |

## See also

- [Argument Passing](./argument-passing.md) — how Ref/Mut/owned are passed to functions
- [Scope Constraint](./scope-constraint.md) — lifetime restrictions for Ref/Mut
- [Auto Drop](./auto-drop.md) — automatic memory deallocation
- [Closures](./closures.md) — capturing Ref/Mut in closures
- [let / const](../02-syntax/variables/let.md) — impact on borrow rules
