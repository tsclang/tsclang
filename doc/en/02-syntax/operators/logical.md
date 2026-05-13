# Logical Operators

[← Up](./index.md) | [Next →](./bitwise.md) | [Previous ←](./comparison.md)

---

Logical operators `&&`, `||`, and `??` behave like in JavaScript — they return **the operand itself**, not `boolean`. Exception: `!` always returns `bool`.

## Operators

| Operator | Description | Returns |
|----------|-------------|---------|
| `&&` | Logical AND — first falsy or last | Operand type |
| `\|\|` | Logical OR — first truthy or last | Operand type |
| `!` | Logical NOT — inverts truthiness | `bool` |
| `??` | Nullish coalescing — right if left is `null` | Operand type |

---

## `&&` — Logical AND

Returns the **first falsy** operand or the **last** if all are truthy:

```typescript
const a: string = "hello";
const b: string = "";

a && "exists"         // "exists" — a is truthy, right is returned
b && "exists"         // "" — b is falsy, b is returned
"" && 0 && null       // "" — first falsy
"yes" && 42           // 42 — all truthy, last is returned
```

Type narrowing after `&&`:

```typescript
let s: string | null = getValue();
if (s && s.length > 0) {
    // s: string — after && compiler knows s is not null
}
```

## `||` — Logical OR

Returns the **first truthy** operand or the **last** if all are falsy:

```typescript
const name: string = "";
const port: i32 = 0;

name || "Anonymous"    // "Anonymous" — "" is falsy
port || 8080           // 8080 — 0 is falsy
"hello" || "fallback"  // "hello" — first truthy
null || 0 || false     // false — all falsy, last
```

## `!` — Logical NOT

Unary operator, returns `bool`. Inverts truthiness:

```typescript
const flag: bool = true;
!flag                  // false

const s: string = "";
!s                     // true — "" is falsy, inversion = true

const n: i32 = 42;
!n                     // false — 42 is truthy, inversion = false
```

## `??` — Nullish Coalescing

Returns the right operand if the left is `null`. **Does not react** to `0`, `""`, `false` — unlike `||`:

```typescript
let val: i32 | null = null;
val ?? 99              // 99 — val is null

let count: i32 | null = 0;
count ?? 99            // 0 — count is not null, even though 0 is falsy

let label: string | null = "";
label ?? "default"     // "" — empty string is not null
```

### `??` vs `||`

```typescript
// || — reacts to all falsy (0, "", false, null)
let port: i32 | null = 0;
port || 8080           // 8080 — 0 is falsy
port ?? 8080           // 0    — 0 is not null

// ?? — reacts only to null
let name: string | null = "";
name || "default"      // "default" — "" is falsy
name ?? "default"      // ""        — "" is not null
```

### Borrow Checker and `??`

After `lhs ?? rhs` variable `lhs` is narrowed to `null` — either it was null, or it was moved into the result. Using `lhs` after `??` is an error:

```typescript
let s: string | null = getString();
const result = s ?? "default";
// s is narrowed to null

s.length              // error: s is null
if (s !== null) {}    // warning: condition always false
```

To reuse — clone before `??`:

```typescript
const result = s.clone() ?? "default";
// s is alive, result is a separate copy
```

---

## Mixing `??` with `&&` / `||`

`??` cannot be mixed with `||` or `&&` without explicit parentheses — compiler error:

```typescript
a || b ?? c           // error: mixing || and ?? requires parentheses
a && b ?? c           // error: mixing && and ?? requires parentheses

(a || b) ?? c         // ok
a || (b ?? c)         // ok
```

This prevents ambiguity: `a || b ?? c` could mean either `a || (b ?? c)` or `(a || b) ?? c` — results differ.

---

## C Output

```c
// a || b (complex type — pointer)
String result = (a != NULL) ? a : b;

// a || b (primitive)
int32_t result = (a != 0) ? a : b;

// a && b
String result = (a != NULL) ? b : a;

// !a (string — non-nullable)
bool result = !(a->length > 0);

// a ?? b (primitive — struct)
int32_t result = a.has_value ? a.value : b;

// a ?? b (complex type — pointer, move)
String result = (s != NULL) ? *s : (String){ "default", 7, 0 };
s = NULL;
```

---

## Errors

| Error | Cause |
|-------|-------|
| `mixing \|\| and ?? without parentheses` | `\|\|` and `??` without parentheses |
| `mixing && and ?? without parentheses` | `&&` and `??` without parentheses |
| `use of moved variable` | Use after `??` (move) |

## See Also

- [Comparison Operators](./comparison.md) — `===`, `!==`, `<`, `>`
- [Optional Operators](./optional.md) — `?.`, `??`, spread
- [Truthy / Falsy](../truthy-falsy.md) — truthiness rules
