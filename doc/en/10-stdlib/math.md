# Math

[← Up](./index.md) | [Next →](./io.md) | [Previous ←](./console.md)

---

Global object `Math` — constants and mathematical functions. No import needed. Available on all platforms.

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `Math.PI` | `3.141592653589793` | π |
| `Math.E` | `2.718281828459045` | e |
| `Math.SQRT2` | `1.4142135623730951` | √2 |
| `Math.SQRT1_2` | `0.7071067811865476` | 1/√2 |
| `Math.LN2` | `0.6931471805599453` | ln(2) |
| `Math.LN10` | `2.302585092994046` | ln(10) |
| `Math.LOG2E` | `1.4426950408889634` | log₂(e) |
| `Math.LOG10E` | `0.4342944819032518` | log₁₀(e) |

## Rounding

```typescript
Math.floor(4.7)    // 4.0 — round down
Math.ceil(4.2)     // 5.0 — round up
Math.round(4.5)    // 5.0 — mathematical rounding
Math.trunc(4.9)    // 4.0 — discard fractional part
```

## Arithmetic

```typescript
Math.abs(-5)          // 5 — overload: i32|f64 → same type
Math.pow(2.0, 10.0)   // 1024.0
Math.sqrt(9.0)        // 3.0
Math.cbrt(27.0)       // 3.0
Math.hypot(3.0, 4.0)  // 5.0
```

## Trigonometry (radians)

```typescript
Math.sin(Math.PI / 2)  // 1.0
Math.cos(0.0)          // 1.0
Math.tan(Math.PI / 4)  // 1.0
Math.asin(1.0)         // Math.PI / 2
Math.acos(1.0)         // 0.0
Math.atan(1.0)         // Math.PI / 4
Math.atan2(1.0, 1.0)   // Math.PI / 4
```

## Hyperbolic functions

```typescript
Math.sinh(0.0)    // 0.0
Math.cosh(0.0)    // 1.0
Math.tanh(0.0)    // 0.0
Math.asinh(0.0)   // 0.0
Math.acosh(1.0)   // 0.0
Math.atanh(0.5)   // 0.5493...
```

## Logarithms and exponent

```typescript
Math.log(Math.E)      // 1.0
Math.log2(8.0)        // 3.0
Math.log10(1000.0)    // 3.0
Math.log1p(0.0)       // 0.0 — ln(1 + x), more accurate at x → 0
Math.exp(1.0)         // Math.E
Math.expm1(0.0)       // 0.0 — e^x - 1, more accurate at x → 0
```

## Utilities

```typescript
Math.min(3, 1, 4, 1)      // 1 — overload: i32|f64 → same type
Math.max(3, 1, 4, 1)      // 4
Math.clamp(15, 0, 10)     // 10 — overload: i32|f64 → same type
Math.sign(-5.0)            // -1.0  (0.0 → 0.0, positive → 1.0)
Math.clz32(1)              // 31 — number of leading zeros in 32-bit representation
Math.imul(3, 4)            // 12 — 32-bit integer multiplication with overflow
Math.fround(1.337)         // f32 — nearest f32 representation
Math.random()              // f64 — [0.0, 1.0)
```

## Full signature table

| Method | Signature | C-mapping |
|--------|-----------|-----------|
| `floor` | `(x: f64): f64` | `floor(x)` |
| `ceil` | `(x: f64): f64` | `ceil(x)` |
| `round` | `(x: f64): f64` | `round(x)` |
| `trunc` | `(x: f64): f64` | `trunc(x)` |
| `abs` | `(x: f64): f64` / `(x: i32): i32` | `fabs(x)` / `abs(x)` |
| `pow` | `(b: f64, e: f64): f64` | `pow(b, e)` |
| `sqrt` | `(x: f64): f64` | `sqrt(x)` |
| `cbrt` | `(x: f64): f64` | `cbrt(x)` |
| `hypot` | `(a: f64, b: f64): f64` | `hypot(a, b)` |
| `sin` | `(x: f64): f64` | `sin(x)` |
| `cos` | `(x: f64): f64` | `cos(x)` |
| `tan` | `(x: f64): f64` | `tan(x)` |
| `asin` | `(x: f64): f64` | `asin(x)` |
| `acos` | `(x: f64): f64` | `acos(x)` |
| `atan` | `(x: f64): f64` | `atan(x)` |
| `atan2` | `(y: f64, x: f64): f64` | `atan2(y, x)` |
| `sinh` | `(x: f64): f64` | `sinh(x)` |
| `cosh` | `(x: f64): f64` | `cosh(x)` |
| `tanh` | `(x: f64): f64` | `tanh(x)` |
| `asinh` | `(x: f64): f64` | `asinh(x)` |
| `acosh` | `(x: f64): f64` | `acosh(x)` |
| `atanh` | `(x: f64): f64` | `atanh(x)` |
| `log` | `(x: f64): f64` | `log(x)` |
| `log2` | `(x: f64): f64` | `log2(x)` |
| `log10` | `(x: f64): f64` | `log10(x)` |
| `log1p` | `(x: f64): f64` | `log1p(x)` |
| `exp` | `(x: f64): f64` | `exp(x)` |
| `expm1` | `(x: f64): f64` | `expm1(x)` |
| `min` | `(a: f64, b: f64): f64` / i32 | inline |
| `max` | `(a: f64, b: f64): f64` / i32 | inline |
| `clamp` | `(v, lo, hi): f64` / i32 | inline |
| `sign` | `(x: f64): f64` | inline |
| `clz32` | `(x: i32): i32` | `__builtin_clz(x)` |
| `imul` | `(a: i32, b: i32): i32` | `(int32_t)((int32_t)(a) * (int32_t)(b))` |
| `fround` | `(x: f64): f32` | `(float)(x)` |
| `random` | `(): f64` | runtime RNG |

## C-output

```typescript
const x = Math.sin(Math.PI / 4)
const y = Math.max(3, 7)
const z = Math.floor(3.7)
```

```c
double x = sin(3.141592653589793 / 4);
int32_t y = (3 > 7) ? 3 : 7;  // inline
double z = floor(3.7);
```

## Errors

| Error | Cause |
|-------|-------|
| `expected f64, got string` | Non-numeric argument to Math method |

## See also

- [Global objects](./globals.md) — `Math`, `performance`
- [std/random](./hal.md#stdlib-random) — typed random number generation API
- [Numeric types](../03-types/numbers.md) — `f32`, `f64`, `as`
