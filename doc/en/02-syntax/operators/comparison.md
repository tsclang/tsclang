# Comparison Operators

[← Up](./index.md) | [Next →](./logical.md) | [Previous ←](./assignment.md)

---

Comparison operators return `bool`. In TSClang **there is no implicit type coercion** — `==` and `===` behave identically. `===` is recommended for clarity.

## Operators

| Operator | Description | Result |
|----------|-------------|--------|
| `===` | Strict equality | `bool` |
| `!==` | Strict inequality | `bool` |
| `==` | Equality (identical to `===`) | `bool` |
| `!=` | Inequality (identical to `!==`) | `bool` |
| `<` | Less than | `bool` |
| `>` | Greater than | `bool` |
| `<=` | Less than or equal | `bool` |
| `>=` | Greater than or equal | `bool` |

---

## `==` and `===`

In JavaScript `==` performs type coercion, while `===` does not. In TSClang **there is no type coercion at all**, so both operators are identical:

```typescript
const a: i32 = 42;
const b: f64 = 42.0;

// TSClang:
a == b       // error: cannot compare i32 and f64 — different types
a === b      // error: same — no implicit coercion

// to compare different numeric types — explicit conversion:
a == (b as i32)      // ok
i32(a) === i32(b)    // ok
```

Comparison of same-type values:

```typescript
const x: i32 = 42;
const y: i32 = 42;
const z: i32 = 10;

x === y     // true
x !== z     // true
x == y      // true — identical to ===
x != z      // true — identical to !==
```

---

## Comparison with `null`

For nullable types `T | null` comparison with `null` checks for the presence of a value:

```typescript
let name: string | null = getName();

if (name !== null) {
    // name: string — type narrowing
    console.log(name.length);
}

if (name === null) {
    // name: null
    console.log("no name");
}
```

Comparison `=== null` is the primary way to narrow nullable types. After the check the compiler knows the exact type in each branch.

---

## String Comparison

Strings are compared by value (character by character), not by reference:

```typescript
const a: string = "hello";
const b: string = "hello";
const c: string = "world";

a === b     // true — same content
a === c     // false
a !== c     // true
a < c       // true — lexicographic comparison
```

---

## Ordering Operators (`<`, `>`, `<=`, `>=`)

Work with numeric types and strings (lexicographically). Strings and numbers cannot be mixed:

```typescript
const x: i32 = 10;
const y: i32 = 20;

x < y       // true
x > y       // false
x <= 10     // true
x >= 20     // false

// strings — lexicographic comparison
"abc" < "abd"     // true
"abc" < "ab"      // false
"abc" === "abc"   // true
```

---

## C Output

```c
// x === y (numeric)
bool result = (x == y);

// a !== null (complex type — pointer)
bool result = (a != NULL);

// name !== null (primitive — struct)
bool result = name.has_value;

// s1 < s2 (string)
bool result = (tsc_string_cmp(s1, s2) < 0);

// s1 === s2 (string)
bool result = (tsc_string_cmp(s1, s2) == 0);
```

---

## Errors

| Error | Cause |
|-------|-------|
| `cannot compare i32 and f64` | Different types without explicit conversion |
| `operator < not defined for bool` | Ordering for unordered types |
| `cannot compare string and i32` | String and number |

## See Also

- [Logical Operators](./logical.md) — `&&`, `||`, `!`
- [Truthy / Falsy](../truthy-falsy.md) — rules for coercion to `bool`
- [Data Types](../../03-types/index.md) — numeric and string types
