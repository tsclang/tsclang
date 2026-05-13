# Global Objects

[← Up](./index.md) | [Next →](./console.md) | [Previous ←](./index.md)

---

Global objects and functions — no import needed. Available on all platforms unless stated otherwise.

## console

Detailed documentation — [console](./console.md).

```typescript
console.log("hello")
console.error("error")
console.warn("warning")
console.info("info")
console.debug("debug")
console.time("op")
console.timeEnd("op")
```

## Math

Detailed documentation — [Math](./math.md).

```typescript
Math.PI            // 3.141592653589793
Math.abs(-5)       // 5
Math.floor(4.7)    // 4.0
Math.sqrt(9.0)     // 3.0
Math.random()      // f64 — [0.0, 1.0)
```

## Timers

```typescript
const id = setTimeout(() => console.log("hello"), 1000)  // i64 — timer id
clearTimeout(id)

const tick = setInterval(() => update(), 100)  // i64 — interval id
clearInterval(tick)
```

`setTimeout` and `setInterval` return `i64` — timer identifier. Available on all platforms.

## sleep

```typescript
await sleep(500)  // pause 500ms
```

Available on all platforms. Used only inside `async` functions.

## performance

High-resolution timer.

```typescript
performance.now()  // f64 — milliseconds since program start
```

### performance.mark / measure — desktop only

```typescript
performance.mark("start")
// ... work ...
performance.mark("end")
const entry = performance.measure("my-work", "start", "end")
// entry: { name: string, duration: f64, startTime: f64 }
```

## process — desktop/server only

```typescript
process.exit(0)
process.argv   // string[] — command line arguments
process.env    // Map<string, string> — environment variables
```

On embedded targets `process.*` — compiler error (no OS, no process).

### process.stdin / stdout / stderr

```typescript
const line = await process.stdin.readLine()   // string | null (null = EOF)
const all  = await process.stdin.readAll()     // string

await process.stdout.write("hello")
await process.stderr.write("error\n")
```

`process.stdin` implements `Reader`, `process.stdout` / `process.stderr` — `Writer` (see [std/io](./io.md)).

## Error

Base class for all errors — no import needed.

```typescript
class Error {
    message: string
    constructor(message: string) { this.message = message }
}
```

`throw` accepts only instances of classes inheriting `Error`:

```typescript
class IOError extends Error { }
class NetworkError extends Error {
    code: i32
    constructor(msg: string, code: i32) {
        super(msg)
        this.code = code
    }
}

throw new IOError("not found")           // ok
throw new NetworkError("timeout", 408)   // ok
throw "oops"                             // error: string is not Error
throw new MyClass()                      // error: MyClass does not extend Error
```

## Map\<K, V\>

Global hash map with open addressing. No import needed.

**Valid key types K:** primitives (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`), `string`, `enum`. Classes and interfaces — compiler error.

```typescript
const m = new Map<string, i32>()

m.set("alice", 42)             // void — move value into map
const v = m.get("alice")       // i32 | null
const v = m.get("alice") ?? 0  // default via ??

m.has("alice")    // boolean
m.delete("alice") // i32 | null — deleted value or null
m.size            // i32, readonly

for (const [key, value] of m) { }   // by pairs
for (const key of m.keys()) { }
for (const value of m.values()) { }

m.clear()  // void — removes all elements
```

### Ownership

- `m.set(key, value)` — move `value` into map
- `m.get(key)` — `Ref<V> | null` for complex types, `V | null` for primitives
- `m.delete(key)` — owned value or `null`

```typescript
const users = new Map<string, User>()
users.set("alice", new User("Alice", 30))  // move

const u: Ref<User> | null = users.get("alice")  // borrow
if (u != null) console.log(u.name)
```

### Map on embedded

On `allocator: "static"` — `new Map<K,V>(N)` with compile-time capacity:

```typescript
@static const hotkeys = new Map<u8, Action>(16)  // 16 slots in BSS
```

On `allocator: "none"` — `Map` is unavailable. Alternatives: `switch`, array by index, `HashMap<K,V,N>` from `std/embedded`, `StaticMap`.

## Buffer

Byte buffer. No import needed.

```typescript
const buf = Buffer.alloc(1024)
const buf = Buffer.alloc(256, 0xFF)
const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f])
const buf = Buffer.from("hello", "utf8")
const buf = Buffer.from("aGVsbG8=", "base64")

buf.length              // usize, readonly
buf[0]                  // u8 — read
buf[0] = 0xFF           // write

buf.view(4, 12)         // Slice<u8> — zero-copy view
buf.viewMut(0, 4)       // MutSlice<u8> — mutable view

buf.copy(target, targetStart?, sourceStart?, sourceEnd?)  // usize
buf.fill(value: u8, start?, end?)                         // void
buf.indexOf(value: u8, start?)                            // i32, -1 if not found

buf.toString("utf8")    // string — "utf8" | "ascii" | "hex" | "base64"
```

## DataView

Read/write primitives in `Buffer` at arbitrary offsets with endianness control.

```typescript
const buf = Buffer.alloc(64)
const dv = new DataView(buf)         // entire buffer
const dv = new DataView(buf, 4, 16)  // byteOffset=4, byteLength=16

dv.getU8(offset)
dv.getI16(offset, littleEndian?)   // littleEndian default = false (big-endian)
dv.getU32(offset, littleEndian?)
dv.getF64(offset, littleEndian?)
// ... similarly for I8, U16, I32, U64, I64, F32

dv.setU8(offset, value)
dv.setU32(offset, value, littleEndian?)
// ... similarly for all types
```

## Errors

| Error | Cause |
|-------|-------|
| `string is not assignable to Error` | `throw` accepts only `Error` descendants |
| `class MyClass does not extend Error` | Class thrown in `throw` without `Error` inheritance |
| `std/fs is not available on target "avr"` | `process.*` on embedded |
| `map overflow: capacity N exceeded` | Static `Map` overflow on embedded |

## See also

- [console](./console.md) — detailed logging API
- [Math](./math.md) — constants and mathematical functions
- [std/io](./io.md) — `Reader`, `Writer`, `process.stdin`/`stdout`
- [std/hal and embedded](./hal.md) — `HashMap<K,V,N>`, `StaticMap` for embedded
- [Error handling](../06-errors/index.md) — `throw`/`try`/`catch`, `throws`
