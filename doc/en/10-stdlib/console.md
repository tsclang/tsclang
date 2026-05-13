# console

[← Up](./index.md) | [Next →](./math.md) | [Previous ←](./globals.md)

---

Global object for output to standard streams. No import needed. Available on all platforms.

## Output methods

```typescript
console.log(...args)    // stdout
console.error(...args)  // stderr
console.warn(...args)   // stderr, with WARN prefix
console.info(...args)   // stdout, with INFO prefix
console.debug(...args)  // stdout, with DEBUG prefix
```

All methods accept an arbitrary number of arguments, separated by spaces:

```typescript
console.log("user:", user.name, "age:", user.age)
console.error("failed:", err.message)
```

C-output:

```c
// console.log("hello", 42)
tsc_console_log("hello %d", 42);
```

## console.time / timeEnd

Time measurement — convenient sugar over `performance.mark`/`measure`:

```typescript
console.time("parse")
parseData(buf)
console.timeEnd("parse")    // outputs: "parse: 12.3ms"
```

C-output:

```c
// console.time("parse") → tsc_console_time("parse")
// console.timeEnd("parse") → tsc_console_time_end("parse")
```

## console.assert

Conditional error output:

```typescript
console.assert(condition, "message")
// if condition == false → outputs: "Assertion failed: message"
```

## console.trace — desktop only

Simplified trace — call site:

```typescript
console.trace("reached here")
// outputs: "reached here (__FILE__:__LINE__)"
```

Full call stack is unavailable — only call site. On embedded — compiler error.

## Example

```typescript
async function main(): Promise<void> {
    console.log("starting...")

    console.time("load")
    const data = await fs.readFile("data.json")
    console.timeEnd("load")  // "load: 3.2ms"

    console.assert(data.length > 0, "empty data")

    const users = JSON.parse<User[]>(data)
    console.info("loaded", users.length, "users")
}
```

C-output:

```c
void main(void) {
    tsc_console_log("starting...");
    tsc_console_time("load");
    String data = tsc_fs_read_sync("data.json");
    tsc_console_time_end("load");
    // ...
}
```

## Errors

| Error | Cause |
|-------|-------|
| `console.trace is not available on target "avr"` | `console.trace` is desktop only |

## See also

- [Global objects](./globals.md) — `console`, `Math`, `process`, timers
- [Math](./math.md) — mathematical functions
- [std/io](./io.md) — `Reader`/`Writer`, `process.stdin`/`stdout`
- [Error handling](../06-errors/index.md) — `console.assert` and AssertError
