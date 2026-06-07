# Classes and Object System

[← Up](../index.md) | [Next →](./classes.md)

---

The TSClang object system is built on composition instead of inheritance, nominal typing for classes, and structural typing for interfaces. Generics are monomorphized — separate C code for each concrete type.

## Key principles

- **No inheritance** — only `extends Error` for error hierarchies. Polymorphism via `interface` + `implements`.
- **Composition** — instead of `class Dog extends Animal` use `class Dog { animal: Animal }`.
- **Ownership is integrated** — `mut`, `move` method modifiers control `this` semantics.
- **Generics are monomorphized** — `Stack<i32>` and `Stack<User>` generate separate C functions.
- **Decorators are compile-time** — transform AST before type checking, zero runtime overhead.

## Subpages

| Page | Description |
|------|-------------|
| [Classes](./classes.md) | Definition, modifiers, `this` semantics, `readonly`, constructors, value object, builder |
| [Interfaces](./interfaces.md) | Data interfaces vs contract, fat pointer vtable, `instanceof`, structural compatibility |
| [Enum](./enum.md) | Numeric, string, `const enum`, utilities, exhaustiveness in `match` |
| [Generics](./generics.md) | Syntax, bounds (`implements`/`extends`), monomorphization, ownership with generics |
| [Decorators](./decorators.md) | `decorator function`, Descriptor API, `@packed`, `@align`, `@static`, `@embedded.*`, `@signal`, `@platform` |

## Extension Methods

TSClang supports extension methods — adding methods to existing types without modifying the definition. Imported explicitly, do not pollute the global scope.

```typescript
export extension function charCount(this: string): i32 {
    // count codepoints
}

import { charCount } from "std/string"
"привет".charCount()   // ok
```

C-output — static call, zero overhead:

```c
int32_t n = tsc_std_string_charCount(s);
```

An extension conflicting with an existing method — compiler error. Two extensions with the same name from different modules — resolved via `import { format as fmtA } from "./module-a"`.

## Errors

| Error | Cause |
|-------|-------|
| `extends is only allowed for Error` | Attempt to inherit from an arbitrary class |
| `extension 'format' conflicts with existing method` | Extension with the name of an existing method |
| `ambiguous extension 'format' for type 'string'` | Two imported extensions with the same name |

## See also

- [Memory Model](../05-memory/index.md) — ownership, `Ref<T>`, `Mut<T>`, move semantics
- [Type System](../03-types/index.md) — structural vs nominal typing
- [Error Handling](../06-errors/index.md) — `extends Error`, `throws`, `try/catch`
- [Specification: Classes](../../spec/04-classes/04-classes.md) — full description of the object system
