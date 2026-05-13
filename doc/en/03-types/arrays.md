# Arrays — Dynamic T[] and Fixed T[N]

[← Up](./index.md) | [Next →](./map-set.md) | [Previous ←](./null.md)

---

Two kinds of arrays: dynamic (`T[]`, heap) and fixed (`T[N]`, stack). Maximum JS/TS API coverage with the ownership model in mind.

| Syntax | Type | Memory | Mutable size |
|--------|------|--------|--------------|
| `[1, 2, 3]` / `T[]` | dynamic | heap | yes (push, pop, resize) |
| `T[3]` | fixed | stack | no |

---

## Dynamic arrays

### Creation

```typescript
let a = [1, 2, 3];                // literal, heap
let b: i32[] = [];                // empty dynamic
let d: i32[] = new Array(100);    // capacity=100, length=0
let e = new Array<i32>(100);      // same, without type annotation
```

**Important:** the argument of `new Array(N)` is **capacity**, not length (differs from JS). TSClang has no `undefined`, so there is nothing to fill with. Elements appear via `push()` or `fill()`.

### C-output

```c
typedef struct {
    int32_t *data;
    size_t   length;
    size_t   capacity;
} Array_i32;

// Literal
int32_t _lit_0[] = {1, 2, 3};
Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};

// new Array(100) — capacity=100, length=0
```

### length and capacity (readonly)

```typescript
let arr: i32[] = new Array(100);   // capacity=100, length=0
arr.push(1);
arr.push(2);                       // capacity=100, length=2

arr.length                         // 2 — number of elements
arr.capacity                       // 100 — allocated memory

arr.length = 10;       // error: use arr.resize(10) instead
arr.capacity = 200;    // error: use arr.reallocate(200) instead
```

### Indexing

```typescript
arr[0]    // 1 — O(1)
arr[-1]   // 2 — last element
arr[2]    // runtime error: index 2 out of bounds (length=2)
arr[-3]   // runtime error: index -3 out of bounds (length=2)
```

---

## Mutating methods

### push / pop / remove

```typescript
arr.push(item)     // move item to the end; throws on OOM; returns Self
arr.pop()          // → T | null — owned last element; null if empty
arr.remove(i)      // → T — owned element by index; O(n) shift
```

Ownership on `push` — move:

```typescript
let arr: User[] = [];
let user = new User();
arr.push(user);         // move — arr owns user
// console.log(user);   // error: user was moved
```

`pop` — returns owned value:

```typescript
let last = arr.pop();          // User | null
if (last != null) {
    last.doSomething();        // ok — last owns the object
}
arr.pop()?.doSomething();      // ?. — only if not null
const u = arr.pop() ?? fallback; // ?? — default if null
```

### fill / resize / reallocate

```typescript
arr.fill(value)                    // fill all slots 0..capacity, length = capacity; → Self
arr.fill(value, start, end)        // fill start..end-1 within 0..length; → Self

arr.resize(n)                      // shrink length to n; n > length — error; → Self
arr.resize(n, value)               // change length to n, new slots = value; → Self

arr.reallocate(n)                  // change capacity; n < length → length is truncated; → Self
```

`fill` example:

```typescript
let arr: i32[] = new Array(100);  // capacity=100, length=0
arr.fill(0);                       // capacity=100, length=100, all = 0
arr.fill(5, 0, 10);                // indexes 0..9 = 5, length=100
arr.fill(5, 90, 110);              // error: end=110 > length=100
```

`resize` example:

```typescript
arr.resize(10);        // ok — shrink, value not needed
arr.resize(50);        // error: n > length, use resize(n, value)
arr.resize(200, 0);    // ok — grow, new slots = 0, reallocates if needed
arr.resize(5, 0);      // ok — shrink, value is ignored
```

### sort / reverse / shift / unshift / splice / join / set

```typescript
arr.sort()                              // default (<); → Self
arr.sort((a, b) => a - b)              // with comparator (Ref<T>, Ref<T>) => i32; → Self
arr.reverse()                           // in-place reversal; → Self
arr.shift()                             // → T | null — remove and return first; O(n)
arr.unshift(item)                       // add to beginning; O(n); → Self
arr.splice(start, deleteCount?, ...items)  // → T[] — removed elements
arr.join(", ")                          // → string — join with separator
arr.set(src, offset?)                   // memcpy from src into arr starting at offset
```

### Chaining mutating methods

```typescript
let arr: i32[] = new Array<i32>(100).resize(50, 0).fill(7, 0, 10);
```

---

## Fixed arrays T[N]

Size is known at compile time, memory is on the stack.

```typescript
let c: i32[3] = [1, 2, 3];  // fixed, exactly 3 elements
```

### C-output

```c
int32_t arr[3] = {10, 20, 30};
```

### Limitations

- The literal must contain **exactly N** elements — otherwise a compiler error
- `push` / `pop` / `resize` / `reallocate` — compiler error
- Passed to functions as `Ref<T[]>` / `Mut<T[]>` — fixed is a subtype of dynamic:

```typescript
function sum(arr: Ref<i32[]>): i32 { ... }

let fixed: i32[3] = [1, 2, 3];
let dynamic: i32[] = [1, 2, 3, 4];

sum(fixed);    // ok — automatically as Ref<i32[]>
sum(dynamic);  // ok
```

---

## Functional and search methods

The callback receives `Ref<T>` — a borrow of the element, not ownership. The element stays in the array.

### Transformations (return a new array)

```typescript
const nums: i32[] = [1, 2, 3, 4, 5];

nums.map(x => x * 2)                         // i32[] — [2, 4, 6, 8, 10]
nums.filter(x => x % 2 == 0)                 // i32[] — [2, 4]
nums.reduce((acc, x) => acc + x, 0)          // i32 — 15
nums.reduceRight((acc, x) => acc + x, 0)     // i32 — 15 (right to left)
nums.slice(1, 3)                              // i32[] — [2, 3] (clone)
nums.concat([6, 7])                           // i32[] — [1, 2, 3, 4, 5, 6, 7]
nums.flat()                                   // T[][] → T[] (1 level)
nums.flatMap(x => [x, x * 2])                // map + flat
nums.toSorted()                               // new sorted array
nums.toReversed()                             // new reversed array
nums.toSpliced(1, 2, 10, 20)                 // new array with splice
nums.with(0, 99)                              // new array with replaced element
nums.groupBy(x => x % 2 == 0 ? "even" : "odd") // Map<string, i32[]>
```

### Search

```typescript
nums.find(x => x > 3)             // Ref<i32> | null — borrow of first match
nums.findIndex(x => x > 3)        // i32 — 3, -1 if not found
nums.findLast(x => x > 3)         // Ref<i32> | null — borrow of last match
nums.findLastIndex(x => x > 3)    // i32 — 3, -1 if not found
nums.some(x => x > 4)             // bool — true
nums.every(x => x > 0)            // bool — true
nums.includes(3)                   // bool — true
nums.indexOf(3)                    // i32 — 2, -1 if not found
nums.lastIndexOf(3)                // i32 — 2, -1 if not found
```

### Iteration

```typescript
arr.forEach(x => console.log(x))     // (Ref<T>) => void
arr.keys()                            // Iterator<usize> — indexes
arr.values()                          // Iterator<Ref<T>> — values (borrow)
arr.entries()                         // Iterator<[usize, Ref<T>]> — pairs
```

### Static methods

```typescript
Array.from<T>(src: Iterable<T>): T[]   // create from iterable
Array.of<T>(...items: T[]): T[]        // create from arguments
```

---

## Clone requirement

`filter`, `slice`, `concat`, `flat`, `flatMap`, `toSorted`, `toReversed`, `toSpliced`, `with`, `groupBy` — create a new array by **cloning** elements. Require `T: Clone`.

- Primitives (`i32`, `f64`, `bool`, `u8`...) — auto-implement Clone
- `string` — Clone
- Classes — via explicit `clone()` method
- If `T: Clone` is not satisfied — compiler error

---

## find returns Ref\<T\> (borrow)

The result of `find` is a borrow bound to the source. Cannot outlive the source and cannot be mutated:

```typescript
// ✅ borrow — read-only
const r: Ref<User> | null = users.find(u => u.id == targetId)
if (r != null) console.log(r.name)

// ✅ owned operations — via findIndex + index
const i = users.findIndex(u => u.id == targetId)
if (i >= 0) users[i].activate()   // Mut<User> via index
```

### C-output

```c
typedef struct { bool has_value; int32_t *value; } opt_ref_i32;

opt_ref_i32 found = tsc_array_find_i32(arr, _lambda_0_bool);
printf("%d\n", found.has_value ? *found.value : -1);
```

---

## Slice\<T\> / MutSlice\<T\> — zero-copy view

`Slice<T>` — non-owning borrowed view of a contiguous segment of an array or buffer. Created via `.view()`, does not copy data.

```typescript
let arr: i32[] = [1, 2, 3, 4, 5, 6, 7, 8];

const s: Slice<i32> = arr.view(2, 6)   // elements 2..5, zero-copy
s[0]       // 3
s[1]       // 4
s.length   // 4

s.view(1, 3)   // sub-slice: elements 3..4
```

Mutable slice — `MutSlice<T>` (from `.viewMut()`):

```typescript
const ms: MutSlice<u8> = buf.viewMut(0, 4)
ms[0] = 0xFF   // write into original buffer
```

`Slice<T>` is compatible with `Ref<T[]>` for passing to functions:

```typescript
function sum(data: Ref<i32[]>): i32 { ... }
sum(arr.view(0, 4))   // ✅ Slice<i32> is compatible with Ref<i32[]>
```

### C-output

```c
typedef struct { const int32_t *ptr; size_t length; } Slice_i32;
typedef struct { int32_t *ptr; size_t length; } MutSlice_i32;

// .view(1, 4)
Slice_i32 s = (Slice_i32){ .ptr = arr.data + (1), .length = (size_t)(4) - (1) };
```

---

## Method return rule

| Method type | Returns | Example |
|-------------|---------|---------|
| Mutating without data | `Self` (chaining) | `push`, `fill`, `resize`, `sort`, `reverse` |
| Returning data | `T \| null` or `T` | `pop` → `T \| null`, `remove` → `T` |
| Functional | New `U[]` | `map`, `filter`, `slice`, `concat` |
| Search | `Ref<T> \| null` or `i32` | `find` → borrow, `indexOf` → index |

---

## Errors

| Error | Cause |
|-------|-------|
| `use arr.resize(10) instead` | Attempt to assign `arr.length = n` |
| `use arr.reallocate(200) instead` | Attempt to assign `arr.capacity = n` |
| `T does not implement Clone` | Calling `filter`/`slice`/`concat` on a non-Clone type |
| `cannot move out of array by index` | `arr[i]` for owned type without `.remove()` |
| `fixed array literal must have exactly N elements` | Literal size mismatch with type |
| `index N out of bounds (length=M)` | Runtime error — out of bounds |

---

## See also

- [Null (T | null)](./null.md) — `pop()`, `find()` return `T | null`
- [Map and Set](./map-set.md) — hash tables and sets
- [Memory Model — Slice\<T\>](../05-memory/ownership-types.md) — zero-copy view
- [Memory Model — Owner](../05-memory/owner.md) — move from array
- [Clone](../../spec/03-types.md) — cloning interface
