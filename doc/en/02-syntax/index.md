# Syntax

[← Up](../index.md) | [Next →](./formatting.md)

---

Complete description of TSClang syntax. The language follows TypeScript/JavaScript conventions with extensions for safe memory management.

## Sections

### Basics
- [Formatting](./formatting.md) — semicolons, indentation, quotes, linter
- [Truthy / Falsy](./truthy-falsy.md) — which values are considered true/false

### Variables
- [let / const](./variables/index.md) — mutability, ownership differences

### Functions
- [Declaration](./functions/declaration.md) — `function`, parameters, return type
- [Arrow](./functions/arrow.md) — `=>` syntax
- [Overloading](./functions/overload.md) — by type and parameter count
- [Default Parameters](./functions/default-params.md) — default values

### Operators
- [Arithmetic](./operators/arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Assignment](./operators/assignment.md) — `=`, `+=`, `-=`, etc.
- [Comparison](./operators/comparison.md) — `==`, `!=`, `===`, `!==`
- [Logical](./operators/logical.md) — `&&`, `||`, `!`, `??`
- [Bitwise](./operators/bitwise.md) — `&`, `|`, `^`, `~`, `<<`, `>>`
- [Optional](./operators/optional.md) — `?.`, `??`, spread `...`
- [Operator Precedence](./operators/precedence.md) — precedence table

### Loops
- [for](./loops/for.md) — classic loop
- [for-of](./loops/for-of.md) — collection iteration
- [while / do-while](./loops/while.md) — condition loops
- [break / continue](./loops/break-continue.md) — iteration control

### Flow Control
- [switch](./match/switch.md) — value selection
- [match](./match/index.md) — pattern matching

### Slices
- [Indexing and Slices](./slices.md) — `[]`, `[a..b]`, negative indices

## See also

- [Types](../03-types/index.md) — type system
- [Memory Model](../05-memory/index.md) — ownership and borrow checker
