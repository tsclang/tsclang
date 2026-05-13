# New features in TSClang

[← Up](./index.md) | [Previous ←](./incompatible.md)

---

TSClang adds features that do not exist in TypeScript. They are driven by systems programming requirements: memory management, predictable behavior, embedded platforms.

## Ownership system

TSClang uses a Rust-like ownership model instead of a garbage collector. Every type can be used in one of four forms:

| Form | Notation | Semantics |
|------|----------|-----------|
| Owned | `T` | Single owner, freed on scope exit |
| Immutable borrow | `Ref<T>` | Borrow for read-only access |
| Mutable borrow | `Mut<T>` | Borrow for read and write access |
| Shared ownership | `Shared<T>` | Reference counting, freed on last drop |

```typescript
function process(data: string): void {
    const len = data.length     // borrow — does not move
    consume(data)               // move — data is no longer available
    // console.log(data)        // error: use after move
}
```

More details — in the [Memory model](../05-memory/index.md) section.

## throws — explicit error declaration

Unlike TypeScript, where any function can `throw` anything, TSClang requires explicit declaration of error types in the signature:

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

The compiler checks that `throw` and the `?` operator are used only in functions with `throws`.

### C-output

```c
typedef struct {
    bool ok;
    union {
        String value;
        struct {
            _readFile_err_kind _kind;
            union { IOError io; } _err;
        };
    };
} _Result_String_IOError;
```

More details — in the [Error handling](../06-errors/index.md) section.

## `mut` methods

Methods that modify `this` must be marked `mut`:

```typescript
class Counter {
    private count: i32 = 0

    increment(): void mut { this.count++ }     // modifies this
    get(): i32 { return this.count }            // read-only
}
```

This allows the compiler to track borrows at the method level. Calling a `mut` method on `Ref<T>` is a compilation error.

## match — pattern matching

Full pattern matching, which does not exist in TypeScript:

```typescript
match (value) {
    0               => console.log("zero"),
    n if n < 10     => console.log(`small: ${n}`),
    _               => console.log("big"),
}

// Destructuring in match:
match (result) {
    Ok(value)   => process(value),
    Err(e)      => console.log(e.message),
}

// Match by type in union:
match (shape) {
    Circle { radius }    => Math.PI * radius * radius,
    Rect { w, h }        => w * h,
}
```

More details — in the [Syntax: Match](../02-syntax/match/syntax.md) section.

## `?` operator — propagate errors

Shorthand for `return on error`, analogous to Rust:

```typescript
function process(): string throws IOError {
    const content = readFile("data.txt")?    // if IOError — return from function
    return content.trim()
}
```

### C-output

```c
_Result_String_IOError _r = readFile(str("data.txt"));
if (!_r.ok) return (_Result_String_IOError){ .ok = false, ._err = _r._err };
String content = _r.value;
```

## Fixed-size arrays `T[N]`

Fixed-size stack arrays — no heap allocation:

```typescript
const buf: u8[256] = [0]     // 256 bytes on the stack
const matrix: f64[3][3] = [[0]]  // 2D array
```

### C-output

```c
uint8_t buf[256] = {0};
double matrix[3][3] = {{0}};
```

## `as` — wrap/truncation (not UB)

Type casting via `as` is always defined — wrap or truncation, never undefined behavior:

```typescript
const x: u8 = 300 as u8    // 44 (wrap around)
const y: i32 = 3.14 as i32 // 3   (truncation)
```

### C-output

```c
uint8_t x = (uint8_t)300;     // defined wrap
int32_t y = (int32_t)3.14;    // defined truncation
```

## Platform profiles

Conditional compilation without a preprocessor — for desktop and embedded:

```typescript
// @if desktop
function getEnv(): string { return process.env.HOME }

// @if embedded
function getEnv(): string { return "/flash" }
```

The compiler selects the implementation based on the target platform. More details — in the [Modules: Platform](../08-modules/platform.md) section.

## Extension methods

Adding methods to foreign types without inheritance:

```typescript
extension string {
    isDigit(): bool { return this >= "0" && this <= "9" }
}

const check = "5".isDigit()   // true
```

## `@embedded.*` annotations

For embedded platforms — ISR, inline, no-heap:

```typescript
@embedded.isr("TIMER0_COMPA")
onTimer(): void {
    counter++
}

@embedded.inline
fastPath(x: i32): i32 { return x * 2 }

@embedded.noHeap
function baremetal(): void {   // prohibits heap allocation in the body
    const buf: u8[64] = [0]    // stack only
}
```

## Errors

| Error | Cause |
|-------|-------|
| `throw in non-throws function` | `throw` or `?` without `throws` in the signature |
| `cannot call mut method on Ref<T>` | Attempting to modify via immutable borrow |
| `non-exhaustive match` | Not all variants are covered in `match` |
| `use after move` | Accessing a variable after passing ownership |
| `heap allocation in @noHeap function` | `new` or heap operation in a no-heap context |

## See also

- [Memory model](../05-memory/index.md) — ownership, borrow checker, Ref/Mut/Shared
- [Error handling](../06-errors/index.md) — throws, Result, `?` and `!` operators
- [Syntax: Match](../02-syntax/match/syntax.md) — pattern matching
- [Modules: Platform](../08-modules/platform.md) — conditional compilation
- [Classes: Decorators](../04-classes/decorators.md) — `@embedded.*` and other annotations
