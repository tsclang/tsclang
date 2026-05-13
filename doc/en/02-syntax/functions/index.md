# Functions

[← Up](../index.md) | [Next →](./declaration.md)

---

Functions in TSClang follow TypeScript syntax with extensions for working with the ownership model. The compiler translates functions into C with name mangling to support overloading.

## Sections

| Page | Description |
|----------|----------|
| [Function declaration](./declaration.md) | `function`, anonymous functions, IIFE, closures |
| [Arrow functions](./arrow.md) | `=>` syntax, expression/block body, async |
| [Function overloading](./overload.md) | By types and number of parameters, name mangling |
| [Default parameters](./default-params.md) | Default values, substitution at callsite |

## Common properties

- All TSClang functions in C-output are marked `static` — not visible to the linker outside the compilation unit
- Only `export extern "C"` functions are non-static with an explicit C name
- Primitives (`i8`..`f64`, `bool`) are passed by value (copy)
- Complex types are managed by the ownership system (move / borrow)

## C-output: basic structure

```typescript
function add(a: i32, b: i32): i32 {
    return a + b;
}
```

```c
int32_t add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}
```

---

## See also

- [Variables: let / const](../variables/index.md) — effect on passing as `Mut<T>`
- [Types](../../03-types/index.md) — numeric types, strings, arrays
- [Memory model](../../05-memory/index.md) — ownership, borrow checker, closures
- [Error handling](../../06-errors/index.md) — `throws`, `try/catch`
