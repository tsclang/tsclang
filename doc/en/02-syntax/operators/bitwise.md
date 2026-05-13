# Bitwise Operators

[← Up](./index.md) | [Next →](./optional.md) | [Previous ←](./logical.md)

---

Bitwise operations on integers. Work with types `i8`..`i64`, `u8`..`u64`, `usize`. Applying to `f32`/`f64` or `string` is a compiler error.

## Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `&` | Bitwise AND | `a & b` |
| `\|` | Bitwise OR | `a \| b` |
| `^` | Bitwise XOR | `a ^ b` |
| `~` | Bitwise NOT (unary) | `~a` |
| `<<` | Left shift | `a << n` |
| `>>` | Right shift (signed) | `a >> n` |
| `>>>` | Right shift (unsigned) | `a >>> n` |

---

## Bitwise AND (`&`), OR (`|`), XOR (`^`)

Bitwise operations are performed on each bit:

```typescript
const a: u8 = 0b1100_1010;
const b: u8 = 0b1010_0110;

const and: u8 = a & b;    // 0b1000_0010  — bit 1 only if both are 1
const or: u8  = a | b;    // 0b1110_1110  — bit 1 if at least one is 1
const xor: u8 = a ^ b;    // 0b0110_1100  — bit 1 if exactly one is 1
```

Typical scenarios:

```typescript
// mask — extract specific bits
const flags: u32 = 0xFF00;
const lower: u32 = flags & 0x00FF;     // 0x0000 — lower byte
const upper: u32 = flags & 0xFF00;     // 0xFF00 — upper byte

// set bit
let ctrl: u32 = 0x00;
ctrl |= 0x01;          // set bit 0
ctrl |= 0x80;          // set bit 7

// clear bit
ctrl &= ~0x80;         // clear bit 7

// toggle bit
ctrl ^= 0x01;          // toggle bit 0
```

## Bitwise NOT (`~`)

Inverts all bits (unary):

```typescript
const a: u8 = 0b0000_1111;
const not: u8 = ~a;     // 0b1111_0000

// typical pattern: clear a bit via &
let flags: u32 = 0xFF;
flags &= ~0x0F;         // 0xF0 — clear the lower 4 bits
```

## Shifts

### `<<` — left shift

Shifts bits left, filling with zeros. Equivalent to multiplying by `2^n`:

```typescript
const val: u32 = 1;
const shifted: u32 = val << 4;    // 16 — 1 * 2^4
```

### `>>` — signed right shift

Preserves the sign bit. For signed types, fills the high bits with the sign:

```typescript
const neg: i32 = -8;
const result: i32 = neg >> 1;     // -4 — sign bit preserved

const pos: u32 = 16;
const div: u32 = pos >> 2;        // 4 — 16 / 2^2
```

### `>>>` — unsigned right shift

Always fills the high bits with zeros, even for signed types:

```typescript
const neg: i32 = -1;              // 0xFFFFFFFF
const result: u32 = neg >>> 4;    // 0x0FFFFFFF — zeros instead of sign

// extracting bytes from u32
const value: u32 = 0xAABBCCDD;
const byte0: u8 = (value & 0xFF) as u8;           // 0xDD
const byte1: u8 = ((value >> 8) & 0xFF) as u8;    // 0xCC
const byte2: u8 = ((value >> 16) & 0xFF) as u8;   // 0xBB
const byte3: u8 = ((value >>> 24) & 0xFF) as u8;  // 0xAA
```

---

## C-output

Bitwise operations are translated directly — one to one:

```c
// const and: u8 = a & b;
uint8_t and = a & b;

// const or: u8 = a | b;
uint8_t or = a | b;

// const xor: u8 = a ^ b;
uint8_t xor = a ^ b;

// const not: u8 = ~a;
uint8_t not = ~a;

// const shifted: u32 = val << 4;
uint32_t shifted = val << 4;

// const result: i32 = neg >> 1;
int32_t result = neg >> 1;

// const r: u32 = neg >>> 4;
uint32_t r = (uint32_t)neg >> 4;
```

---

## Errors

| Error | Cause |
|-------|-------|
| `bitwise operator & not defined for f64` | Bitwise operations with float |
| `bitwise operator & not defined for string` | Bitwise operations with strings |

## See also

- [Arithmetic operators](./arithmetic.md) — `+`, `-`, `*`, `/`
- [Assignment operators](./assignment.md) — `&=`, `|=`, `^=`, `<<=`, `>>=`, `>>>=`
- [Operator precedence](./precedence.md) — `&` (8), `^` (7), `|` (6) — different precedences!
