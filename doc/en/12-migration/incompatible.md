# Incompatible patterns

[← Up](./index.md) | [Next →](./new-features.md) | [Previous ←](./manual.md)

---

Some TypeScript constructs have no direct equivalent in TSClang. This is due to fundamental differences: static typing without runtime interpretation, no prototype chain, NFA regex without backtracking.

## Incompatibility table

| Construct | Reason | Alternative |
|-----------|--------|-------------|
| `with` statement | Not supported | Explicit field access |
| `eval()` | No runtime interpretation | No direct equivalent |
| `Function` constructor | No runtime interpretation | No direct equivalent |
| Prototypal inheritance | TSClang has no prototype chain | Interfaces + composition |
| Dynamic property access `obj[key]` | Static typing | `Map<string, V>` or `switch` |
| `arguments` in functions | No variadic without types | Explicit array or overloading |
| Closure over `let` in loop | Different capture semantics | Explicit copy before closure |
| `typeof x === "object"` | Runtime type checks via union | Exhaustive match on union type |
| Regex backreferences `\1` | `std/regex` — NFA, no backtracking | `@tsc/pcre` if needed |
| Regex lookahead `(?=...)` | `std/regex` — NFA, no backtracking | `@tsc/pcre` if needed |
| `RegExp` literal `/pattern/flags` | Replaced with `new Regex(r"pattern")` | `import { Regex } from "std/regex"` |

## Details and examples

### Dynamic property access `obj[key]`

```typescript
// TypeScript:
const field = "name"
const value = obj[field]   // dynamic access

// TSClang — use Map:
const obj = new Map<string, string>()
obj.set("name", "Alice")
const value = obj.get("name")

// Or switch for known fields:
function getField(obj: User, field: string): string {
    return match (field) {
        "name" => obj.name,
        "email" => obj.email,
        _ => ""
    }
}
```

### `arguments` in functions

```typescript
// TypeScript:
function sum(...args: number[]): number {
    return args.reduce((a, b) => a + b, 0)
}

// TSClang — explicit array:
function sum(args: f64[]): f64 {
    let total: f64 = 0
    for (const x of args) { total += x }
    return total
}

// Or overloading:
function sum2(a: f64, b: f64): f64 { return a + b }
function sum3(a: f64, b: f64, c: f64): f64 { return a + b + c }
```

### Closure over `let` in loop

```typescript
// TypeScript — each iteration creates a new let binding:
for (let i = 0; i < 5; i++) {
    setTimeout(() => console.log(i), 100)  // 0, 1, 2, 3, 4
}

// TSClang — explicit copy:
for (let i = 0; i < 5; i++) {
    const copy = i            // explicit copy of value
    spawn(() => console.log(copy))
}
```

### `typeof` runtime checks

```typescript
// TypeScript:
function process(value: string | number) {
    if (typeof value === "string") { ... }
    if (typeof value === "number") { ... }
}

// TSClang — exhaustive match on union type:
function process(value: string | i32) {
    match (value) {
        s: string => { /* string branch */ },
        n: i32    => { /* number branch */ },
    }
}
```

### RegExp

```typescript
// TypeScript:
const re = /pattern/gi
const found = "text".match(/pattern/)

// TSClang:
import { Regex } from "std/regex"
const re = new Regex(r"pattern")
const found = re.test("text")

// For backreferences and lookahead:
// import from "@tsc/pcre" (external package)
```

## Errors

| Error | Cause |
|-------|-------|
| `with statement is not supported` | `with` is used — rewrite to explicit access |
| `eval is not supported` | `eval()` is called — no runtime interpretation |
| `dynamic property access` | `obj[expr]` where the key type is not a literal — use `Map` |
| `arguments is not defined` | `arguments` in function body — use an explicit array |
| `typeof runtime check` | `typeof x === "..."` — use `match` |

## See also

- [Manual migration](./manual.md) — patterns requiring manual edits
- [New features](./new-features.md) — what TSClang adds
- [Standard library: Regex](../10-stdlib/regex.md) — working with regular expressions
- [Syntax: Match](../02-syntax/match/syntax.md) — pattern matching
