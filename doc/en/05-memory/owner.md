# Owner (T) — Full Ownership

[← Up](./index.md) | [Next →](./ref.md) | [Previous ←](./ownership-types.md)

---

Type `T` (without `Ref`/`Mut`/`Shared`/`Weak` annotation) — the **owner** of a value. The owner is responsible for freeing memory. When a value is transferred, a **move** occurs — the source becomes unavailable.

## Move on assignment

```typescript
class Node {
    value: i32;
}

let a = new Node();
a.value = 42;
let b = a;          // MOVE: a is now invalid
// console.log(a);  // error: use of moved value: "a"
console.log(b.value);   // ok — b is now the owner
```

### C-output

```c
typedef struct { int32_t value; } Node;

int main(void) {
    Node a = {0};
    a.value = 42;
    Node b = a;          // shallow copy — bits transferred
    a = (Node){0};       // source zeroed, _free is not called
    printf("%d\n", b.value);
    return 0;
}
```

Key point: **`_free` is not called for `a`** — ownership was transferred to `b`. Deallocation happens only once, when `b` goes out of scope.

## Move when passing to a function

```typescript
class Buffer {
    data: string;
}

function consume(buf: Buffer): void {
    console.log(buf.data);
}

let b = new Buffer();
b.data = "hello";
consume(b);
// console.log(b);   // error: b was moved
```

### C-output

```c
typedef struct { String data; } Buffer;

void consume_Buffer(Buffer buf) {
    printf("%s\n", buf.data.data);
}

int main(void) {
    Buffer b = {0};
    b.data = STR_LIT("hello");
    consume_Buffer(b);     // b passed by value — move
    // b is not freed — ownership is inside consume_Buffer
    return 0;
}
```

The function accepts `Buffer` by value — the caller loses ownership.

## Moving an object field

```typescript
class Owner {
    name: string;
}

let o = new Owner();
o.name = "Alice";
let n = o.name;          // move field: string from o.name
console.log(n);           // ok
// console.log(o.name);  // error: use of moved value: 'o.name'
```

### C-output

```c
typedef struct { String name; } Owner;

int main(void) {
    Owner o = {0};
    o.name = STR_LIT("Alice");
    String n = o.name;        // move — bits transferred to n
    printf("%s\n", n.data);
    return 0;
}
```

## Move from array

`arr[i]` for an owned type is a **move**. Direct extraction by index is forbidden — use `.remove()`:

```typescript
let users = [user1, user2, user3];
let u = users[0];        // error: cannot move out of array by index
let u = users.remove(0); // ok — move with removal from array
```

## Primitives — always copy

Primitive types (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) are **always copied**, move does not apply:

```typescript
let x: i32 = 42;
let y = x;           // copy, not move
console.log(x);      // ok — x is alive
console.log(y);      // ok
```

## Move vs Clone

When you need a copy of a complex type instead of a move — use `clone()`:

```typescript
let original = new User();
original.name = "Alice";
let copy = original.clone();     // independent copy
console.log(original.name);      // ok — original is alive
console.log(copy.name);          // ok — copy is alive
```

`clone()` requires that the type implements `Clone`:

```typescript
class User implements Clone {
    name: string;
    clone(): User {
        const c = new User();
        c.name = this.name.clone();
        return c;
    }
}
```

## C-output: cleanup with multiple owned

All owned variables in a function are initialized to `NULL` for safe `goto cleanup`:

```c
void example(void) {
    User* user = NULL;     // NULL — for safe cleanup
    Buffer* buf = NULL;

    user = User_new();
    buf = Buffer_new();

    // ... work ...

cleanup:
    if (buf) Buffer_free(buf);
    if (user) User_free(user);
}
```

## Errors

| Error | Cause |
|--------|---------|
| `use of moved value: "x"` | Accessing a variable after move |
| `cannot move out of array by index` | `arr[i]` for an owned type without `.remove()` |
| `cannot move out of "const" binding` | Move from a `const` variable |
| `cannot move out of "Ref<T>" borrow` | Move from a borrow |

## See also

- [Ownership Types — Overview](./ownership-types.md) — all ownership types and C representations
- [Ref\<T\>](./ref.md) — immutable borrow (not move)
- [Mut\<T\>](./mut.md) — mutable borrow (not move)
- [Drop and cleanup](./drop.md) — automatic deallocation and `goto cleanup`
- [Destructuring](./destructuring.md) — borrow vs move when extracting fields
- [let / const](../02-syntax/variables/index.md) — impact of mutability on move
