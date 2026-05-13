# throw / try / catch / finally

[← Up](./index.md) | [Next →](./result.md) | [Previous ←](./index.md)

---

TSClang uses the familiar TypeScript syntax `throw`/`try`/`catch`/`finally` for error handling. Under the hood this compiles to Result structs and `if/else` — without `setjmp`/`longjmp`.

## throw

An instance of an `Error` subclass is thrown:

```typescript
class IOError extends Error { }

function readFile(path: string): string throws IOError {
    if (!exists(path)) {
        throw new IOError(`file not found: ${path}`);
    }
    return read(path);
}
```

`throw` is allowed only in functions with a `throws` declaration. Without `throws` — compilation error.

## throws declaration

A function declares error types in its signature:

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

The compiler can infer `throws` automatically if there is a `throw` inside, but explicit declaration serves as documentation.

### Union errors

A function may throw several error types:

```typescript
function process(path: string): Response throws IOError | NetworkError {
    const content = readFile(path);   // throws IOError
    return fetch(content);            // throws NetworkError
}
```

The compiler automatically unions `throws` types when calling functions inside the body.

## try / catch

### Basic try/catch

```typescript
try {
    const content = readFile("data.txt");
    console.log(content);
} catch (e: IOError) {
    console.log(e.message);
}
```

> **The type annotation in `catch` is required.** `catch (e)` without a type is a compile-time error. The compiler needs to know which Result struct the handler corresponds to.

### C-output

```c
_Result_String_IOError _r = readFile(str("data.txt"));
if (_r.ok) {
    String content = _r.value;
    printf("%s\n", content.data);
    String_free(content);
} else {
    IOError e = _r._err;
    printf("%s\n", e.message.data);
    IOError_free(e);
}
```

### Multiple catch blocks

Dispatch by error type — compiled via `_kind`:

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

### C-output: multiple catch

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

### Union catch — multiple types in one block

```typescript
try {
    fetch("https://...");
} catch (e: IOError | NetworkError) {
    console.log("error:", e.message);   // type e = IOError | NetworkError
}
```

### Exhaustive handling inside union catch

Dispatch inside `catch` — via `match` or `instanceof`:

```typescript
// match — exhaustive, _ not needed
try {
    fetch("https://...")
} catch (e: IOError | NetworkError) {
    match (e) {
        IOError { message }   => console.log("io:", message),
        NetworkError { code } => console.log("net:", code),
    }
}
```

```typescript
// instanceof — narrowing with else
try {
    fetch("https://...")
} catch (e: IOError | NetworkError) {
    if (e instanceof IOError) {
        console.log("io:", e.message);      // e: IOError
    } else {
        console.log("net:", e.code);        // e: NetworkError
    }
}
```

Dispatch compiles via `_kind` from the Result struct — without `type_id` in Error, without vtable.

## finally

`finally` runs **always** — both on success and on error:

```typescript
try {
    const content = readFile("data.txt");
    console.log(content);
} catch (e: IOError) {
    console.log(e.message);
} finally {
    cleanup();   // always runs
}
```

### C-output: finally

```c
_Result_String_IOError _r = readFile(str("data.txt"));
if (_r.ok) {
    String content = _r.value;
    printf("%s\n", content.data);
    String_free(content);
} else {
    IOError e = _r._err;
    printf("%s\n", e.message.data);
    IOError_free(e);
}
cleanup();   // called in any case
```

### finally restrictions

- `finally` cannot contain `throw` — compilation error
- `finally` cannot contain `return` — compilation error (undefined behavior)

## Error.stack

`error.stack` is available only on **desktop/server**. Contains `__FILE__:__LINE__` of the `throw` point:

```typescript
try {
    throw new IOError("not found");
} catch (e: IOError) {
    console.log(e.stack);   // "IOError at src/main.tsc:42"
}
```

On **embedded** platforms accessing `stack` is a compilation error.

## Ownership with errors

The compiler tracks all owned variables in the `try` block. On error all already initialized ones are freed through ordinary control flow:

```typescript
function process(): void throws IOError {
    const a = new Foo();     // owned
    const b = new Bar();     // owned
    riskyOp()?;              // if error → a and b are freed
    use(a, b);
}
```

### C-output: cleanup on error

```c
void process(void) {
    Foo* a = Foo_new();
    Bar* b = Bar_new();
    _Result_void_IOError _r = riskyOp();
    if (!_r.ok) {
        Foo_free(a);    // compiler generates cleanup
        Bar_free(b);
        return (_Result_void_IOError){ .ok = false, ._err = _r._err };
    }
    use(a, b);
    Foo_free(a);
    Bar_free(b);
}
```

No special mechanisms — just `if/else` in C, the compiler knows all owned variables on every execution path.

## Errors

| Error | Cause |
|--------|---------|
| `throw in non-throws function` | `throw` in a function without a `throws` declaration |
| `throw/return in finally` | `throw` or `return` inside a `finally` block |
| `error.stack on embedded` | Accessing `.stack` on an embedded platform |
| `unreachable pattern in catch match` | `_` in exhaustive match inside union catch |

## See also

- [Error Handling — Overview](./index.md) — general principles and Result structs
- [Result structs](./result.md) — Result<T, E> structure in C-output
- [? and ! operators](./operators.md) — propagate and unwrap
- [Memory Model: Auto Drop](../05-memory/auto-drop.md) — `goto cleanup` and deallocation on errors
