# Operator Precedence

[← Up](./index.md) | [Previous ←](./optional.md)

---

TSClang operator precedence table — from highest (evaluated first) to lowest. Operators on the same level have the indicated associativity.

## Precedence Table

| Precedence | Operator(s) | Associativity | Description |
|------------|-------------|---------------|-------------|
| 18 | `()` | — | Grouping |
| 17 | `.` `?.` `[]` `()` | Left | Member access, optional chaining, indexing, call |
| 16 | `++` `--` | — | Postfix increment / decrement |
| 15 | `!` `~` `+` `-` `++` `--` | Right | Unary: NOT, bitwise NOT, unary plus/minus, prefix increment/decrement |
| 14 | `**` | Right | Exponentiation |
| 13 | `*` `/` `%` | Left | Multiplication, division, remainder |
| 12 | `+` `-` | Left | Addition, subtraction |
| 11 | `<<` `>>` `>>>` | Left | Bitwise shifts |
| 10 | `<` `<=` `>` `>=` | Left | Order comparison |
| 9 | `==` `!=` `===` `!==` | Left | Equality / inequality |
| 8 | `&` | Left | Bitwise AND |
| 7 | `^` | Left | Bitwise XOR |
| 6 | `\|` | Left | Bitwise OR |
| 5 | `&&` | Left | Logical AND |
| 4 | `\|\|` `??` | Left | Logical OR, nullish coalescing |
| 3 | `? :` | Right | Ternary operator |
| 2 | `=` `+=` `-=` `*=` `/=` `%=` `**=` `&=` `\|=` `^=` `<<=` `>>=` `>>>=` `&&=` `\|\|=` `??=` | Right | Assignment |
| 1 | `,` | Left | Comma (in argument lists) |

---

## Examples

### Arithmetic

```typescript
2 + 3 * 4              // 14 — * is higher than +, so 2 + (3 * 4)
2 ** 3 ** 2            // 512 — ** is right-associative: 2 ** (3 ** 2)
```

### Logical and Bitwise

`&`, `^`, `|` — **different** precedences (8, 7, 6). This is important when combining:

```typescript
a | b & c              // a | (b & c) — & is higher than |
a ^ b | c              // (a ^ b) | c — ^ is higher than |

// comparisons are higher than bitwise:
a & b == c             // a & (b == c) — == is higher than &
// for bitwise AND between comparisons — parentheses:
(a == b) & (c == d)    // ok — explicit parentheses
```

### Assignment

Assignment has the lowest precedence (after `,`), right-associative:

```typescript
a = b = c = 5          // a = (b = (c = 5)) — all get 5
```

### Ternary operator

Right-associative — nested ternaries group from the right:

```typescript
x ? a : y ? b : c      // x ? a : (y ? b : c)
```

---

## Specifics

### `??` cannot be mixed with `||` / `&&`

Operators `||` and `??` are on the same precedence level (4), but mixing them without parentheses is a compiler error:

```typescript
a || b ?? c            // error: mixing || and ?? requires parentheses
(a || b) ?? c          // ok
a || (b ?? c)          // ok
```

### Member access (`.`) — highest precedence

```typescript
obj.method().field[0]  // ((obj.method()).field)[0]
```

### Shifts lower than additive operations

```typescript
1 << 2 + 3             // 1 << (2 + 3) = 1 << 5 = 32, not (1 << 2) + 3 = 7
```

---

## See also

- [Arithmetic operators](./arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Logical operators](./logical.md) — `&&`, `||`, `??`
- [Bitwise operators](./bitwise.md) — `&`, `|`, `^`, `<<`, `>>`, `>>>`
- [Assignment operators](./assignment.md) — all compound assignments
