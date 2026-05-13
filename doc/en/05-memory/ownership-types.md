# Ownership Types — Overview

[← Up](./index.md) | [Next →](./owner.md)

---

Every value in TSClang has one of six ownership modes. The mode determines who frees memory and which operations are allowed.

## Type table

| Type | Semantics | Who frees | Parallel access |
|-----|-----------|-----------------|---------------------|
| `T` | **Owner** — owns the object | Automatic drop at end of scope | No — move on transfer |
| `Ref<T>` | **Immutable borrow** — read-only | Does not free (not owner) | Multiple `Ref` simultaneously |
| `Mut<T>` | **Mutable borrow** — read and write | Does not free (not owner) | Only one `Mut` at a time |
| `Shared<T>` | **ARC** — strong ref | `release()` when refcount = 0 | Desktop only, read-only |
| `Weak<T>` | **Weak ref** — does not hold object | Does not free | `T \| null` on access |
| `Slice<T>` | **Borrowed array view** | Does not free | Zero-copy, bound to source |

## C representations

Each ownership type compiles to a specific C type:

| TSClang Type | C Representation | Note |
|-------------|----------------|-----------|
| `T` (owned) | `T value` / `T* ptr` | move = do not call `_free` on the source |
| `Ref<T>` | `const T* ptr` | read-only pointer |
| `Mut<T>` | `T* ptr` | read-write pointer |
| `Shared<T>` | `T* ptr` + `int32_t _refcount` | ARC, `tsc_arc_retain` / `tsc_arc_release` |
| `Weak<T>` | `T* ptr` + `int32_t _weakcount` | does not hold object, `tsc_weak_*` |
| `Slice<T>` | `T* ptr` + `size_t length` | view without copying data |

## Example: Ref<T> in C

```typescript
function getName(u: Ref<User>): string {
    return u.name;
}
```

```c
String getName_ref_User(const User *u) {
    return u->name;
}
```

## Example: Mut<T> in C

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}
```

```c
void fill_mut_Array_i32(Array_i32 *arr) {
    arr->data[0] = 99;
}
```

## Example: Shared<T> in C

```typescript
let a = new Shared<Node>();
a.value = 42;
let b = a;   // retain — a and b are alive
```

```c
Node *a = tsc_arc_alloc(sizeof(Node));
a->value = 42;
Node *b = tsc_arc_retain(a);
// ...
tsc_arc_release(b);
tsc_arc_release(a);
```

## Example: Weak<T> in C

```typescript
let n = new Shared<Node>();
n.value = 1;
let w = new Weak<Node>(n);   // weak ref — refcount does not increase
```

```c
Node *n = tsc_arc_alloc(sizeof(Node));
n->value = 1;
Node *w = tsc_weak_create(n);
// ...
tsc_weak_release(w);
tsc_arc_release(n);
```

## Move<T> does not exist

`Move<T>` is **not** a storage mode. Move is an **operation** for transferring ownership. In C no new type appears: bare `T` in parameters and return types already means move.

```typescript
function consume(buf: Buffer): void { ... }   // buf passed by value = move
```

```c
void consume_Buffer(Buffer buf) { ... }   // value passed, caller does not free
```

## Argument passing rules

The parameter type in the signature **fully dictates** semantics at the callsite — no explicit `&` or `*` needed.

**Primitives — always copy**, regardless of parameter type.

**Complex types — 4 variants:**

```typescript
function toRef(x: Ref<User>): void { ... }        // borrow — x alive after call
function toMut(x: Mut<User>): void { ... }        // mutable borrow
function toOwned(x: User): void { ... }           // move — x unavailable after call
function toShared(x: Shared<User>): void { ... }  // retain (refcount++)
```

**Compatibility matrix:**

| Source ↓ \ Parameter → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `let T`                  | auto borrow | auto mut borrow | move | - |
| `const T`                | auto borrow | - | - | - |
| `Ref<T>`                 | re-borrow | - | - | - |
| `Mut<T>`                 | downgrade | re-borrow | - | - |
| `Shared<T>`              | borrow | - | - | retain |

## Errors

| Error | Cause |
|--------|---------|
| `cannot move out of "Ref<T>" borrow` | Attempting to move from `Ref<T>` |
| `cannot move out of "const" binding` | Move from a `const` variable |
| `already borrowed as Mut` | Second `Mut` or `Ref` while a `Mut` is active |
| `Ref<T> not allowed in class field` | `Ref<T>` in a class field |

## See also

- [Owner (T)](./owner.md) — full ownership, move on assignment and transfer
- [Ref\<T\>](./ref.md) — immutable borrow
- [Mut\<T\>](./mut.md) — mutable borrow
- [Shared\<T\> and Weak\<T\>](./shared.md) — ARC and weak references
- [Slice\<T\>](./slice.md) — zero-copy view
- [Borrow checker](./borrow-checker.md) — detailed lifetime and scope rules
