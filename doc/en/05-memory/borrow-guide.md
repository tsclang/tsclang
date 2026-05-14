# Borrow Guide: Ref<T> and Mut<T>

[← Up](./index.md)

---

This is a practical guide to borrowing in TSClang. Working examples, common errors, and how to fix them.

## What is borrow

**Borrow** — temporary access to someone else's data without transferring ownership.

- `Ref<T>` — read-only
- `Mut<T>` — read and write (only one at a time)

```typescript
function printName(u: Ref<User>): void {
    console.log(u.name);   // read, but don't own
}

let user = new User();
user.name = "Alice";
printName(user);           // ✅ borrow — user remains valid
console.log(user.name);    // ✅ can keep using it
```

## Borrow from array

### ✅ Correct: borrow element

```typescript
const users: User[] = [new User()];
const u: Ref<User> = users[0];   // borrow first element
console.log(u.name);             // ✅ read through borrow
```

### ❌ Error: move from array by index

```typescript
const users: User[] = [new User()];
const u = users[0];              // ❌ E009: cannot move out of array by index
```

**Fix:** use `Ref<T>` for borrow or `.remove()` for move:

```typescript
const u: Ref<User> = users[0];   // ✅ borrow
const u = users.remove(0);       // ✅ move + removal from array
```

### ❌ Error: mutate array while borrow is active

```typescript
const users: User[] = [new User()];
const u: Ref<User> = users[0];
users.push(new User());          // ❌ cannot mutate 'users' while borrow is active
```

**Fix:** limit borrow scope with `{}` block:

```typescript
const users: User[] = [new User()];
{
    const u: Ref<User> = users[0];
    console.log(u.name);
}   // borrow released
users.push(new User());          // ✅ ok
```

> **Note:** borrow on a collection blocks mutation only until the end of the `{}` scope where the borrow variable was created. After the block ends, mutation is allowed again.

## Borrow object fields

### ❌ Error: borrow field directly

```typescript
class Container {
    user: User;
}
const c = new Container();
const u: Ref<User> = c.user;     // ❌ Cannot borrow a class field
```

**Fix:** pass the entire object to a function:

```typescript
function getName(c: Ref<Container>): string {
    return c.user.name;          // ✅ access inside function
}
```

## Return borrow from function

### ❌ Error: return borrow on array element

```typescript
function first(arr: Ref<User[]>): Ref<User> {
    return arr[0];               // ❌ Cannot return borrow to array element
}
```

**Reason:** borrow lifetime cannot be expressed without annotations (`'a`). The compiler cannot guarantee that the array outlives the returned borrow.

**Fix:** return an owned copy or pass array and index separately:

```typescript
function getName(arr: Ref<User[]>, i: i32): string {
    return arr[i].name;          // ✅ return string, not borrow
}
```

## Mut<T>: mutable borrow

### ✅ Correct: mutable borrow parameter

```typescript
function increment(c: Mut<Counter>): void {
    c.value += 1;
}

let cnt = new Counter();
cnt.value = 0;
increment(cnt);                  // ✅ cnt mutated
console.log(cnt.value);          // 1
```

### ❌ Error: two Mut simultaneously

```typescript
let cnt = new Counter();
const m1: Mut<Counter> = cnt;
const m2: Mut<Counter> = cnt;    // ❌ already borrowed as Mut
```

**Fix:** use one Mut per scope:

```typescript
let cnt = new Counter();
{
    const m: Mut<Counter> = cnt;
    m.value += 1;
}
// m released
```

## Closures and borrow

### ✅ Correct: variable capture

```typescript
let prefix = "Hello";
const greet = (name: string): string => {
    return prefix + ", " + name; // prefix captured as Ref<string>
};
console.log(greet("World"));     // "Hello, World"
```

### ⚠️ Limitation: closure is stack-based

```typescript
let greet: (name: string) => string;
{
    let prefix = "Hello";
    greet = (name) => prefix + name;
}   // prefix freed
greet("World");                  // ❌ UB: dangling pointer
```

**How variables are captured:**

| Variable type | How captured | C-representation |
|---------------|--------------|------------------|
| Primitive (`i32`, `bool`) | Copy-by-value | `int32_t x;` |
| `string` | Shallow copy (`String` struct) | `String s;` |
| `Ref<T>` / `Mut<T>` | Copy pointer | `const User *u;` / `User *m;` |
| Array / Object | Copy struct | `Array_i32 arr;` |

## Async and borrow

### ❌ Error: borrow across await

```typescript
async function bad(arr: Ref<i32[]>): Promise<void> {
    const r: Ref<i32> = arr[0];
    await sleep(10);             // ❌ Ref<T> cannot live across await
    console.log(r);
}
```

**Fix:** copy value before await:

```typescript
async function ok(arr: Ref<i32[]>): Promise<void> {
    const val: i32 = arr[0];     // ✅ copy primitive
    await sleep(10);
    console.log(val);
}
```

### Context behavior summary

| Context | Borrow released? | Note |
|---------|-----------------|------|
| End of `{}` scope | ✅ Yes | `_scopeBorrowStack` + `_refBorrowCount` in `pushScope`/`popScope` |
| End of function | ✅ Yes | Cleanup + release |
| End of arrow function | ✅ Yes | Env struct dies on stack |
| Callback after `await` | ❌ Forbidden | `err-ref-across-await` |
| Deferred callback | ❌ Forbidden by design | Closure is stack-based |
| Capture in closure | Copy struct/pointer | Lifetime not tracked (limitation) |

## Error cheat sheet

| Error | Cause | Fix |
|-------|-------|-----|
| `cannot move out of array by index` | `arr[i]` without `Ref<T>` | `Ref<T>` or `.remove()` |
| `cannot mutate while borrow is active` | Mutation during active borrow | Limit scope with `{}` |
| `Cannot borrow a class field` | `Ref<T>` from `obj.field` | Pass object as `Ref<Container>` |
| `Cannot return borrow to array element` | `return arr[i]` as `Ref<T>` | Return owned value |
| `already borrowed as Mut` | Two `Mut<T>` simultaneously | One Mut at a time |
| `Ref<T> cannot live across await` | Borrow across await | Copy before await |

## See also

- [Ref<T>](./ref.md) — immutable borrow
- [Mut<T>](./mut.md) — mutable borrow
- [Borrow checker](./borrow-checker.md) — aliasing and lifetime rules
- [Closures](./closures.md) — capture rules
