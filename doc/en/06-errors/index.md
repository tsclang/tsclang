# Error Handling

[← Up](../index.md) | [Next →](./throw-try.md)

---

TSClang uses `throw`/`try`/`catch`/`finally` syntax like TypeScript, but compiles errors into **Result structs in C** — without `setjmp`/`longjmp`. This provides:

- **Zero-cost**: no register saving on every `try` block
- **Safe C interop**: no `longjmp` through third-party C code
- **Correct ownership**: ordinary control flow, the compiler knows all owned variables

## Principle

Every function that can fail declares `throws` in its signature. In C-output the return type is wrapped in a Result struct with an `ok` field and a union for the value or error. `try`/`catch` handlers compile into ordinary `if/else` on the `ok` field and `_kind`.

## Key concepts

### throws declaration

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Without `throws` — a function cannot contain `throw` (compilation error).

### Error — base class

All errors inherit from `Error`:

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // desktop only — "__FILE__:__LINE__" throw points
}
```

### ? and ! operators

| Operator | Semantics | Requires `throws`? |
|----------|-----------|-------------------|
| `expr?`  | Propagate — return the error from the current function | Yes |
| `expr!`  | Unwrap — panic (`abort()`) on error | No |

### Result struct in C

```c
typedef struct {
    bool ok;
    union {
        Response value;
        struct {
            _fetch_err_kind _kind;
            union {
                IOError io;
                NetworkError net;
            } _err;
        };
    };
} _Result_Response_IOError_NetworkError;
```

### Ownership with errors

The compiler tracks all owned variables in a `try` block. On error all already initialized owned variables are freed through ordinary control flow (`goto cleanup`).

## Subpages

| Page | Description |
|----------|----------|
| [throw / try / catch / finally](./throw-try.md) | Error handling syntax, catch by type, finally |
| [Result structs](./result.md) | Result<T, E>, discriminated union, C representation |
| [? and ! operators](./operators.md) | Propagate, unwrap/panic, C-output |

## Errors

| Error | Cause |
|--------|---------|
| `throw in non-throws function` | `throw` in a function without `throws` |
| `? operator in non-throws function` | `?` operator without `throws` in the current function |
| `extern "C" cannot throw` | `throws` in an `extern "C"` function |
| `throw/return in finally` | `throw` or `return` inside a `finally` block |
| `error.stack on embedded` | Accessing `stack` on an embedded platform |

## Restrictions

- `throw` is forbidden in functions without `throws`
- `?` is forbidden in a function without `throws`
- Exceptions cannot be thrown across C interop boundaries — `extern "C"` cannot contain `throws`
- `finally` cannot contain `throw` or `return`
- `error.stack` is unavailable on embedded platforms

## See also

- [Memory Model: Auto Drop](../05-memory/auto-drop.md) — `goto cleanup` with multiple exit points
- [Memory Model: Owner](../05-memory/owner.md) — move and ownership with errors
- [Classes](../04-classes/index.md) — Error inheritance and custom error types
