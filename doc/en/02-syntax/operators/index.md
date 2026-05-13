# Operators

[← Up](../index.md) | [Next →](./arithmetic.md)

---

Complete reference for TSClang operators. The language follows TypeScript/JavaScript conventions — operators are familiar to TS developers, but without type coercion and with the ownership model in mind.

## Categories

### Arithmetic

- [Arithmetic operators](./arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`, `++`, `--`

### Assignment

- [Assignment operators](./assignment.md) — `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `&=`, `|=`, `^=`, `<<=`, `>>=`, `>>>=`, `&&=`, `||=`, `??=`

### Comparison

- [Comparison operators](./comparison.md) — `==`, `!=`, `===`, `!==`, `<`, `>`, `<=`, `>=`

### Logical

- [Logical operators](./logical.md) — `&&`, `||`, `!`, `??`

### Bitwise

- [Bitwise operators](./bitwise.md) — `&`, `|`, `^`, `~`, `<<`, `>>`, `>>>`

### Optional and special

- [Optional operators](./optional.md) — `?.`, `??`, spread `...`

### Precedence

- [Operator precedence](./precedence.md) — full precedence and associativity table

## Common rules

- **No implicit type coercion** — `==` and `===` behave identically
- **Ownership** — complex types are moved upon assignment, primitives are copied
- **`const`** — cannot be reassigned, cannot use left-side operators (`++`, `+=`, etc.)

## See also

- [Truthy / Falsy](../truthy-falsy.md) — rules for coercion to `bool`
- [Variables: let / const](../variables/index.md) — mutability and ownership
- [Memory model](../../05-memory/index.md) — ownership and borrow checker
