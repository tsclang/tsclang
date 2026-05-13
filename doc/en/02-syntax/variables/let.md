# let — Mutable Variables

[← Up](./index.md) | [Next →](./const.md)

---

The `let` keyword declares a **mutable** variable. The value can be reassigned, and for complex types — `mut`-methods can be called and it can be passed as `Mut<T>`.

## Declaration

```typescript
let x: i32 = 10
let name = "Alice"   // type inference: string
let arr: i32[] = []
```

## Reassignment

A `let` variable's value can be changed:

```typescript
let x = 10
x = 20        // ok

let s = "hello"
s = "world"   // ok — old value "hello" is freed (drop)
```

For complex types assigning a new value automatically frees the previous one:

```c
// let s = "hello"; s = "world";
String s = { .data = "hello", .length = 5, .capacity = 0 };
String_drop(&s);   // free old value
s = (String){ .data = "world", .length = 5, .capacity = 0 };
```

## mut-methods

`let` variables allow calling methods declared with the `mut` modifier:

```typescript
class Counter {
    private val: i32 = 0
    mut increment(): void { this.val++ }
    get(): i32 { return this.val }
}

let c = new Counter()
c.increment()    // ok — c is let
c.increment()    // ok

const c2 = new Counter()
c2.increment()   // error: cannot call mut method on const variable
```

## Passing as Mut\<T\>

A `let` variable is automatically borrowed as `Mut<T>` when passed to a function:

```typescript
function push(arr: Mut<i32[]>, val: i32): void {
    arr.push(val)
}

let data = [1, 2, 3]
push(data, 4)        // ok — auto mutable borrow
console.log(data)    // [1, 2, 3, 4] — data is alive after call
```

While an active `Mut<T>` borrow is in effect, the source variable is unavailable:

```typescript
let data = [1, 2, 3]
let r: Mut<i32[]> = data   // active Mut borrow
data.push(4)               // error: data already borrowed as Mut
```

## Move (passing as T)

A `let` variable is passed by value (move) when the parameter has type `T` (owned):

```typescript
function process(data: User[]): void { /* ... */ }

let users = [user1, user2]
process(users)
console.log(users)   // error: users was moved
```

C-output for move:

```c
UserArray users = /* ... */;
UserArray moved = users;   // shallow copy — pointer/descriptor
// users is not freed — ownership transferred
```

## for-of with let

`for (let item of arr)` gives `Mut<T>` for elements, but **only if the source is `let`**:

```typescript
let arr = [obj1, obj2, obj3]

for (let item of arr) {      // item: Mut<Obj>
    item.mutMethod()          // ok — changes affect arr
    item = newObj             // error: cannot assign to loop variable
}

const arr2 = [obj1, obj2]
for (let item of arr2) { }   // error: source is const, use for (const item of arr2)
```

Reassigning the loop variable is **always** forbidden, regardless of `let`/`const`. To replace an element — use an index loop:

```typescript
for (let i = 0; i < arr.length; i++) {
    arr[i] = newObj    // ok
}
```

C-output for `for (let item of arr)`:

```c
// let arr = [obj1, obj2, obj3];
// for (let item of arr) { item.mutMethod(); }
for (usize _i = 0; _i < arr.length; _i++) {
    Obj* item = &arr.data[_i];     // Mut<Obj> — pointer into array
    Obj_mutMethod(item);
}
```

## C-output: variable declaration

```typescript
let x: i32 = 42
let name: string = "Alice"
let user = new User("Bob")
```

```c
int32_t x = 42;
String name = { .data = "Alice", .length = 5, .capacity = 0 };
User* user = User_new(&(String){ .data = "Bob", .length = 3, .capacity = 0 });
```

Owned variables in functions are initialized as `NULL` for safe `goto cleanup`:

```c
void example(void) {
    User* user = NULL;    // declaration — NULL for cleanup safety
    User* data = NULL;

    user = User_new();
    data = get_data();

    // ... body ...

cleanup:
    if (data) User_free(data);
    if (user) User_free(user);
}
```

## See also

- [const](./const.md) — immutable variables and their restrictions
- [Memory model](../../05-memory/index.md) — Ownership, Borrow, Mut\<T\>
- [For-of](../loops/for-of.md) — iteration and loop variable semantics
- [Functions](../functions/declaration.md) — argument passing (Ref, Mut, owned)
