# Mut\<T\> — Mutable Borrow

[← Up](./index.md) | [Next →](./shared.md) | [Previous ←](./ref.md)

---

`Mut<T>` — **mutable borrow**. Allows reading and modifying data without ownership. Rule: **only one `Mut<T>` at a time** on the same data.

## Declaration in parameters

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}
let nums: i32[] = [1, 2, 3];
fill(nums);
console.log(nums[0]);   // 99 — data was modified
```

A `let` variable is automatically borrowed as `Mut<T>` when passed to a function.

## Reading and writing

`Mut<T>` allows both reading and modifying:

```typescript
class Counter {
    value: i32;
}
function increment(c: Mut<Counter>): void {
    c.value += 1;        // ok — write
}
function read(c: Ref<Counter>): i32 {
    return c.value;      // ok — read
}
let cnt = new Counter();
cnt.value = 0;
increment(cnt);
increment(cnt);
console.log(read(cnt));  // 2
```

`Mut<T>` implicitly converts to `Ref<T>` — data can be passed to a function expecting `Ref<T>`:

```typescript
function read(c: Ref<Counter>): i32 { return c.value; }
let cnt = new Counter();
cnt.value = 5;
console.log(read(cnt));  // 5 — Mut→Ref ok
```

## Only one Mut at a time

The compiler guarantees **aliasing XOR mutability**: two `Mut<T>` on the same data cannot be created:

```typescript
class Box {
    x: i32;
}
let b = new Box();
b.x = 1;
function take(m: Mut<Box>): void { m.x = 2; }
function take2(m: Mut<Box>): void { m.x = 3; }
take(b);
take2(b);     // error: Cannot create two simultaneous mutable borrows of 'b'
```

> The error occurs when the previous `Mut` is still alive (has not gone out of scope). In the example above — if `take` and `take2` are called sequentially at the same point without intermediate use, the error may not occur. It depends on the borrow checker.

## Mut and const are incompatible

A `Mut<T>` cannot be created from a `const` variable:

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}
const nums: i32[] = [1, 2, 3];
fill(nums);   // error: cannot borrow "nums" as mutable: it is a const binding
```

**Solution:** use `let` or pass as `Ref<T>`.

## Mut and Ref are incompatible

A `Mut<T>` cannot be created while a `Ref<T>` is active:

```typescript
class Box { x: i32; }
let b = new Box();
b.x = 1;
function mutate(m: Mut<Box>): void { m.x = 2; }
function read(r: Ref<Box>): i32 { return r.x; }
const r = read(b);
mutate(b);    // error: Cannot create mutable borrow of 'b' while immutable borrow is active
console.log(r);
```

## Push and array modification

```typescript
function push(arr: Mut<i32[]>, val: i32): void {
    arr.push(val);
}
let data = [1, 2, 3];
push(data, 4);
console.log(data);   // [1, 2, 3, 4] — data is alive, modified
```

## C-output

`Mut<T>` compiles to `T*` — pointer without `const`:

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}
let nums: i32[] = [1, 2, 3];
fill(nums);
console.log(nums[0]);
```

```c
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

void fill_mut_Array_i32(Array_i32 *arr) {
    arr->data[0] = 99;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    Array_i32 nums = {.data = _lit_0, .length = 3, .capacity = 3};
    fill_mut_Array_i32(&nums);
    printf("%d\n", nums.data[0]);
    return 0;
}
```

The `_mut_` suffix in the function name indicates mutable borrow. `Ref<T>` = `const T*`, `Mut<T>` = `T*`.

Comparison of `Ref<T>` and `Mut<T>` in C-output:

| TSClang | C |
|---------|---|
| `Ref<T>` | `const T*` |
| `Mut<T>` | `T*` |

## Compiler errors

| Code | Error | Solution |
|-----|--------|---------|
| `fill(const_var)` with `Mut<T>` parameter | `cannot borrow "x" as mutable: it is a const binding` | Use `let` |
| Two `Mut<T>` simultaneously | `Cannot create two simultaneous mutable borrows of 'x'` | Limit borrow scopes |
| `Mut` while `Ref` is active | `Cannot create mutable borrow of 'x' while immutable borrow is active` | Limit `Ref` scope |
| `arr.push(x)` while a borrow is active | `cannot mutate 'arr' while a borrow is active` | Finish the borrow before mutation |

## See also

- [Ref\<T\>](./ref.md) — immutable borrow
- [Shared\<T\>](./shared.md) — shared ownership (ARC)
- [Weak\<T\>](./weak.md) — weak reference for breaking cycles
- [let / const](../02-syntax/variables/index.md) — impact of `let`/`const` on borrow semantics
- [Functions: argument passing](../02-syntax/functions/declaration.md) — rules for passing Ref/Mut/owned
