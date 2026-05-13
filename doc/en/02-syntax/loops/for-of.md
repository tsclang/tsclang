# for-of loop

[← Up](./index.md) | [Next →](./while.md) | [Previous ←](./for.md)

---

The `for-of` loop iterates over elements of a collection: arrays, strings, Map, Set, and user-defined `Iterable<T>`. The loop variable type is determined by its declaration (`const`/`let`), not by the source.

## Syntax

```typescript
for (const item of iterable) { /* ... */ }
for (let item of iterable) { /* ... */ }
```

## Basic example: array of primitives

```typescript
const arr: i32[] = [1, 2, 3];
for (const item of arr) {
    console.log(item);
}
```

### C-output

```c
int32_t _lit_0[] = {1, 2, 3};
const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
for (size_t _i_0 = 0; _i_0 < arr.length; _i_0++) {
    const int32_t item = arr.data[_i_0];
    printf("%d\n", item);
}
```

`for-of` over an array compiles to an index loop `for (size_t _i = 0; _i < arr.length; _i++)`.

## let / const and ownership

Loop variable behavior depends on `const`/`let` and element types:

| Declaration | Primitives | Complex types |
|-------------|------------|---------------|
| `for (const item of ...)` | Copy | `Ref<T>` (read-only) |
| `for (let item of ...)` | Copy (mutable) | `Mut<T>`, only if source is `let` |

### const — Ref for complex types

```typescript
const arr = [obj1, obj2, obj3];
for (const item of arr) {    // ok — item: Ref<Obj>
    item.doSomething();       // ok — read-only method
    item.mutMethod();         // error — item is Ref, cannot call mut methods
}
```

A `const` variable yields `Ref<T>`: you can read, but cannot call `mut` methods or pass as `Mut<T>`.

### let — Mut for complex types (only if source is let)

```typescript
let arr = [obj1, obj2, obj3];
for (let item of arr) {      // ok — item: Mut<Obj>
    item.mutMethod();         // ok — changes affect arr[i]
    arr.push(obj4);           // error — arr is borrowed during iteration
}
```

A `let` variable yields `Mut<T>`, but **only if the source is also `let`**. Iteration borrows the array for the duration of the loop — modifying the array inside the body is prohibited.

### let from const — error

```typescript
const arr = [obj1, obj2, obj3];
for (let item of arr) { }    // error: cannot create Mut<T> from const source
```

You cannot obtain `Mut<T>` from a `const` source — that would violate the immutability guarantee.

### Primitives are always copied

For primitive types (`i32`, `f64`, `bool`, …) `const`/`let` only affects whether the loop variable can be reassigned, not ownership:

```typescript
let arr: i32[] = [10, 20, 30];
for (let item of arr) {
    item = item + 1;       // ok — item is a mutable copy
    console.log(item);
}
```

### C-output (primitives)

```c
Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
for (size_t _i_0 = 0; _i_0 < arr.length; _i_0++) {
    int32_t item = arr.data[_i_0];
    item = item + 1;
    printf("%d\n", item);
}
```

## Reassigning the loop variable

Reassigning `item` in `for-of` for complex types is always an error (the loop variable is a reference to the array element):

```typescript
for (const item of arr) {
    item = otherObj;    // error: cannot reassign for-of variable
}
```

For primitives, `let` allows reassigning the local copy (does not affect the array).

## Iterating over a string

`for-of` over a string iterates over **bytes** (char). For code points and graphemes, use `.codePoints()` and `.graphemes()`.

```typescript
const s: string = "hello";
for (const ch of s) {
    console.log(ch);
}
```

### C-output

```c
const String s = STR_LIT("hello");
for (size_t _i_0 = 0; _i_0 < s.length; _i_0++) {
    const char ch = s.data[_i_0];
    printf("%c\n", ch);
}
```

## Destructuring: Map.entries()

```typescript
let m = new Map<string, i32>();
m.set("x", 10);
m.set("y", 20);
for (const [k, v] of m.entries()) {
    console.log(k);
    console.log(v);
}
```

### C-output

```c
Array_MapEntry_string_i32 _entries_0 = tsc_map_entries_string_i32(&m);
for (size_t _i_0 = 0; _i_0 < _entries_0.length; _i_0++) {
    const String k = _entries_0.data[_i_0].key;
    const int32_t v = _entries_0.data[_i_0].value;
    printf("%s\n", k.data);
    printf("%d\n", v);
}
```

The compiler creates a `MapEntry<K, V>` structure and expands the `.key` / `.value` fields into separate variables.

## Iterating over Set

```typescript
let s = new Set<i32>();
s.add(10);
s.add(20);
for (const v of s) {
    console.log(v);
}
```

### C-output

```c
for (size_t _i_0 = 0; _i_0 < s.size; _i_0++) {
    const int32_t v = s._vals[_i_0];
    printf("%d\n", v);
}
```

## for await (generators)

Asynchronous iteration over generators using `for await`:

```typescript
function* nums(): Generator<i32> {
    yield 10;
    yield 20;
    yield 30;
}

async function main(): void {
    for await (const n of nums()) {
        console.log(n);
    }
}
```

Compiles to a state machine: calling `_next()` on each iteration with a `.done` check.

## Iterable\<T\> — user-defined iterators

Classes implementing `Iterable<T>` via a decorator compile to an iterator structure with `_iter()` / `_iter_next()` functions:

```typescript
// for-of over Iterable<T> compiles to:
// IterStruct iter = ClassName_iter(&obj);
// while ((elem = ClassName_iter_next(&iter)).has_value) { ... }
```

## Errors

| Error | Cause |
|-------|-------|
| `'for-in' loops are not supported` | `for-in` used instead of `for-of` |
| `cannot create Mut from const source` | `for (let item of constArr)` for complex types |
| `arr is borrowed during iteration` | Attempt to modify the array inside `for-of` |
| `cannot reassign for-of variable` | Reassigning the loop variable of a complex type |

## See also

- [for](./for.md) — classic loop
- [while](./while.md) — condition-based loops
- [break / continue](./break-continue.md) — iteration control
- [Variables](../variables/index.md) — `let`/`const` and ownership
- [Map / Set](../../03-types/maps-sets.md) — collections
- [Async](../../07-async/index.md) — `for await` and generators
