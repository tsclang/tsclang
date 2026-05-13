# match

[← Up](./index.md) | [Previous ←](./switch.md)

---

`match` — a pattern matching expression. Returns a value, checks coverage completeness (exhaustiveness). Compiles to `if-else` for general patterns and to `switch` for enums.

## Syntax

```typescript
const result = match (expression) {
    pattern1 => branch1,
    pattern2 => branch2,
    _         => default_branch,
};
```

Patterns are checked top to bottom, the first match wins. Each branch is an expression (after `=>`), whose value becomes the result of `match`.

## Rules

- **`_`** — wildcard, matches any value. Required if patterns do not cover all possible values.
- **Exhaustiveness**: the compiler checks coverage completeness. For `enum` and `T | null` — all variants must be listed explicitly or covered by `_`. Incomplete match — **compilation error**.
- **Interfaces**: for variables of type `interface` — `_` is always required, because the compiler cannot know all implementations.
- **`|`** — multiple patterns for a single branch (`1 | 2 | 3 => ...`).
- **Range `a..b`** — from `a` to `b` inclusive on both sides (`x >= a && x <= b`).
- **Destructuring** — tuples `[a, b]`, object literals `{ field }`, classes `ClassName { field }`.
- **Move semantics**: destructuring in match is a **move**, not borrow. For borrow — explicitly use `Ref<T>` in the pattern.

## switch and match comparison

| | `switch` | `match` |
|---|---|---|
| Type | statement | expression (returns a value) |
| Coverage completeness | warning | **compilation error** |
| Patterns | equality only | literals, ranges, destructuring, `|` |
| Fallthrough | forbidden | absent (each branch is a separate expression) |
| Compiles to | C `switch` | C `switch` (enum) or `if-else` (general case) |

## Examples

### Literals and wildcard

```typescript
const x: i32 = 5;
const result = match x {
    0 => "zero",
    1..4 => "small",
    _ => "other",
};
console.log(result);
```

C-output:

```c
const int32_t x = 5;
String result;
if (x == 0) { result = STR_LIT("zero"); }
else if (x >= 1 && x <= 4) { result = STR_LIT("small"); }
else { result = STR_LIT("other"); }
printf("%s\n", result.data);
```

Output: `other`

### Ranges

```typescript
const score: i32 = 75;
const grade = match score {
    90..100 => "A",
    70..89  => "B",
    50..69  => "C",
    _       => "F",
};
console.log(grade);
```

C-output:

```c
const int32_t score = 75;
String grade;
if (score >= 90 && score <= 100) { grade = STR_LIT("A"); }
else if (score >= 70 && score <= 89) { grade = STR_LIT("B"); }
else if (score >= 50 && score <= 69) { grade = STR_LIT("C"); }
else { grade = STR_LIT("F"); }
printf("%s\n", grade.data);
```

Output: `B`

### Multiple patterns (`|`)

```typescript
const n: i32 = 2;
const s = match n {
    1 | 2 | 3 => "low",
    _ => "high",
};
console.log(s);
```

C-output:

```c
const int32_t n = 2;
String s;
if (n == 1 || n == 2 || n == 3) { s = STR_LIT("low"); }
else { s = STR_LIT("high"); }
printf("%s\n", s.data);
```

Output: `low`

### Enum — exhaustiveness

For enums the compiler checks that all values are covered. A complete match compiles to C `switch`:

```typescript
enum Dir { North, South, East, West }
const d: Dir = Dir.East;
const s = match d {
    Dir.North => "N",
    Dir.South => "S",
    Dir.East  => "E",
    Dir.West  => "W",
};
console.log(s);
```

C-output:

```c
typedef enum { Dir_North = 0, Dir_South = 1, Dir_East = 2, Dir_West = 3 } Dir;

Dir d = Dir_East;
String s;
switch (d) {
    case Dir_North: s = STR_LIT("N"); break;
    case Dir_South: s = STR_LIT("S"); break;
    case Dir_East:  s = STR_LIT("E"); break;
    case Dir_West:  s = STR_LIT("W"); break;
}
printf("%s\n", s.data);
```

Output: `E`

### Null pattern

```typescript
let x: i32 | null = null;
const msg = match x {
    null => "nothing",
    _ => "value",
};
console.log(msg);
```

C-output — nullable primitive is represented as `struct { bool has_value; T value; }`:

```c
typedef struct { bool has_value; int32_t value; } opt_i32;

opt_i32 x = {false, 0};
String msg;
if (!x.has_value) { msg = STR_LIT("nothing"); }
else { msg = STR_LIT("value"); }
printf("%s\n", msg.data);
```

Output: `nothing`

### Tuple destructuring

```typescript
const pair: [i32, string] = [1, "one"];
const desc = match(pair) {
    [1, _] => "starts with one",
    [2, _] => "starts with two",
    _      => "other",
};
console.log(desc);
```

C-output:

```c
typedef struct { int32_t _0; String _1; } tuple_i32_string;

const tuple_i32_string pair = {._0 = 1, ._1 = STR_LIT("one")};
String desc;
if (pair._0 == 1) { desc = STR_LIT("starts with one"); }
else if (pair._0 == 2) { desc = STR_LIT("starts with two"); }
else { desc = STR_LIT("other"); }
printf("%s\n", desc.data);
```

Output: `starts with one`

### Object destructuring (type literal)

```typescript
type Shape = { kind: i32; a: f64; b: f64 }

const shape: Shape = { kind: 1, a: 5.0, b: 0.0 };

const area = match(shape) {
    { kind: 1, a, b } => 3.14 * a * a,
    { kind: 2, a, b } => a * b,
    _ => 0.0,
};
console.log(area);
```

C-output — fields are extracted into local variables (move):

```c
typedef struct { int32_t kind; double a; double b; } Shape;

const Shape shape = { .kind = 1, .a = 5.0, .b = 0.0 };
double area;
if (shape.kind == 1) {
    double a = shape.a;
    double b = shape.b;
    area = 3.14 * a * a;
}
else if (shape.kind == 2) {
    double a = shape.a;
    double b = shape.b;
    area = a * b;
}
else { area = 0.0; }
printf("%g\n", area);
```

Output: `78.5`

### Class destructuring (interface matching)

When matching on an interface variable, the compiler checks the vtable to determine the concrete class:

```typescript
interface Shape { area(): f64 }

class Circle implements Shape {
    r: f64;
    area(): f64 { return 3.14 * this.r * this.r; }
}
class Rect implements Shape {
    w: f64;
    h: f64;
    area(): f64 { return this.w * this.h; }
}

let c = new Circle();
c.r = 5.0;
let shape: Shape = c;

const a = match(shape) {
    Circle { r } => 3.14 * r * r,
    Rect { w, h } => w * h,
    _ => 0.0,
};
console.log(a);
```

C-output — matching via vtable, type casting and field extraction:

```c
Shape shape = {.self = &c, .vtable = &Circle_Shape_vtable};
double a;
if (shape.vtable == &Circle_Shape_vtable) {
    double r = ((Circle*)shape.self)->r;
    a = 3.14 * r * r;
}
else if (shape.vtable == &Rect_Shape_vtable) {
    double w = ((Rect*)shape.self)->w;
    double h = ((Rect*)shape.self)->h;
    a = w * h;
}
else { a = 0.0; }
printf("%g\n", a);
```

Output: `78.5`

> **Important:** for interfaces `_` is required — the compiler cannot guarantee that all implementations are listed.

## Errors

### Incomplete match on enum

```typescript
enum Dir { North, South, East, West }
const d: Dir = Dir.North;
const s = match(d) {
    Dir.North => "N",
    Dir.South => "S",
};
```

```
TypeError: Non-exhaustive match on enum 'Dir': missing cases 'East', 'West'
```

For enums all values must be covered either explicitly or via `_`.

### Incomplete match without `_`

If the type is finite (enum, `T | null`) and `_` is absent, but not all cases are listed — error. For unbounded types (numbers, strings, interfaces) `_` is always required.

## See also

- [switch](./switch.md) — value selection statement
- [Enum](../../03-types/enum.md) — enumerations and exhaustiveness
- [Memory model](../../05-memory/index.md) — move semantics, borrow, `Ref<T>`
- [Nullable types](../truthy-falsy.md) — `T | null`, optional chaining, `??`
