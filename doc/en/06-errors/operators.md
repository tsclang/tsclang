# ? and ! Operators

[← Up](./index.md) | [Previous ←](./result.md)

---

TSClang provides two postfix operators for working with errors: `?` (propagate) and `!` (unwrap/panic).

## ? operator — propagate

`expr?` — if the expression returned an error, immediately return it from the current function. The current function must have a compatible `throws` type.

### Basic usage

```typescript
function process(path: string): string throws IOError | NetworkError {
    const content = readFile(path)?;    // propagate IOError
    const r = fetch(content)?;          // propagate NetworkError
    return r.body;
}
```

If `readFile` or `fetch` return an error — it is immediately returned from `process`.

### C-output

```c
_Result_String_IOError _r = readFile(str(path));
if (!_r.ok) {
    return (_Result_String_NetworkError){ .ok = false, ._err = _r._err };
}
String content = _r.value;

_Result_Response_NetworkError _r2 = fetch(content);
if (!_r2.ok) {
    String_free(content);
    return (_Result_String_NetworkError){ .ok = false, ._err = _r2._err };
}
```

The error is wrapped in the Result type of the current function. Owned variables already initialized at the time of the error are freed by the compiler (`String_free(content)`).

### throws compatibility

The error type of the propagate expression must be a subset of the current function's `throws`:

```typescript
function process(): void throws IOError | NetworkError {
    readFile("x")?;    // ok: IOError ∈ throws
    fetch("y")?;       // ok: NetworkError ∈ throws
}

function onlyIO(): void throws IOError {
    readFile("x")?;    // ok: IOError ∈ throws
    fetch("y")?;       // error: NetworkError ∉ throws
}
```

### ? without throws — compilation error

```typescript
function main(): void {
    const data = readFile("x")?;
    // error: main does not declare throws, cannot use ?
}
```

### ? in a call chain

```typescript
function process(): string throws IOError {
    return readFile("data.txt")?.trim();
}
```

If `readFile` returns an error — `trim()` is not called, the error is propagated.

## ! operator — unwrap / panic

`expr!` — if the expression returned an error, call `abort()` (runtime panic). Does not require `throws` in the current function.

### Basic usage

```typescript
function main(): void {
    const content = readFile("config.txt")!;   // panic on error
    console.log(content);
}
```

### C-output

```c
_Result_String_IOError _r = readFile(str("config.txt"));
if (!_r.ok) {
    fprintf(stderr, "panic\n");
    abort();
}
String content = _r.value;
```

On error — immediate `abort()` without cleanup. Use `!` only when the error is "impossible" or when crashing is acceptable behavior.

### When to use !

- Configuration files that must exist
- Invariant checks in development mode
- Points where continuing after an error is meaningless

### When NOT to use !

- In library code — use `?` or `try/catch`
- When working with user input
- In network/IO operations where errors are expected

## Operator comparison

| Property | `?` | `!` |
|----------|-----|-----|
| Behavior on error | Propagate to caller | `abort()` (panic) |
| Requires `throws` | Yes | No |
| Cleanup owned variables | Yes — compiler generates `_free()` | No — `abort()` without cleanup |
| Usage | Library code, ordinary functions | `main()`, invariant checks |

## Propagate with cleanup

The compiler tracks owned variables on `?`:

```typescript
function process(): string throws IOError {
    const buf = new Buffer();
    const content = readFile("data.txt")?;   // if error → buf is freed
    buf.write(content);
    return buf.toString();
}
```

### C-output: cleanup on propagate

```c
_Result_String_IOError process(void) {
    Buffer buf = Buffer_new();
    _Result_String_IOError _r = readFile(str("data.txt"));
    if (!_r.ok) {
        Buffer_free(buf);    // cleanup before propagate
        return (_Result_String_IOError){ .ok = false, ._err = _r._err };
    }
    String content = _r.value;
    Buffer_write(&buf, content);
    String result = Buffer_toString(&buf);
    Buffer_free(buf);
    return (_Result_String_IOError){ .ok = true, .value = result };
}
```

## Errors

| Error | Cause |
|--------|---------|
| `? operator in non-throws function` | `?` in a function without a `throws` declaration |
| `incompatible throws type` | Error type is not in the current function's `throws` |
| `unwrap of non-Result expression` | `?` or `!` on an expression that does not return Result |

## See also

- [Error Handling — Overview](./index.md) — general principles and Result structs
- [throw / try / catch / finally](./throw-try.md) — full error handling
- [Result structs](./result.md) — Result<T, E> structure in C-output
- [Memory Model: Owner](../05-memory/owner.md) — ownership and cleanup on propagate
