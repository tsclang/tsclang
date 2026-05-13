# Module System

[← Up](../index.md) | [Next →](./import-export.md)

---

TSClang uses a **module system** compatible with TypeScript in syntax: named `export` / `import { } from ""`. One file = one module. The compiler automatically generates `#include`, forward declarations, and initialization functions in C-output.

## Principles

- **One file — one module** — no `namespace`, no `module`
- **Only named exports** — `export default` forbidden (C requires an explicit name for each symbol)
- **Circular imports allowed** — compiler generates forward declarations in `.h`
- **`.d.tsc` files** — declarations for C-interop (analog of `.d.ts` in TypeScript)
- **Path aliases** — short names `#/`, `~/` instead of `../../../`

## Import and Export

```typescript
// math.tsc — module with exports
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — import
import { PI, add } from "./math"
console.log(add(1, 2))
```

## Entry Point

The entry point is defined by the `"main"` field in `tsc.package.json`. Top-level code of the entry file becomes the body of `main()` in C:

```typescript
const a: i32 = 1
console.log(a)
```

```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

## Module Initialization

The compiler builds a dependency graph and performs **topological sort**. Each module with module-level variables gets an `_init()` function. The result is a single `tsc_init_all()` with the correct call order.

## C Interop

For interaction with C libraries, TSClang provides several mechanisms:

| Mechanism | Purpose |
|----------|------------|
| `.d.tsc` | Declarations of C types, functions, constants |
| `native` | Inline C code (verbatim) |
| `unsafe {}` | Disabling borrow/type checker |
| `FnPtr<T>` | Function pointers for C callbacks |
| `@platform` | Conditional compilation per platform |

## Subpages

| Page | Description |
|----------|----------|
| [Import / Export](./import-export.md) | Named export/import, namespace import, `import type`, initialization, circular imports, path aliases |
| [.d.tsc Files](./d-tsc.md) | Declarations for C interop: struct, opaque type, functions, constants, MMIO |
| [native — Inline C](./native.md) | Syntax, interpolation, limitations, assembly inserts |
| [unsafe {} — Disabling Checks](./unsafe.md) | When to use, what it disables, difference from `native` |
| [Callbacks and FnPtr\<T\>](./callbacks.md) | Function pointers, TSC_CLOSURE_* macros, closure bridging |
| [@platform — Conditional Compilation](./platform.md) | Platform-dependent implementations, package structure |

## C-output

```c
// result of compiling multiple modules
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... top-level code from main.tsc ...
    return 0;
}
```

## Errors

| Error | Cause |
|--------|---------|
| `cannot determine entry point` | No `"main"` field in `tsc.package.json` |
| `main file not found: src/main.tsc` | File from `"main"` does not exist |
| `circular initialization dependency detected` | Cycle through module-level variables |
| `export default is not allowed` | Attempt to use default export |
| `native block — C code inserted verbatim` | Warning on every `native` block |

## See Also

- [Syntax: Variables](../02-syntax/variables/index.md) — module-level variables
- [Memory: Ownership](../05-memory/ownership-types.md) — owned/borrow when passing between modules
- [Concurrency](../07-concurrency/index.md) — thread-safety for module-level variables
