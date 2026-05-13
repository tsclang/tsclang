# Branching: switch and match

[← Up](../index.md) | [Next →](./switch.md)

---

TSClang provides two constructs for value-based branching:

- **`switch`** — value selection statement. Similar to JS/TS, but with **forbidden implicit fallthrough**.
- **`match`** — pattern matching expression. Returns a value, checks coverage completeness.

## Quick comparison

| | `switch` | `match` |
|---|---|---|
| Type | statement | expression (returns a value) |
| Coverage completeness | warning | compilation error |
| Patterns | equality only | literals, ranges, destructuring, `|` |
| Fallthrough | forbidden | none (each branch is a separate expression) |
| Supported types | numeric, string, boolean, enum | any type |

## Example

```typescript
// switch — statement, returns nothing
switch (status) {
    case 200:
        console.log("OK");
        break;
    default:
        console.log("error");
}

// match — expression, returns a value
const label = match (x) {
    0       => "zero",
    1..10   => "small",
    _       => "large",
};
```

## Detailed pages

- [switch](./switch.md) — selection statement: syntax, fallthrough, enum, C-output
- [match](./syntax.md) — pattern matching: patterns, exhaustiveness, destructuring, C-output

## See also

- [Variables](../variables/index.md) — let / const and ownership
- [Enum](../../03-types/enum.md) — enumerations and exhaustiveness
- [Memory model](../../05-memory/index.md) — move semantics in match
