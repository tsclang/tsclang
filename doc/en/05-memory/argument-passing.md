# Argument Passing in Functions

[← Up](./index.md) | [Next →](./scope-constraint.md) | [Previous ←](./borrow-rules.md)

---

The parameter type in a function signature **fully dictates the semantics** at the callsite. No explicit `&` or `*` is needed — the compiler determines behavior from the type.

## Primitives — always copy

Primitive types (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) are **always copied**, regardless of the parameter type:

```typescript
function foo(x: i32): void { /* ... */ }

let n = 42;
foo(n);     // copy — n is alive after the call
console.log(n);  // → 42
```

## Complex types — 4 variants

```typescript
function toRef(x: Ref<User>): void { ... }        // immutable borrow
function toMut(x: Mut<User>): void { ... }        // mutable borrow
function toOwned(x: User): void { ... }           // move — ownership transferred
function toShared(x: Shared<User>): void { ... }  // retain — refcount++
```

### Ref<T> — immutable borrow

The function receives read-only access. The original variable remains valid after the call.

```typescript
class User { name: string; }

function getName(u: Ref<User>): string {
    return u.name;
}

let user = new User();
user.name = "Alice";
const n = getName(user);    // auto borrow: user → Ref<User>
console.log(n);             // → "Alice"
console.log(user.name);     // ok — user is untouched
```

C-output:

```c
String getName_ref_User(const User *u) {
    return u->name;
}

int main(void) {
    TSC_INIT();
    User user = {0};
    user.name = STR_LIT("Alice");
    const String n = getName_ref_User(&user);  // &user — const pointer
    printf("%s\n", n.data);
    return 0;
}
```

### Mut<T> — mutable borrow

The function can modify the object. Requires a `let` variable at the callsite.

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}

let nums: i32[] = [1, 2, 3];
fill(nums);               // auto mut borrow
console.log(nums[0]);     // → 99
```

C-output:

```c
void fill_mut_Array_i32(Array_i32 *arr) {
    arr->data[0] = 99;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    Array_i32 nums = {.data = _lit_0, .length = 3, .capacity = 3};
    fill_mut_Array_i32(&nums);     // &nums — read-write pointer
    printf("%d\n", nums.data[0]);
    return 0;
}
```

### T (owned) — move

Ownership is transferred to the function. The source variable is **unavailable** after the call.

```typescript
class Buffer { data: string; }

function consume(buf: Buffer): void {
    console.log(buf.data);
}

let b = new Buffer();
b.data = "hello";
consume(b);            // move — b is no longer valid
// console.log(b);     // error: use of moved value: "b"
```

C-output:

```c
void consume_Buffer(Buffer buf) {
    printf("%s\n", buf.data.data);
}

int main(void) {
    TSC_INIT();
    Buffer b = {0};
    b.data = STR_LIT("hello");
    consume_Buffer(b);           // struct copied by value — ownership transferred
    return 0;
}
```

### Shared<T> — retain

The refcount is incremented. Only works if the variable already has type `Shared<T>`.

```typescript
let s: Shared<Node> = new Node();
toShared(s);    // retain — refcount++
```

## Compatibility matrix

| Source ↓ \ Parameter → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `let T`                  | ✅ auto borrow | ✅ auto mut | ✅ move | ❌ |
| `const T`                | ✅ auto borrow | ❌ | ❌ | ❌ |
| `Ref<T>`                 | ✅ re-borrow | ❌ | ❌ | ❌ |
| `Mut<T>`                 | ✅ downgrade | ✅ re-borrow | ❌ | ❌ |
| `Shared<T>`              | ✅ borrow | ❌ | ❌ | ✅ retain |

### let → all variants

```typescript
let u = new User();

toRef(u);      // ok — auto borrow
toMut(u);      // ok — auto mut borrow
toOwned(u);    // ok — move
toShared(u);   // error: u is not Shared<T>
```

### const → only Ref

```typescript
const u = new User();

toRef(u);      // ok — auto borrow
toMut(u);      // error: cannot borrow "u" as mutable: it is a const binding
toOwned(u);    // error: cannot move out of "const" binding
```

### Ref<T> → only re-borrow

```typescript
function bar(u: Ref<User>): void {
    toRef(u);      // ok — re-borrow
    toMut(u);      // error: cannot create Mut<T> from Ref<T>
    toOwned(u);    // error: cannot move out of "Ref<T>" borrow
}
```

> **Hint:** if you need to pass an owned value from `Ref<T>` — use `clone()` (provided the type implements `Clone`).

### Mut<T> → Ref or Mut

```typescript
function baz(u: Mut<User>): void {
    toRef(u);      // ok — Mut → Ref (downgrade)
    toMut(u);      // ok — re-borrow as Mut
    toOwned(u);    // error: cannot move out of Mut<T>
}
```

Downgrading `Mut<T>` → `Ref<T>` is safe: read-only access is strictly weaker than read-write.

### Shared<T> → Ref or Shared

```typescript
function qux(u: Shared<User>): void {
    toRef(u);      // ok — borrow from Shared
    toMut(u);      // error: Shared<T> does not allow Mut (no exclusive ownership)
    toOwned(u);    // error: cannot move out of Shared
    toShared(u);   // ok — retain (refcount++)
}
```

## Errors and fixes

### Mut from const

```typescript
function fill(arr: Mut<i32[]>): void { arr[0] = 99; }

const nums: i32[] = [1, 2, 3];
fill(nums);
// cannot borrow "nums" as mutable: it is a const binding
```

Fix — use `let`:

```typescript
let nums: i32[] = [1, 2, 3];
fill(nums);    // ok
```

### Move from Ref

```typescript
class Obj { x: i32; }

function take(r: Ref<Obj>): void {
    const o: Obj = r;    // cannot move out of "Ref<T>" borrow
}
```

Fix — use `clone()`:

```typescript
function take(r: Ref<Obj>): void {
    const o: Obj = r.clone();    // ok — owned copy
}
```

### Move from const

```typescript
class Obj { x: i32; }

const o = new Obj();
const p = o;    // cannot move out of "const" binding
```

Fix — use `let` to transfer ownership:

```typescript
let o = new Obj();
const p = o;    // ok — move from let
```

## See also

- [Borrow Checker Rules](./borrow-rules.md) — restrictions on simultaneous borrows
- [Scope Constraint](./scope-constraint.md) — lifetime restrictions
- [Closures](./closures.md) — capturing Ref/Mut/owned
- [let](../02-syntax/variables/let.md) / [const](../02-syntax/variables/const.md) — impact on passing
