# Assignment Operators

[← Up](./index.md) | [Next →](./comparison.md) | [Previous ←](./arithmetic.md)

---

All assignment operators in TSClang. Applicable only to `let` variables — attempting to assign to `const` causes a compiler error.

## Basic Assignment

```typescript
let x: i32 = 10;
x = 20;              // simple assignment
```

For complex types (arrays, objects, classes) assignment is a **move**. After `a = b` variable `b` is invalid:

```typescript
let a = new Node();
let b = a;              // move — a is now invalid
// console.log(a);      // error: use of moved variable
```

**Exception: `string`** uses ARC, not move. After `let b = a` both are valid:

```typescript
let a: string = "hello";
let b: string = a;      // copy + retain — both valid
console.log(a.length);  // ok
console.log(b.length);  // ok
```

---

## Compound Operators

### Arithmetic

| Operator | Equivalent | Description |
|----------|------------|-------------|
| `+=` | `a = a + b` | Addition / concatenation with assignment |
| `-=` | `a = a - b` | Subtraction with assignment |
| `*=` | `a = a * b` | Multiplication with assignment |
| `/=` | `a = a / b` | Division with assignment |
| `%=` | `a = a % b` | Remainder with assignment |
| `**=` | `a = a ** b` | Exponentiation with assignment |

```typescript
let total: i32 = 100;
total += 50;         // 150
total -= 30;         // 120
total *= 2;          // 240
total /= 4;          // 60
total %= 7;          // 4
total **= 3;         // 64

// string += — concatenation
let msg: string = "Hello";
msg += " world";     // "Hello world"
```

### Bitwise

| Operator | Equivalent | Description |
|----------|------------|-------------|
| `&=` | `a = a & b` | Bitwise AND with assignment |
| `\|=` | `a = a \| b` | Bitwise OR with assignment |
| `^=` | `a = a ^ b` | Bitwise XOR with assignment |
| `<<=` | `a = a << b` | Left shift with assignment |
| `>>=` | `a = a >> b` | Right shift (signed) with assignment |
| `>>>=` | `a = a >>> b` | Right shift (unsigned) with assignment |

```typescript
let flags: u32 = 0xFF;
flags &= 0x0F;       // 0x0F — clear upper bits
flags |= 0x80;       // 0x8F — set bit 7
flags ^= 0x01;       // 0x8E — toggle bit 0
flags <<= 4;         // 0x8E0 — left shift by 4
flags >>= 2;         // 0x238 — right shift by 2 (signed)
```

### Logical

| Operator | Equivalent | Description |
|----------|------------|-------------|
| `&&=` | `a = a && b` | Logical AND with assignment |
| `\|\|=` | `a = a \|\| b` | Logical OR with assignment |
| `??=` | `a = a ?? b` | Nullish coalescing with assignment |

```typescript
// ||=
let name: string = "";
name ||= "Anonymous";   // "Anonymous" — "" is falsy

// &&=
let config: string | null = "debug";
config &&= config.toUpperCase();  // "DEBUG"

// ??=
let port: i32 | null = null;
port ??= 8080;          // 8080 — null, default is assigned
```

`??=` assigns a value only if the left operand is `null` (not `0`, not `""`, not `false`):

```typescript
let count: i32 | null = 0;
count ??= 99;           // count = 0 — 0 is not null, assignment does not happen

let label: string | null = "";
label ??= "default";    // label = "" — empty string is not null
```

---

## C Output

```c
// let total: i32 = 100; total += 50;
int32_t total = 100;
total += 50;

// flags &= 0x0F;
flags &= 0x0F;

// port ??= 8080;
if (!port.has_value) {
    port.has_value = true;
    port.value = 8080;
}

// let msg: string = "Hello"; msg += " world";
String msg = tsc_string_from_cstr("Hello");
String _tmp = tsc_string_concat(msg, tsc_string_from_cstr(" world"));
tsc_string_drop(&msg);
msg = _tmp;
```

---

## Errors

| Error | Cause |
|-------|-------|
| `cannot assign to const variable` | Assignment to `const` |
| `use of moved variable` | Using a variable after move-assignment |
| `cannot mix \|\| and ?? without parentheses` | `\|\|=` / `&&=` / `??=` in one expression without parentheses |

## See Also

- [Arithmetic Operators](./arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Bitwise Operators](./bitwise.md) — `&`, `|`, `^`, `<<`, `>>`, `>>>`
- [Logical Operators](./logical.md) — `&&`, `||`, `??`
- [Memory Model](../../05-memory/index.md) — ownership and move semantics
