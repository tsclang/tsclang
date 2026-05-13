# Truthy / Falsy

[← Up](./index.md) | [Next →](./variables/index.md) | [Previous ←](./formatting.md)

Rules for coercing values to `bool` — like JavaScript, but **without** `undefined` and `NaN`:

| Type | Falsy | Truthy |
|------|-------|--------|
| `boolean` | `false` | `true` |
| numeric (`i8`..`f64`) | `0` | any non-zero |
| `string` | `""` (empty) | any non-empty |
| `T \| null` (complex type) | `null` | non-null |
| `T \| null` (primitive) | `null` **or** falsy value | non-null **and** truthy |
| class / type / interface | never (always truthy) | always |
| array / Set / Map | never (always truthy, even empty) | always |

## Examples

```typescript
if ("")    { }  // falsy
if ("hi")  { }  // truthy
if (0)     { }  // falsy
if (42)    { }  // truthy
if (null)  { }  // falsy

// string | null — truthy if not null AND not ""
let s: string | null = getValue();
if (s) {
    // s: string (not null and not empty)
}

// i32 | null — truthy if not null AND not 0
let n: i32 | null = getValue();
if (n) {
    // n: i32 (not null and not 0)
}

// class — always truthy (non-null by definition)
let u = new User("Alice");
if (u) { }  // always truthy — compiler warning: condition always true

// array / Set / Map — always truthy, even empty
let arr: i32[] = [];
if (arr) { }  // truthy — warning: condition always true
              // to check emptiness use arr.length === 0
```

## Narrowing via truthy/falsy

`if` check narrows the type:

```typescript
let s: string | null = getValue();
if (s) {
    console.log(s.length);  // s: string — not null, not ""
} else {
    // s: string | null, but definitely null or ""
}
```

## C-output for truthy checks

```c
// string | null
if (s != NULL && s->length > 0) { ... }

// i32 | null (struct)
if (x.has_value && x.value != 0) { ... }

// string (non-nullable)
if (s->length > 0) { ... }
```

---

## Nullable Types

### `T | null` Syntax

Any type can be marked nullable via union with `null`:

```typescript
let name: string | null = null;
let age: i32 | null = null;
let user: User | null = null;
```

C representation depends on type category:

- **Complex types** (strings, classes, interfaces) → pointer `T*`, `NULL` means `null`. Zero cost.
- **Primitives** (`i32`, `f64`, `bool`, …) → struct `struct { bool has_value; T value; }`.

> **Overhead:** `i32 | null` takes 8 bytes instead of 4 due to alignment. For hot paths with large arrays of nullable primitives, use sentinel values manually.

### `?` Sugar

Suffix `?` is equivalent to `| null`:

```typescript
let name: string? = null;       // string | null
let age: i32? = null;           // i32 | null
let items: string[]? = null;    // string[] | null
function find(id: i32): User? { /* ... */ }
```

### Type narrowing after null check

```typescript
let s: string | null = getValue();
if (s != null) {
    console.log(s.length);  // s: string
} else {
    // s: null
}
```

---

## Optional Chaining `?.`

Allows safe access to properties and methods of nullable objects. If any element in the chain is `null`, the result of the entire expression is `null`.

```typescript
const name = user?.profile?.name;         // string | null
const len  = user?.tags?.length;          // i32 | null
const upper = user?.getName()?.toUpperCase();
```

Result type of `?.` is always nullable: `T | null`.

## Nullish Coalescing `??`

Operator `??` returns the right operand if the left is `null`:

```typescript
const name = user.name ?? "Anonymous";   // string
const age  = user.age ?? 0;              // i32
const city = user?.address?.city ?? "Unknown";
```

Right operand of `??` must have type `T` in expression `T | null`.

### Borrow checker and `??`

After `lhs ?? rhs` type `lhs` is narrowed to `null`. Using `lhs` after `??` as non-null — error.

```typescript
let s: string | null = getString()
const result = s ?? "default"
// after: s is null, result: string (owned)

s.length          // error: s is null
if (s != null) {} // compiler warns: always false
```

To reuse the value — clone before `??`:

```typescript
const result = s.clone() ?? "default"
```

### C-output for `??`

```c
// Primitive (struct):
int32_t y = x.has_value ? x.value : 0;

// Complex type (pointer) — move:
String result = s != NULL ? *s : (String){ "default", 7, 0 };
s = NULL;
```

---

## See also

- [Logical Operators](./operators/logical.md) — `&&`, `||`, `!`
- [Optional Operators](./operators/optional.md) — `?.`, `??`, spread
- [Memory Model](../../05-memory/index.md) — ownership and borrow checker
