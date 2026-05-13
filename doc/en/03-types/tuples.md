# Tuples — Fixed Tuples

[← Up](./index.md) | [Next →](./clone.md) | [Previous ←](./map-set.md)

---

Tuple — a fixed tuple with a compile-time known number of elements and type of each element. Unlike an array, elements can have **different types**.

## Basic syntax

```typescript
let pair: [i32, string] = [1, "hello"]
let triple: [i32, string, f64] = [1, "hello", 3.14]

pair[0]  // 1 — i32
pair[1]  // "hello" — string
```

### C-output

Tuple compiles to a struct with fields `_0`, `_1`, `_2`, etc.:

```c
typedef struct {
    int32_t _0;
    String  _1;
} tuple_i32_string;

tuple_i32_string pair = {
    ._0 = 1,
    ._1 = (String){ .data = "hello", .length = 5, .capacity = 0 }
};
```

## Destructuring

```typescript
let pair: [i32, string] = [1, "hello"]

const [a, b] = pair       // a: i32 = 1, b: string = "hello"
// pair is invalid — move

let triple: [i32, string, f64] = [1, "hello", 3.14]
const [x, , z] = triple   // x: i32 = 1, z: f64 = 3.14 (skip element)
```

### C-output

```c
// const [a, b] = pair
int32_t a = pair._0;
String  b = pair._1;
// pair is zeroed — move
```

## Labeled Tuples

Labels give names to elements and allow dot-access alongside index access:

```typescript
type Point = [x: f64, y: f64]

let p: Point = [1.0, 2.0]
p[0]  // ok — 1.0
p.x   // ok — sugar over p[0], compiles to p._0
```

`p.x` and `p[0]` generate the same C code:

```c
typedef struct { double x; double y; } Point;
Point p = { .x = 1.0, .y = 2.0 };
p._0;  // 1.0
p.x;   // 1.0 — the same
```

> **Note:** Labels must be on all elements or none. `[x: f64, f64]` — compiler error.

## Readonly Tuples

```typescript
let t: readonly [i32, string] = [1, "hello"]
t[0] = 5  // error: cannot assign to readonly tuple element
```

```c
typedef struct {
    const int32_t _0;
    const String  _1;
} readonly_tuple_i32_string;
```

## Optional Elements

Optional elements (`?`) are allowed **only at the end**:

```typescript
type Config = [string, i32?]

let a: Config = ["localhost"]         // ok — i32 is missing
let b: Config = ["localhost", 8080]   // ok

a[1]  // i32 | null
```

```typescript
type Good = [i32, string?, f64?]  // ok
type Bad  = [i32?, string, f64]   // error: optional element must be at end
```

```c
typedef struct {
    String  _0;
    opt_i32 _1;  // bool has_value + int32_t value
} tuple_string_opt_i32;
```

## Rest Elements

`...T[]` — arbitrary number of elements at the end. One rest, only at the end, incompatible with optional.

```typescript
type Strings = [string, ...string[]]

let a: Strings = ["first"]
let b: Strings = ["first", "second", "third"]
```

```c
typedef struct {
    String  _0;
    String* tail;
    usize   tail_len;
} tuple_string_rest_string;
```

Rest part requires heap. On embedded — same rules as `Array`.

## Spread in tuple literals

```typescript
// Copy tuple
const p: [f64, f64, f64] = [1.0, 2.0, 3.0]
const copy: [f64, f64, f64] = [...p]

// Spread of fixed tuple — size is known statically
const pair: [f64, f64] = [1.0, 2.0]
const triple: [f64, f64, f64] = [...pair, 3.0]  // ok
```

Spread from runtime array into rest-tuple is allowed:

```typescript
function wrap(items: string[]): [i32, ...string[]] {
    return [0, ...items]  // ok — items.length becomes tail_len
}
```

Spread from runtime array into fixed tuple — compiler error:

```typescript
let t: [i32, string, string] = [1, ...runtimeArray]
// error: cannot spread runtime-length array into fixed tuple
```

## Ownership

### Move on destructuring

```typescript
let t: [User, string] = [new User(), "test"]

// Move — tuple is consumed
const [user, name] = t  // user: User, name: string; t is invalid
```

### Borrow via Ref

```typescript
function process(t: Ref<[User, string]>): void {
    // user: Ref<User>, name: Ref<string> — borrow, not move
}
```

## Tuple vs Array

| Property | Tuple `[A, B]` | Array `A[]` |
|----------|----------------|-------------|
| Size | Fixed at compile time | Dynamic |
| Element types | Different | Same |
| C-output | Struct (`_0`, `_1`) | Dynamic array struct (`data + length + capacity`) |
| `.length` | Compile-time constant | Runtime value |
| `push` / `pop` | Not available | Available |
| Indexing | By numeric literal | By runtime index |
| Embedded | Always available | Requires heap (except `T[N]`) |

## Errors

| Code | Error | Solution |
|------|-------|----------|
| `[x: f64, f64]` | `all or none elements must be labeled` | Either all with labels, or none |
| `[i32?, string]` | `optional element must be at end` | Move optional to the end |
| `[1, ...arr]` (fixed) | `cannot spread runtime-length array into fixed tuple` | Use rest-tuple: `[i32, ...i32[]]` |
| `t[0] = 5` (readonly) | `cannot assign to readonly tuple element` | Remove `readonly` from the type |
| `p.length` | `conflict with built-in property 'length'` | Rename label |

## See also

- [Clone](./clone.md) — deep copying of tuples
- [Type Aliases](./type-aliases.md) — `type Point = [x: f64, y: f64]`
- [Destructuring](../05-memory/auto-drop.md) — borrow vs move on destructuring
- [Arrays](./index.md) — dynamic and fixed arrays
