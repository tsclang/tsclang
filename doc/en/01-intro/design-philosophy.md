# Design Philosophy

[← Up](./index.md) | [Next →](./quick-start.md) | [Previous ←](./what-is-tsclang.md)

---

In every design decision TSClang follows a strict hierarchy of priorities:

## Three Priorities

1. **Memory safety** — ownership, borrow checker, no GC
2. **Performance and typing** — zero-cost abstractions, strict types
3. **TS syntax** — preserve as much as possible, but not at the cost of #1 and #2

The goal is not "existing TS code compiles without changes", but "TS developer recognizes the syntax and feels at home".

## TS Syntax Takes Priority

Borrow syntax from Rust, C, Go — only if TS has no suitable construct.

New concepts are embedded through TS-compatible syntax:

| Concept | Rust | TSClang |
|---------|------|---------|
| Immutable borrow | `&T` | `Ref<T>` |
| Mutable borrow | `&mut T` | `Mut<T>` |
| Mutable variable | `let mut` | `let mut` |
| Readonly | `let` (default) | `const` / `readonly` |

Classes are preserved, despite absence in Rust — they exist in TS and are familiar to developers.

## Question for Every Decision

> *Can this be expressed through existing TS syntax or its natural extension?*

If yes — use TS syntax. If no — find the minimal extension that doesn't conflict with TS.

## Backward Compatibility

Simple native TS code without external libraries should compile or require trivial fixes that remain valid TS:

```typescript
let a = 10          // may require explicit annotation
let a: number = 10  // valid in both TS and TSClang
```

Code with classes, objects, arrays, loops, template literals — works as-is or with minimal changes.

## See also

- [What is TSClang](./what-is-tsclang.md) — language overview
- [Memory Model](../05-memory/index.md) — how ownership and borrow checker work
- [Migration Guide](../12-migration/index.md) — porting TS code to TSClang
