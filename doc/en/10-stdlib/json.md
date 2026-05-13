# std/json

[← Up](./index.md) | [Next →](./regex.md) | [Previous ←](./string.md)

---

JSON parsing and serialization. May be unavailable on embedded — depends on flash size.

## Import

```typescript
import { JSON, ParseError } from "std/json"
```

## Functions

```typescript
JSON.parse<T>(s: string): T throws ParseError
JSON.stringify(val: T): string
JSON.stringify(val: T, indent: i32): string  // pretty-print
```

## JSON.parse\<T\>

Deserializes a string into type `T`. Type `T` must be:

- primitive (`string`, `bool`, `i32`, `f64`, ...)
- class with public fields (compiler generates deserializer)
- array or `Map<string, V>` of supported types

On invalid JSON throws `ParseError`:

```typescript
try {
    const user = JSON.parse<User>('{"name":"Alice","age":30}')
    console.log(user.name)  // Alice
} catch (e: ParseError) {
    console.log("bad json:", e.message)
}
```

## JSON.stringify

```typescript
const user = new User("Alice", 30)

const json = JSON.stringify(user)          // '{"name":"Alice","age":30}'
const pretty = JSON.stringify(user, 2)    // formatted with indent 2
```

## Example: reading configuration

```typescript
import { JSON, ParseError } from "std/json"
import fs from "std/fs"

interface Config {
    host: string
    port: i32
    debug: boolean
}

async function loadConfig(path: string): Config throws ParseError {
    const text = await fs.readFile(path)
    return JSON.parse<Config>(text)
}

async function main(): Promise<void> {
    try {
        const config = loadConfig("config.json")
        console.log(format("server at %s:%d", config.host, config.port))
    } catch (e: ParseError) {
        console.error("bad config:", e.message)
    }
}
```

## Type limitations

- `undefined` is absent — fields with `null` in JSON map to `null`
- Private class fields are not included in JSON
- Circular references (`Shared<T>`) — runtime error on `stringify`

## Platforms

| Platform | Availability |
|----------|-------------|
| Desktop/server | Always available |
| Embedded (flash ≥ 16KB) | Available |
| Embedded (flash < 16KB) | Compiler error — use `@tsc/json-nano` |

## Errors

| Error | Cause |
|-------|-------|
| `ParseError: unexpected token at position N` | Invalid JSON |
| `ParseError: unexpected end of input` | Incomplete JSON |
| `std/json requires flash ≥ 16KB` | Not enough flash on embedded |
| `circular reference in JSON.stringify` | Circular `Shared<T>` |

## See also

- [std/string](./string.md) — encoding, formatting
- [std/net](./net.md) — `res.json<T>()`, HTTP requests
- [std/fs](./fs.md) — reading JSON files
- [Error handling](../06-errors/index.md) — `throws ParseError`, `try`/`catch`
