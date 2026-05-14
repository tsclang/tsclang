# Ref\<T\> — Immutable Borrow

[← Up](./index.md) | [Next →](./mut.md) | [Previous ←](./owner.md)

---

`Ref<T>` — **immutable borrow**. Allows reading data without ownership, without modification, and without moving. The owner remains accessible after the call.

## Declaration in parameters

```typescript
function sum(arr: Ref<i32[]>): i32 {
    let total: i32 = 0;
    for (let i: i32 = 0; i < arr.length; i++) {
        total = total + arr[i];
    }
    return total;
}
const data: i32[] = [1, 2, 3];
console.log(sum(data));    // 6
console.log(data.length);  // 3 — data is alive
```

A `let` variable is automatically borrowed as `Ref<T>` when passed to a function. A `const` variable too — but only as `Ref<T>` (never as `Mut<T>`).

## Borrow from array

`arr[i]` for complex types — only via `Ref<T>`. Move by index is forbidden:

```typescript
const u: Ref<User> = users[0];     // ✅ borrow
const u = users[0];                // ❌ E009: cannot move out of array by index
const u = users.remove(0);         // ✅ move + removal from array
```

> **Note:** borrow on a collection blocks mutation only until the end of the `{}` scope where the borrow variable was created. After the block ends, mutation is allowed again.

## Multiple Ref simultaneously

Multiple immutable borrows are **allowed** — they do not conflict:

```typescript
function len(arr: Ref<i32[]>): i32 {
    return arr.length as i32;
}
const nums: i32[] = [1, 2, 3, 4];
const a = len(nums);   // Ref #1
const b = len(nums);   // Ref #2 — ok
console.log(a + b);    // 8
```

## Reading fields through Ref

```typescript
class User {
    name: string;
}
function getName(u: Ref<User>): string {
    return u.name;       // ok — read-only access
}
let user = new User();
user.name = "Alice";
const n = getName(user);
console.log(n);          // "Alice"
```

## Restrictions

### Cannot move from Ref

A borrow does not grant move rights:

```typescript
class Obj { x: i32; }
function take(r: Ref<Obj>): void {
    const o: Obj = r;    // error: cannot move out of "Ref<T>" borrow
}
```

### Cannot modify

```typescript
function bad(arr: Ref<i32[]>): void {
    arr[0] = 99;         // error: cannot mutate through Ref<T>
}
```

### Cannot borrow object fields

`Ref<T>` from a class field (`obj.field`) — **not supported**. The compiler cannot track field lifetime without annotations:

```typescript
const u: Ref<User> = container.user;  // ❌ error: Cannot borrow a class field
```

**Pattern:** pass the entire object as `Ref<Container>`:

```typescript
function getName(c: Ref<Container>): string {
    return c.user.name;   // ✅ access inside function
}
```

### Cannot return borrow from function

Returning `Ref<T>` on an array element or object field from a function — forbidden (lifetime cannot be expressed without annotations):

```typescript
function first(arr: Ref<User[]>): Ref<User> {
    return arr[0];   // ❌ error: Cannot return borrow to array element
}
```

### Cannot store in class fields

`Ref<T>` is **forbidden** as a class field — the borrower's lifetime cannot outlive the owner:

```typescript
class Container {
    ptr: Ref<i32[]>;     // error: "Ref<T>" cannot be stored in a class field
}
```

**Reason:** the compiler cannot guarantee that the borrower will not outlive the owner if the reference is stored in a field. This would lead to a dangling pointer.

### Cannot mutably borrow while Ref is active

```typescript
let users: User[] = [new User()];
let u: Ref<User> = users[0];
users.push(new User());  // error: cannot mutate 'users' while a borrow is active
```

## Alternatives to Ref\<T\> in fields

If you need a "view" of data inside an object:

1. **Pass `Ref<T>` via method parameters** — auto-borrow makes this convenient
2. **Use `{}` blocks** for fine-grained lifetime control of borrows
3. **Use `Shared<T>`** (desktop only) — shared ownership via ARC
4. **Owned field** — data belongs to the object (owner = object)

## C-output

`Ref<T>` compiles to `const T*` — const pointer:

```typescript
function sum(data: Ref<i32[]>): i32 {
    let total: i32 = 0;
    for (let i: i32 = 0; i < data.length; i++) {
        total = total + data[i];
    }
    return total;
}
const data: i32[] = [1, 2, 3];
console.log(sum(data));
```

```c
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int32_t sum_ref_Array_i32(const Array_i32 *data) {
    int32_t total = 0;
    for (int32_t i = 0; i < data->length; i++) {
        total = total + data->data[i];
    }
    return total;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 data = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%d\n", sum_ref_Array_i32(&data));
    return 0;
}
```

The `_ref_` suffix in the function name indicates immutable borrow. The call passes `&data` (address).

## Compiler errors

| Code | Error | Solution |
|-----|--------|---------|
| `const o: Obj = r` (where `r: Ref<Obj>`) | `cannot move out of "Ref<T>" borrow` | Use `let`, not `const`, for owned |
| `arr[0] = 99` (where `arr: Ref<i32[]>`) | `cannot mutate through Ref<T>` | Use `Mut<T>` |
| `class C { ptr: Ref<i32[]> }` | `"Ref<T>" cannot be stored in a class field` | Owned field or `Shared<T>` |
| `users.push(x)` while `Ref` is active | `cannot mutate 'users' while a borrow is active` | Limit the borrow scope with a `{}` block |
| `return arr[0]` (return type `Ref<T>`) | `Cannot return borrow to array element from function` | Returning borrow on element is impossible |
| `const u: Ref<User> = container.user` | `Cannot borrow a class field` | Pass the object as `Ref<Container>` |

## See also

- [Mut\<T\>](./mut.md) — mutable borrow
- [Shared\<T\>](./shared.md) — shared ownership (ARC)
- [Weak\<T\>](./weak.md) — weak reference for breaking cycles
- [let / const](../02-syntax/variables/index.md) — impact on borrow semantics
- [Functions: argument passing](../02-syntax/functions/declaration.md) — rules for passing Ref/Mut/owned
