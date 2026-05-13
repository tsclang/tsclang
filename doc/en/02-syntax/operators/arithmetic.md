# Arithmetic Operators

[← Up](./index.md) | [Next →](./assignment.md)

---

Operators for numeric calculations and string concatenation.

| Operator | Description | Example |
|----------|-------------|---------|
| `+` | Addition / string concatenation | `a + b` |
| `-` | Subtraction | `a - b` |
| `*` | Multiplication | `a * b` |
| `/` | Division | `a / b` |
| `%` | Remainder | `a % b` |
| `**` | Exponentiation | `a ** b` |
| `++` | Increment (prefix / postfix) | `++a`, `a++` |
| `--` | Decrement (prefix / postfix) | `--a`, `a--` |

---

## Binary Operators

### `+` — Addition and Concatenation

For numeric types — ordinary addition. For `string` — concatenation (creates a new string).

```typescript
const sum: i32 = 10 + 20;          // 30
const message: string = "Hello" + " " + "world";  // "Hello world"

// template strings are preferred for complex concatenation:
const greeting = `Hello, ${name}!`;
```

Mixing types in `+` is a compiler error. Use explicit conversion:

```typescript
const age: i32 = 25;
const msg = "Age: " + age;          // error: cannot add string and i32
const msg = `Age: ${age}`;          // ok — interpolation
const msg = "Age: " + age.toString(); // ok — explicit conversion
```

### `-`, `*`, `/`, `%` — Numeric Operations

Work only with numeric types. The result has the type of the left operand (if the types match — that type).

```typescript
const diff: i32 = 100 - 37;        // 63
const product: f64 = 3.14 * 2.0;   // 6.28
const quotient: i32 = 10 / 3;      // 3 (integer division)
const remainder: i32 = 10 % 3;     // 1
```

### `**` — Exponentiation

Right-associative: `2 ** 3 ** 2` = `2 ** (3 ** 2)` = `2 ** 9` = `512`.

```typescript
const square: i32 = 5 ** 2;        // 25
const cube: f64 = 2.0 ** 3;        // 8.0
const nested: i32 = 2 ** 3 ** 2;   // 512 (right-associative)
```

## Unary Operators

### Unary `+` and `-`

Change the sign or explicitly coerce to a numeric type:

```typescript
const neg: i32 = -42;              // -42
const pos: i32 = +42;              // 42
const negate: i32 = -neg;          // 42
```

### `++` and `--` — Increment and Decrement

Work only with `let` variables. `const` — compiler error.

```typescript
let counter: i32 = 0;

counter++;         // counter = 1 (postfix — returns old value)
++counter;         // counter = 2 (prefix — returns new value)

const x: i32 = counter++;  // x = 2, counter = 3
const y: i32 = ++counter;  // y = 4, counter = 4
```

Postfix and prefix in expressions:

```typescript
let a: i32 = 5;
const b = a++;   // b = 5, a = 6 — postfix returns old value
const c = ++a;   // c = 7, a = 7 — prefix returns new value
```

---

## C Output

```c
// const sum: i32 = 10 + 20;
int32_t sum = 10 + 20;

// const message: string = "Hello" + " " + "world";
// String concatenation → runtime function call:
String message = tsc_string_concat(
    tsc_string_concat(
        tsc_string_from_cstr("Hello"),
        tsc_string_from_cstr(" ")
    ),
    tsc_string_from_cstr("world")
);

// let counter: i32 = 0; counter++;
int32_t counter = 0;
counter++;

// const quotient: i32 = 10 / 3;
int32_t quotient = 10 / 3;
```

---

## Errors

| Error | Cause |
|-------|-------|
| `cannot add string and i32` | Mixing `string` and number in `+` |
| `cannot assign to const variable` | `++` / `--` on `const` |
| `operator ** not defined for string` | Exponentiation for non-numeric types |

## See Also

- [Assignment Operators](./assignment.md) — `+=`, `-=`, `*=`, `/=`, `%=`, `**=`
- [Operator Precedence](./precedence.md) — precedence table
- [Data Types](../../03-types/index.md) — numeric types `i8`..`i64`, `f32`, `f64`
