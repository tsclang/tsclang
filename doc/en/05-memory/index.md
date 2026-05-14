# Memory Model

[← Up](../index.md) | [Next →](./ownership-types.md)

---

TSClang uses a **hybrid memory management model**: static ownership/borrow checker + optional ARC. No GC, no manual `free`.

## Principle

The compiler statically tracks the owner of each value. Memory deallocation is deterministic, at the end of the owner's scope. For cases where static analysis is insufficient (graphs, cycles) — `Shared<T>` with atomic refcount (ARC).

## Ownership Types

| Type | Semantics | Description |
|------|-----------|-------------|
| `T` | **Owner** | Full ownership, move on transfer |
| `Ref<T>` | **Immutable borrow** | Read-only, no modification or deletion |
| `Mut<T>` | **Mutable borrow** | Read and write, only one `Mut` at a time |
| `Shared<T>` | **ARC** | Strong ref, increments refcount, desktop only |
| `Weak<T>` | **Weak ref** | Doesn't increment refcount, breaks cycles |
| `Slice<T>` | **Borrowed array view** | Zero-copy sub-range, pointer + length |

## Basic Rules

- **Primitives** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — always **copied**, borrow checker doesn't apply
- **Complex types** (arrays, objects, strings, classes) — managed by ownership system
- `string` — heap-allocated Owner, passed as `Ref<string>`, copied via `clone()`
- **Borrow from array** — `arr[i]` for complex types only via `Ref<T>`; move is forbidden (E009)
- **Borrow object fields** — not supported; pass the entire object as `Ref<T>`

## Borrow checker

**Aliasing XOR mutability** rule: two `Mut` simultaneously is not allowed, `Mut` + `Ref` is not allowed, but multiple `Ref` simultaneously is allowed.

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // ok — multiple Ref allowed
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // error: active Mut already exists
```

## Automatic Drop

The compiler inserts `free()` at the end of the owner's scope. With multiple `return` and `throw` — single cleanup point via `goto cleanup`:

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... work ...
cleanup:
    if (u) User_free(u);
}
```

## Subpages

| Page | Description |
|------|-------------|
| [Ownership Types](./ownership-types.md) | Overview of all ownership types and their C representations |
| [Owner (T)](./owner.md) | Full ownership, move on assignment and transfer |
| [Ref<T>](./ref.md) | Immutable borrow, view patterns |
| [Mut<T>](./mut.md) | Mutable borrow, exclusivity rules |
| [Shared<T> and Weak<T>](./shared.md) | ARC and weak references for graphs and cycles |
| [Slice<T>](./slice.md) | Zero-copy view on part of array or string |
| [Borrow checker](./borrow-checker.md) | Aliasing rules, lifetime, scope constraints |
| [Drop and cleanup](./drop.md) | Automatic deallocation, `goto cleanup` |
| [Destructuring](./destructuring.md) | Borrow vs move when destructuring fields |
| [Closures](./closures.md) | Capture rules: copy, Ref, Mut, move |
| [Borrow Guide](./borrow-guide.md) | Practical examples, errors and fixes |
| [Iterators](./iterators.md) | `Iterable<T>`, pull-based stack iterators |

## C-output

```typescript
let user = new User();
user.name = "Alice";
// end of scope — User_free called automatically
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... usage ...
User_free(&user);   // inserted by compiler
```

## Errors

| Error | Cause |
|-------|-------|
| `use of moved value: "x"` | Accessing variable after move |
| `already borrowed as Mut` | Second `Mut` or `Ref` while `Mut` is active |
| `already borrowed as Ref` | `Mut` while `Ref` is active |
| `Ref<T> not allowed in class field` | Attempting to store borrow in class field |
| `cannot move out of array by index` | `arr[i]` for owned type without `.remove()` |
| `Cannot return borrow to array element from function` | Returning `Ref<T>`/`Mut<T>` on `arr[i]` from function |
| `Cannot borrow a class field` | `Ref<T>`/`Mut<T>` from object field (`obj.field`) |
| `Cannot return mutable borrow to local variable` | Returning `Mut<T>` on local variable from function |

## See also

- [Variables: let / const](../02-syntax/variables/index.md) — impact of `let`/`const` on `Mut<T>` / `Ref<T>`
- [Functions](../02-syntax/functions/declaration.md) — argument passing rules
- [Classes](../04-classes/index.md) — `mut`-methods and `readonly` fields
- [Errors](../06-errors/index.md) — `goto cleanup` on `throw` / `?`
