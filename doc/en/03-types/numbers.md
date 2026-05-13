# Numeric Types

[← Up](./index.md) | [Next →](./strings.md)

---

TSClang provides a full set of integer and floating-point types with fine-grained control over size and sign.

## All Numeric Types

| Type | Size | Range | C type |
|-----|--------|----------|-------|
| `i8` | 1 byte | -128 … 127 | `int8_t` |
| `i16` | 2 bytes | -32 768 … 32 767 | `int16_t` |
| `i32` | 4 bytes | -2 147 483 648 … 2 147 483 647 | `int32_t` |
| `i64` | 8 bytes | -9 223 372 036 854 775 808 … 9 223 372 036 854 775 807 | `int64_t` |
| `u8` | 1 byte | 0 … 255 | `uint8_t` |
| `u16` | 2 bytes | 0 … 65 535 | `uint16_t` |
| `u32` | 4 bytes | 0 … 4 294 967 295 | `uint32_t` |
| `u64` | 8 bytes | 0 … 18 446 744 073 709 551 615 | `uint64_t` |
| `f32` | 4 bytes | IEEE 754 single, ~7 significant digits | `float` |
| `f64` | 8 bytes | IEEE 754 double, ~15 significant digits | `double` |
| `usize` | platform-dependent | `size_t` — see [usize](#usize) | `size_t` |

All numbers are **primitives**, passed by value. Borrow checker does not apply to them.

## Numeric Literals

Four formats for integer literals:

| Format | Prefix | Example | Value |
|--------|---------|--------|----------|
| Decimal | — | `255` | 255 |
| Hexadecimal | `0x` | `0xFF` | 255 |
| Binary | `0b` | `0b1010` | 10 |
| Octal | `0o` | `0o77` | 63 |

```typescript
const a: i32 = 0xFF        // hex → 255
const b: i32 = 0b1010      // binary → 10
const c: i32 = 0o77        // octal → 63
const d: i32 = 255         // decimal
```

For readability, `_` separators are allowed:

```typescript
const mask: u32 = 0xFF_FF_FF_FF
const flags: u16 = 0b1010_0101
const big: i64 = 1_000_000
```

## Autocast: Mechanism 1 — Type-Level Widening

Works for **any** variables (`let` and `const`). Unconditionally safe, based solely on types:

| From | To | Why safe |
|--------|------|------------------|
| `i8` → `i16` → `i32` → `i64` | each step accommodates the previous | same-sign widening |
| `u8` → `u16` → `u32` → `u64` | each step accommodates the previous | same-sign widening |
| `u8` → `i16` | all 256 u8 values < 32 768 | cross-sign |
| `u16` → `i32` | all 65 536 values < 2 147 483 647 | cross-sign |
| `u32` → `i64` | all 4.3G values < 9.2 quintillion | cross-sign |
| `i32` → `f64` | f64 mantissa 53 bit > i32 (32 bit) | integer → float |
| `u32` → `f64` | f64 mantissa 53 bit > u32 (32 bit) | integer → float |
| `f32` → `f64` | double > single | float widening |

**Reverse direction is unavailable** through mechanism 1: `u64 → i64`, `i → u`, `f64 → i32` — may not fit.

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 → i64 widening
```

## Autocast: Mechanism 2 — Compile-Time Value Analysis (const only)

When both operands are `const` with known literal values and mechanism 1 does not apply. Algorithm:

1. Among the **declared types** of both operands, find the smallest one that accommodates **both values**
2. If step 1 yields no result — try the **largest** of the declared types
3. If step 2 also yields no result — compiler error
4. Perform the operation in the found type
5. Check whether the result fits in the target type — if not, error

```typescript
// Step 1: i32 fits both -1 and 2 → pick i32
const a: i32 = -1
const b: u32 = 2
const c: f64 = a + b   // ok → (a + (b as i32)) as f64

// Step 1: u32 fits both 1 and 2 → pick u32
const a: i64 = 1
const b: u32 = 2
const c: f64 = a + b   // ok → (a as u32 + b) as f64

// Error: i32 doesn't fit 3G, u32 doesn't fit -1
const a: i32 = -1
const b: u32 = 3_000_000_000
const c: f64 = a + b
// error: no common type for i32(-1) and u32(3_000_000_000)
// hint: use explicit casts, e.g. (a as i64 + b as i64) as f64

// Error at step 5: sum 5G > u32 max
const a: i64 = 3_000_000_000
const b: u32 = 2_000_000_000
const c: u32 = a + b
// error: result 5_000_000_000 does not fit in u32
```

## Autocast: Mechanism 3 — Explicit `as` (for let)

If `let` variables participate in an operation, and mechanism 1 does not apply — an explicit cast is required:

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // error — i64 + u32: no widening
let c: f64 = (a + (b as i64)) as f64  // ok
```

Widening **with precision loss** — always requires explicit `as` (regardless of `const`/`let`):
- `i32` → `f32`, `i64` → `f32`, `i64` → `f64`, `u64` → `f64`

Narrowing (`f64` → `i32` etc.) — always requires `as`.

## The `as` Operator

Explicit type cast. Three cases:

### 1. Numeric Cast — C Cast

```typescript
3.14 as i32       // → 3 (truncation toward zero)
1000 as i8        // → -24 (two's complement, low 8 bits)
300 as u8         // → 44 (300 & 0xFF)
-1 as u32         // → 4294967295 (0xFFFFFFFF)
```

Semantics: **bit-truncation** to the target type size, two's complement for signed. C equivalent: `(int8_t)1000`, `(uint8_t)300`. Behavior is identical on all platforms.

### 2. Non-Null Assertion

```typescript
let x: i32 | null = getValue()
let y = x as i32  // runtime panic if x == null
```

Better to use `if (x != null)` for safety.

### 3. Any-Cast

```typescript
let val: any = getFromC()
let s = val as string
```

### `as` Does NOT Work For

- Ownership types: `user as Ref<User>` — compiler error
- String conversions: `42 as string` — error, use `.toString()`

## `usize` — Platform Size Type

`usize` is an unsigned integer whose size matches the platform word size. Translates to `size_t` in C.

| Platform | Size | C type |
|-----------|--------|-------|
| 64-bit (desktop/server) | 64 bits | `uint64_t` / `size_t` |
| 32-bit (Cortex-M, ESP) | 32 bits | `uint32_t` / `size_t` |
| 16-bit (AVR ATmega) | 16 bits | `uint16_t` / `size_t` |

Used for buffer sizes (`buf.length`), indices, return values of system calls.

```typescript
const len: usize = buf.length    // usize, not i32

function copyTo(src: Ref<Buffer>, dst: Mut<Buffer>, offset: usize): usize {
    return src.copy(dst, offset)
}
```

Autocast: `usize` → `i64` is lossless on all platforms. `usize` → `i32` — requires explicit `as`.

## `number` — Default Synonym

`number` = `f64` by default (TypeScript compatibility):

```typescript
const a = 1;           // → f64 (desktop)
const b: number = 1;   // → f64 (desktop)
```

Overridden via `"defaultNumber"` in `tsc.package.json`. On 8-bit targets (`"target": "avr"`) `number` **automatically = `f32`**.

```typescript
// AVR — number automatically = f32
const a = 1;           // → f32
const b: number = 1;   // → f32
const d: f64 = 1;      // → f64 + warning: f64 on 8-bit target is inefficient
```

## Performance Warnings on AVR

On `"target": "avr"` the compiler emits warnings for types expensive on 8-bit ALU:

| Type | Reason | Hint |
|-----|---------|------|
| `f64` | 8 bytes, softfloat ~100 instructions per operation | `use f32 or integer type` |
| `f32` | 4 bytes, softfloat ~50 instructions | recommended type (no warning) |
| `i64` / `u64` | 8 bytes, chain of 8 instructions on 8-bit ALU | `use i32/u32 if range allows` |

```typescript
// AVR
const x: i64 = 1000000   // warning: i64 on 8-bit target is expensive
const y: f64 = 3.14      // warning: f64 on 8-bit target is inefficient
const z: i32 = 1000000   // ok
const w: f32 = 3.14      // ok
```

Warnings do not block compilation. Suppress: `// @ts-ignore-perf` or `"performanceWarnings": false` in `tsc.package.json`.

## TypedArray Aliases

Synonyms for native typed arrays for JS compatibility. No runtime overhead:

```typescript
type Uint8Array   = u8[]    type Int8Array    = i8[]
type Uint16Array  = u16[]   type Int16Array   = i16[]
type Uint32Array  = u32[]   type Int32Array   = i32[]
type Float32Array = f32[]   type Float64Array = f64[]
```

`Uint8Array` and `u8[]` are interchangeable.

## Conversion: Number → String

```typescript
const age: i32 = 30
const pi: f64 = 3.14159

// 1. .toString()
const s1 = age.toString()   // "30"
const s2 = pi.toString()    // "3.14159"

// 2. Template literal
const s3 = `Age: ${age}`    // "Age: 30"

// 3. Concatenation with string
const s5 = "Age: " + age    // "Age: 30"

// 4. Float formatting
const s6 = pi.toFixed(2)      // "3.14"
const s7 = pi.toPrecision(4)  // "3.142"

// as — does NOT work:
const bad = age as string   // compiler error
```

`toFixed` and `toPrecision` — only for `f32`/`f64`. Argument is a numeric literal (compile-time).

## Conversion: String → Number

```typescript
// parse — throws ParseError
const age = i32.parse("30")       // i32
const bad = i32.parse("abc")      // throws ParseError

// tryParse — returns T | null
const age = i32.tryParse("30")    // 30
const bad = i32.tryParse("abc")   // null

// With default:
const val = i32.tryParse(raw) ?? 0

// JS-compatible functions:
parseInt("42")        // i32 | null → 42
parseFloat("3.14")   // f64 | null → 3.14
Number("3.14")        // f64 | null → 3.14

// Prefix support:
parseInt("0xFF")      // 255
parseInt("0b1010")    // 10
parseInt("0o77")      // 63
```

Difference from JS: `parseInt`/`parseFloat`/`Number` return `T | null` instead of `NaN` — TSClang has no `NaN`.

Available for all numeric types: `i8.parse`, `i16.parse`, `i32.parse`, `i64.parse`, `u8.parse`, `u16.parse`, `u32.parse`, `u64.parse`, `f32.parse`, `f64.parse`.

## C Output

```typescript
const a: i32 = 42
const b: f64 = 3.14
const c: u8 = 0xFF
const d: i32 = a + (b as i32)
```

```c
int32_t a = 42;
double  b = 3.14;
uint8_t c = 0xFF;
int32_t d = a + (int32_t)b;   // C-cast, truncation
```

```typescript
const n: usize = buf.length
const m: i64 = n
```

```c
size_t  n = buf.length;
int64_t m = (int64_t)n;   // safe: usize → i64 is lossless
```

## Errors

| Error | Reason |
|--------|---------|
| `no common type for i32(-1) and u32(3_000_000_000)` | Mechanism 2 found no common type |
| `result 5_000_000_000 does not fit in u32` | Step 5: result does not fit |
| `use explicit casts, e.g. (a as i64 + b as i64)` | Hint for mechanism 3 |
| `expected f64, got i32` | Incompatible types without autocast |
| `f64 on 8-bit target is inefficient` | Performance warning on AVR |

## See Also

- [Strings](./strings.md) — number ↔ string conversion, `.toString()`, `parseInt`/`parseFloat`
- [Special Types](./special-types.md) — `any`, `void`, `never`
- [Null](./null.md) — `T | null`, optional chaining, `??`
- [Type Aliases](./type-aliases.md) — `type UserId = i32`
- [Memory Model](../05-memory/index.md) — primitives are copied, complex types are moved
