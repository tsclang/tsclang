# const — Immutable Variables

[← Up](./index.md) | [Previous ←](./let.md)

---

Keyword `const` declares an **immutable** variable. The value cannot be reassigned, and for complex types additionally forbidden are: calling `mut`-methods, passing as `Mut<T>`, and move.

## Declaration

```typescript
const x: i32 = 42
const name = "Alice"       // type inference: string
const arr: i32[] = [1, 2, 3]
const user = new User("Bob")
```

`const` requires an initializer — cannot be declared without a value:

```typescript
const x: i32           // error: const declaration requires initializer
const x: i32 = 0       // ok
```

## What You Cannot Do with const

### Reassignment

```typescript
const x = 10
x = 20    // error: cannot assign to const variable
```

### Calling mut-methods

```typescript
class Counter {
    private val: i32 = 0
    mut increment(): void { this.val++ }
    get(): i32 { return this.val }
}

const c = new Counter()
c.increment()    // error: cannot call mut method on const variable
c.get()          // ok — immutable method
```

### Passing as Mut<T>

```typescript
function increment(c: Mut<Counter>): void {
    c.increment()
}

const c = new Counter()
increment(c)    // error: const cannot be passed as Mut<Counter>

let c2 = new Counter()
increment(c2)   // ok
```

### Move from const

Cannot pass `const` variable as owned (`T`) — this would require move:

```typescript
function process(data: User[]): void { /* consumes data */ }

const users = [user1, user2]
process(users)    // error: cannot move out of const

let users2 = [user1, user2]
process(users2)   // ok — move, users2 inaccessible after
```

Cannot also assign `const` to `let` variable for complex types:

```typescript
const arr = [user1, user2]
let b = arr       // error: cannot move out of const
                   // hint: use Shared<T> if shared ownership is needed
```

## What You Can Do with const

### Reading Fields

```typescript
const user = new User("Alice", 30)
console.log(user.name)    // ok — Ref<string> (borrow)
console.log(user.age)     // ok — i32 (copy)
```

### Passing as Ref<T>

`const` is automatically borrowed as `Ref<T>`:

```typescript
function logName(u: Ref<User>): void {
    console.log(u.name)
}

const user = new User("Alice")
logName(user)    // ok — auto immutable borrow
console.log(user) // ok — user is alive
```

### Calling Immutable Methods

```typescript
const arr = [1, 2, 3]
arr.length       // ok — 3
arr[0]           // ok — 1 (Ref<i32> for complex, copy for primitives)
```

## Spread on const

Spread **consumes** the source (move). For `const` this is allowed only if elements are primitives (copy):

### Primitives — Allowed (copy)

```typescript
const nums: i32[] = [1, 2, 3]
const copy = [...nums, 4, 5]   // ok — i32 is Copy
console.log(nums)              // ok — nums alive
```

C-output:

```c
int32_t* nums = /* ... */;
int32_t copy[] = { nums[0], nums[1], nums[2], 4, 5 };
// nums not consumed — elements are copied
```

### Complex Types — Forbidden (move impossible)

```typescript
const admins: Admin[] = [admin1, admin2]
const users = [...admins]
// error: cannot spread const array of non-primitive type
// hint: use let, Shared<T>, or [...admins.clone()] if Admin implements Clone
```

### Objects — Forbidden

```typescript
const base = { x: 1, name: "Alice" }
const extended = { ...base, extra: 42 }
// error: cannot spread const object
// hint: use let, Shared<T>, or { ...base.clone(), extra: 42 } if type implements Clone
```

## Shared<T> — Workaround

If multiple variables need to reference the same data, use `Shared<T>` (ARC):

```typescript
const arr: Shared<User[]> = [user1, user2]
let b = arr       // ok — retain (refcount++), not move

const listA = [...arr, userA]   // ok — retain
const listB = [...arr, userB]   // ok — retain

console.log(arr)   // ok — Shared lives while refcount > 0
```

C-output for `Shared<T>` retain:

```c
UserArray* arr = /* ... */;
RC_retain(arr);      // refcount++
UserArray* b = arr;  // same pointer
// arr and b share ownership — freed when refcount hits 0
```

> `Shared<T>` is available only on desktop (requires heap and ARC). On embedded — use `Ref<T>` via function parameters.

## C-output: const Declaration

```typescript
const x: i32 = 42
const name: string = "Alice"
const user = new User("Bob")
```

```c
const int32_t x = 42;
const String name = { .data = "Alice", .length = 5, .capacity = 0 };
// user — const pointer, mut methods compile-time blocked
User* const user = User_new(&(String){ .data = "Bob", .length = 3, .capacity = 0 });
```

## Compiler Errors

| Code | Error | Hint |
|------|-------|------|
| `const c = new Counter(); foo(c)` | `const cannot be passed as Mut` | Use `let` |
| `const arr = [...]; let b = arr` | `cannot move out of const` | Use `Shared<T>` |
| `const arr = [...obj];` | `cannot spread const array of non-primitive type` | Use `let`, `Shared<T>` or `clone()` |
| `const x: i32` | `const declaration requires initializer` | Add initializer |

## See also

- [let](./let.md) — mutable variables
- [Memory Model](../../05-memory/index.md) — Shared<T>, ARC, Weak<T>
- [Spread](../operators/optional.md) — spread operator and ownership
- [For-of](../loops/for-of.md) — `const` semantics in loops
