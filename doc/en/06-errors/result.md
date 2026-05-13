# Result Structs

[← Up](./index.md) | [Next →](./operators.md) | [Previous ←](./throw-try.md)

---

`throws` in a function signature wraps the return type in a **Result struct** in C-output. This is a discriminated union with an `ok` field for distinguishing the normal value from the error.

## Result structure

For the function `fetch(url: string): Response throws IOError | NetworkError` the compiler generates:

```c
typedef enum { _ERR_IO, _ERR_NETWORK } _fetch_err_kind;

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

_Result_Response_IOError_NetworkError fetch(String url) { ... }
```

### Fields

| Field | Type | Description |
|------|-----|----------|
| `ok` | `bool` | `true` — value, `false` — error |
| `value` | `Response` | Normal return value (when `ok == true`) |
| `_kind` | `_fetch_err_kind` | Error type discriminator (when `ok == false`) |
| `_err` | anonymous union | Specific error data (when `ok == false`) |

## Naming

- Result type: `_Result_<ReturnType>_<Err1>_<Err2>_...`
- Error kind enum: `<func>_err_kind` with values `_ERR_<TYPE>`
- For a single error type `_kind` is not generated — the error is stored directly in `_err`

### Example: single error type

```typescript
function readFile(path: string): string throws IOError { ... }
```

```c
typedef struct {
    bool ok;
    union {
        String value;
        IOError _err;
    };
} _Result_String_IOError;

_Result_String_IOError readFile(String path) { ... }
```

### Example: void with error

```typescript
function process(): void throws IOError { ... }
```

```c
typedef struct {
    bool ok;
    IOError _err;
} _Result_void_IOError;

_Result_void_IOError process(void) { ... }
```

When `ok == true` and the return type is `void` — `value` is absent.

## Dispatch by _kind

`try`/`catch` compiles to `if/else` on the `ok` and `_kind` fields:

```typescript
try {
    const r = fetch("https://...");
    process(r);
} catch (e: IOError) {
    console.log("IO:", e.message);
} catch (e: NetworkError) {
    console.log("Network:", e.message);
}
```

```c
_Result_Response_IOError_NetworkError _r = fetch(str("https://..."));
if (_r.ok) {
    Response r = _r.value;
    process(r);
    Response_free(r);
} else if (_r._kind == _ERR_IO) {
    IOError e = _r._err.io;
    printf("IO: %s\n", e.message.data);
    IOError_free(e);
} else if (_r._kind == _ERR_NETWORK) {
    NetworkError e = _r._err.net;
    printf("Network: %s\n", e.message.data);
    NetworkError_free(e);
}
```

Dispatch via `_kind` — without `type_id` in Error, without vtable. The compiler knows all variants from the `throws` declaration.

## _free and ownership

Each `catch` branch receives ownership of the error object. The compiler generates `<Type>_free()` at the end of the catch block:

```c
if (_r.ok) {
    Response r = _r.value;
    process(r);
    Response_free(r);       // cleanup on success
} else if (_r._kind == _ERR_IO) {
    IOError e = _r._err.io;
    printf("IO: %s\n", e.message.data);
    IOError_free(e);        // error cleanup
} else if (_r._kind == _ERR_NETWORK) {
    NetworkError e = _r._err.net;
    printf("Network: %s\n", e.message.data);
    NetworkError_free(e);   // error cleanup
}
```

Owned variables from the `try` block are also freed on error — the compiler inserts `_free()` in the `else` branch.

## Propagate via Result

The `?` operator returns the error through the calling function's Result struct:

```typescript
function process(path: string): string throws IOError | NetworkError {
    const content = readFile(path)?;   // propagate IOError
    const r = fetch(content)?;         // propagate NetworkError
    return r.body;
}
```

```c
_Result_String_IOError _r1 = readFile(str(path));
if (!_r1.ok) {
    return (_Result_String_NetworkError){ .ok = false, ._err = _r1._err };
}
String content = _r1.value;

_Result_Response_NetworkError _r2 = fetch(content);
if (!_r2.ok) {
    String_free(content);
    return (_Result_String_NetworkError){ .ok = false, ._err = _r2._err };
}
```

The error is "wrapped" in the current function's Result type and returned immediately.

## Result on embedded

The Result struct is placed on the stack. For large value types on memory-constrained platforms (AVR: stack 256–2048 bytes) this may be noticeable:

```typescript
// Matrix4x4 = 64 bytes → _Result_Matrix4x4_Error ≈ 65 bytes on stack
function getMatrix(): Matrix4x4 throws Error { ... }
```

The compiler accounts for Result structs in worst-case stack analysis and warns on overflow. Alternative — out parameter:

```typescript
function getMatrix(out: Mut<Matrix4x4>): void throws Error { ... }
```

## Errors

| Error | Cause |
|--------|---------|
| `throw in non-throws function` | Function without `throws` contains `throw` |
| `extern "C" cannot throw` | `throws` in an `extern "C"` function — Result struct violates ABI |
| `stack size exceeded on embedded` | Result struct too large for embedded stack |

## See also

- [Error Handling — Overview](./index.md) — general principles
- [throw / try / catch / finally](./throw-try.md) — error handling syntax
- [? and ! operators](./operators.md) — propagate and unwrap via Result
- [Memory Model: Auto Drop](../05-memory/auto-drop.md) — `_free()` on cleanup
