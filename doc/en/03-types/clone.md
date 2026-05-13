# Clone — Deep Copy

[← Up](./index.md) | [Next →](./type-aliases.md) | [Previous ←](./tuples.md)

---

`Clone` — interface for explicit deep copying of owned values. TSClang does not automatically copy complex types — an explicit `clone()` or `structuredClone()` call is required.

## Clone Interface

```typescript
interface Clone {
    clone(): this;
}
```

A type implements `Clone` explicitly via `implements`:

```typescript
class User implements Clone {
    name: string;
    age: i32;

    clone(): User {
        return new User(this.name, this.age);
    }
}
```

## Usage

Two syntaxes, same semantics:

```typescript
let u1 = new User("Alice", 30);

// Method — OOP style
let u2 = u1.clone();

// Function — functional style
let u3 = structuredClone(u1);

console.log(u1.name);  // ok — u1 is alive
console.log(u2.name);  // ok — u2 is an independent copy
console.log(u3.name);  // ok — u3 is an independent copy
```

### C-output

```c
User* User_clone(const User* self) {
    User* copy = User_new();
    copy->name = String_clone(self->name);
    copy->age = self->age;
    return copy;
}

// u2 = u1.clone()
User* u2 = User_clone(u1);

// u3 = structuredClone(u1) — generates the same call
User* u3 = User_clone(u1);
```

## Auto-implementation for primitives and string

Primitives (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) and `string` automatically implement `Clone` — calling `implements Clone` is not needed:

```typescript
let s: string = "hello";
let s2 = s.clone();    // ok — string auto-implements Clone

let x: i32 = 42;
let y = x.clone();     // ok — primitive auto-implements Clone (returns a copy)
```

> **Note:** for primitives `clone()` is simply value copying (they already have copy semantics). For `string` — heap allocation of a new buffer and `memcpy`.

## Arrays

`clone()` on an array works if the elements implement `Clone`:

```typescript
// Primitives — auto-Clone
let arr = [1, 2, 3];
let arr2 = arr.clone();           // ok — i32 auto-Clone

// User type with Clone
let users = [user1, user2];
let users2 = users.clone();       // ok — User implements Clone

// Without Clone — error
let items = [item1, item2];
let items2 = items.clone();
// error: Item does not implement Clone
// hint: implement Clone on Item
```

### C-output

```c
// arr.clone() — array of primitives
Array_i32 arr2 = Array_i32_clone(&arr);
// → malloc + memcpy

// users.clone() — array of objects with Clone
Array_User users2 = Array_User_clone(&users);
// → malloc + clone of each element
```

## Shared\<T\>

`structuredClone` on `Shared<T>` creates a **full independent deep copy** — not a retain:

```typescript
let arc: Shared<Node> = new Node();
arc.value = 42;

let deep = structuredClone(arc);  // new object, refcount = 1
// arc.refcount stays 1, deep.refcount = 1
// this is not retain — this is a true deep copy
```

`clone()` on `Shared<T>` performs a retain (as usual):

```typescript
let arc2 = arc.clone();  // retain — refcount = 2
```

| Method | Behavior | refcount |
|--------|----------|----------|
| `arc.clone()` | Retain (ARC) | +1 |
| `structuredClone(arc)` | Deep copy (new object) | new object = 1 |

## Errors

| Code | Error | Solution |
|------|-------|----------|
| `items.clone()` without `Clone` on `Item` | `Item does not implement Clone` | Add `implements Clone` and a `clone()` method |
| `structuredClone(x)` where `x: Ref<T>` | `cannot clone borrowed value` | Own the value (`let x = ...`) or obtain owned first |
| `obj.clone()` on a class without `Clone` | `Class 'Foo' does not implement Clone` | Implement the `Clone` interface |

## See also

- [Owner (T)](../05-memory/owner.md) — move vs clone
- [Shared\<T\>](../05-memory/shared.md) — ARC and deep copy via structuredClone
- [Arrays](./index.md) — clone on arrays
- [Type Aliases](./type-aliases.md) — `type` with structural Clone
