# switch

[← Up](./index.md) | [Next →](./syntax.md)

---

The `switch` statement — value-based branching. Similar to JavaScript/TypeScript, but with a key difference: **implicit fallthrough is forbidden** — missing `break` or `return` in a non-empty `case` causes a compilation error.

## Syntax

```typescript
switch (expression) {
    case value1:
        // body
        break;
    case value2:
        // body
        break;
    default:
        // body
}
```

## Rules

- **`break` or `return` is required** in every non-empty `case` block.
- **Grouping empty cases** is allowed — several `case` labels in a row before a shared body.
- **`default`** is optional.
- The compiler **warns** if a switch on an enum does not cover all values.
- Works with types: **numeric** (`i8`..`i64`, `u8`..`u64`), **string**, **boolean**, **enum**.
- **Float is forbidden** — `switch` on `f32`/`f64` causes a compilation error.

## Examples

### Basic switch

```typescript
let x: i32 = 2;
switch (x) {
    case 1:
        console.log("one");
        break;
    case 2:
        console.log("two");
        break;
    case 3:
        console.log("three");
        break;
    default:
        console.log("other");
}
```

C-output:

```c
int32_t x = 2;
switch (x) {
    case 1:
        printf("one\n");
        break;
    case 2:
        printf("two\n");
        break;
    case 3:
        printf("three\n");
        break;
    default:
        printf("other\n");
}
```

Output: `two`

### Case grouping

Empty `case` labels without a body are grouped — this is the only allowed form of fallthrough:

```typescript
let x: i32 = 1;
switch (x) {
    case 1:
    case 2:
        console.log("one-or-two");
        break;
    default:
        console.log("other");
}
```

C-output:

```c
switch (x) {
    case 1:
    case 2:
        printf("one-or-two\n");
        break;
    default:
        printf("other\n");
}
```

Output: `one-or-two`

### Switch on enum

```typescript
enum Dir { North, South }
const d: Dir = Dir.South;
switch (d) {
    case Dir.North:
        console.log("N");
        break;
    case Dir.South:
        console.log("S");
        break;
}
```

C-output:

```c
typedef enum { Dir_North = 0, Dir_South = 1 } Dir;

Dir d = Dir_South;
switch (d) {
    case Dir_North:
        printf("N\n");
        break;
    case Dir_South:
        printf("S\n");
        break;
}
```

Output: `S`

If the enum is fully covered — no warning. If not all values are listed — the compiler emits a **warning**.

### Switch on string literal union

```typescript
type Dir = "north" | "south";
const d: Dir = "south";
switch (d) {
    case "north":
        console.log("N");
        break;
    case "south":
        console.log("S");
        break;
}
```

C-output — string literal union compiles to a C enum, switch on it is efficient:

```c
typedef enum { Dir_north, Dir_south } Dir;

const Dir d = Dir_south;
switch (d) {
    case Dir_north:
        printf("N\n");
        break;
    case Dir_south:
        printf("S\n");
        break;
}
```

### Switch without default

If `default` is absent and no `case` matches — execution continues after the switch:

```typescript
let x: i32 = 99;
switch (x) {
    case 1:
        console.log("one");
        break;
}
// x == 99 — nothing will be printed
```

## Errors

### Implicit fallthrough

```typescript
let x: i32 = 1;
switch (x) {
    case 1:
        console.log("one");
        // error: no break
    case 2:
        console.log("two");
        break;
}
```

```
implicit fallthrough
input.tsc:4
```

### Switch on float

```typescript
let x: f64 = 1.0;
switch (x) {
    case 1.0:
        console.log("one");
        break;
}
```

```
cannot switch on type 'f64'
input.tsc:2
```

## See also

- [match](./syntax.md) — expression with pattern matching and exhaustiveness check
- [Enum](../../03-types/enum.md) — enumerations
- [break / continue](../loops/break-continue.md) — flow control in loops and switch
