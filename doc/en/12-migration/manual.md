# Manual migration

[← Up](./index.md) | [Next →](./incompatible.md) | [Previous ←](./automatic.md)

---

Some TypeScript code ports without changes, but certain patterns require manual editing — they cannot be safely automated.

## Works as-is

The following TypeScript code compiles in TSClang without changes:

```typescript
// Interfaces
interface User {
    name: string
    age: i32
}

// Functions with types
function greet(u: User): string {
    return `Hello, ${u.name}`
}

// Arrow functions
const add = (a: i32, b: i32): i32 => a + b

// Classes (without extends)
class Counter {
    private count: i32 = 0
    increment(): void { this.count++ }
    get(): i32 { return this.count }
}

// Generics
function first<T>(arr: T[]): T | null {
    return arr.length > 0 ? arr[0] : null
}

// try/catch
try {
    const data = readFile("x.txt")
} catch (e: IOError) {
    console.log(e.message)
}

// Template strings
const msg = `User ${user.name} has ${user.age} years`

// Destructuring
const { name, age } = user
const [first, ...rest] = arr
```

## Requires manual editing

### `s[i]` — returns `u8`, not `string`

In TypeScript `s[0]` returns the first character as `string`. In TSClang — a UTF-8 byte as `u8`.

```typescript
// TypeScript:
const ch: string = s[0]   // first character

// TSClang:
const byte: u8 = s[0]     // UTF-8 byte, not a character!
const ch: string = s[0..1] // single-byte slice as string
// or:
import { graphemeAt } from "std/string"
const ch = graphemeAt(s, 0)  // correct for Unicode
```

### `for (let x of arr)` with `const arr`

The borrow checker requires `const` in the iterator for immutable collections:

```typescript
// TypeScript:
const arr = [1, 2, 3]
for (let x of arr) { ... }  // ok

// TSClang:
const arr = [1, 2, 3]
for (const x of arr) { ... }  // const — borrow checker requires
// let x creates move semantics, which does not work for primitives in for-of
```

### Class inheritance → composition

Class inheritance (except `extends Error`) is prohibited. Use interfaces + composition:

```typescript
// TypeScript:
class Animal { speak(): string { return "..." } }
class Dog extends Animal { speak(): string { return "Woof" } }

// TSClang — interface + implementation:
interface Animal {
    speak(): string
}

class Dog implements Animal {
    speak(): string { return "Woof" }
}

// Reusing implementation — via embedding:
class Dog implements Animal {
    private base: BaseAnimal = new BaseAnimal()
    speak(): string { return this.base.speak() }
    bark(): string { return "Woof" }
}
```

### `??` — ownership semantics

The `??` operator works similarly to TypeScript, but moves the left-hand side:

```typescript
// TypeScript:
const x = maybeNull ?? defaultValue  // if null — take default

// TSClang — same, but ?? moves maybeNull:
const x = maybeNull ?? defaultValue
// Cannot use maybeNull after ?? — ownership has moved
```

### Numeric types — explicit annotations

TypeScript `number` is equivalent to `f64`. For other numeric types, an explicit annotation is needed:

```typescript
// TypeScript:
let x = 42           // number (f64)
let y = 3.14         // number

// TSClang — same behavior (number = f64):
let x = 42           // f64 (via number — same as TypeScript)
let y = 3.14         // f64
let z: i64 = 42      // explicitly i64
let n: i32 = 42      // explicitly i32
let w: f32 = 3.14    // explicitly f32 — will be truncated!
```

### `string.slice()` — bytes, not characters

```typescript
// TypeScript:
const sub = s.slice(1, 3)  // substring of characters 1..2

// TSClang — slice by bytes (not characters):
const sub = s.slice(1, 3)  // bytes 1..2 — may cut a UTF-8 codepoint!

// Safe for ASCII. For Unicode — sliceChars by codepoint indices:
import { sliceChars } from "std/string"
const sub = sliceChars(s, 1, 3)  // codepoints 1..2
```

## C-output: migration example

TypeScript code after migration:

```typescript
function greet(name: string | null): string {
    const n = name ?? "World"
    return `Hello, ${n}`
}
```

Compiles to:

```c
String greet(Option_String name) {
    String n = name.ok ? name.value : str("World");
    if (name.ok) String_free(name.value);
    String _tmp = format(str("Hello, %s"), n.data);
    String_free(n);
    return _tmp;
}
```

## Errors

| Error | Cause |
|-------|-------|
| `type error: string expected, got u8` | `s[i]` returns `u8` — use `s[i..j]` or `graphemeAt` |
| `cannot move out of const context` | `for (let x of arr)` — replace `let` with `const` |
| `extends is not supported` | Class inheritance — replace with composition |
| `use after move` | Variable used after `??` — ownership has moved |
| `possible truncation` | Assigning `f64` to `f32` — explicit annotation |

## See also

- [Automatic migration](./automatic.md) — what `tsclang migrate` does automatically
- [Incompatible patterns](./incompatible.md) — constructs with no equivalent
- [Types: Numbers](../03-types/numbers.md) — TSClang numeric types
- [Types: Strings](../03-types/strings.md) — string operations, UTF-8
- [Memory model: Owner](../05-memory/owner.md) — move and ownership
