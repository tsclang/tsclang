# Variables: let and const

[← Up](./index.md) | [Next →](./let.md)

---

TSClang has two forms of variable declaration: `let` (mutable) and `const` (immutable). The key difference from TypeScript — the choice between `let` and `const` affects not only reassignment, but also **ownership semantics**: `const` forbids move, passing as `Mut<T>`, and calling `mut`-methods.

## Quick Summary

| Property | `let` | `const` |
|----------|-------|---------|
| Reassignment | ✅ | ❌ |
| Calling `mut`-methods | ✅ | ❌ |
| Passing as `Mut<T>` | ✅ | ❌ |
| Passing as `Ref<T>` | ✅ auto borrow | ✅ auto borrow |
| Move (passing as `T`) | ✅ | ❌ |
| Spread on complex types | ✅ move | ❌ (primitives only — copy) |

## Declaration

```typescript
let counter: i32 = 0         // mutable
const name: string = "Alice" // immutable

// type inference
let x = 42        // i32
const s = "hello"  // string
```

## Ownership Differences

### mut-methods and Mut<T>

`const` variable cannot be passed to a function accepting `Mut<T>`, and `mut`-methods cannot be called on it:

```typescript
function foo(c: Mut<Counter>) { c.increment(); }

const c = new Counter();
foo(c);   // error: const cannot be passed as Mut

let c2 = new Counter();
foo(c2);  // ok
```

### Move from const is Forbidden

Cannot move value out of `const` variable — this would violate immutability guarantee:

```typescript
const arr = [user1, user2];
let b = arr;       // error: cannot move out of const
                   // hint: use Shared<T> if shared ownership is needed

const arr2: Shared<User[]> = [user1, user2];
let b2 = arr2;     // ok — retain (refcount++), not move
```

### Argument Passing Matrix

| Source ↓ \ Parameter → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `let T` | ✅ auto borrow | ✅ auto mut borrow | ✅ move | ❌ |
| `const T` | ✅ auto borrow | ❌ | ❌ | ❌ |
| `Shared<T>` | ✅ borrow | ❌ | ❌ | ✅ retain |

## For-of and let/const

`for-of` behavior depends on loop variable declaration:

- `for (const item of arr)` — `Ref<T>` (read-only)
- `for (let item of arr)` — `Mut<T>`, but **only if source is `let`**

```typescript
const arr = [obj1, obj2];
for (const item of arr) { /* item: Ref<Obj> */ }  // ok
for (let item of arr) { }   // error: source is const
```

## Spread on const

Spread on `const` works only if elements are primitives (copy). For complex types — error:

```typescript
const nums: i32[] = [1, 2, 3];
const copy = [...nums, 4, 5];  // ok — primitives are copied

const users: User[] = [user1, user2];
const all = [...users];  // error: cannot spread const array of non-primitive type
```

Workaround — `Shared<T>`, `let`, or `clone()`.

## Detailed Pages

- [let](./let.md) — mutable variables: reassignment, mut-methods, Mut<T>, for-of
- [const](./const.md) — immutable variables: limitations, Shared<T>, spread

## See also

- [Memory Model](../../05-memory/index.md) — Ownership, borrow checker, Shared<T>
- [For-of](../loops/for-of.md) — collection iteration
- [Spread](../operators/optional.md) — spread operator and ownership
