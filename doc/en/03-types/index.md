# Type System

[← Up](../index.md) | [Next →](./numbers.md)

---

TSClang's type system is static, with type inference and three levels of safety: compile-time checks, ownership/borrow checker, and optional ARC.

## Two Levels of Typing

TSClang separates types into **structural** and **nominal**:

| Construct | Typing | Object Literals | C-output |
|-----------|--------|-----------------|----------|
| `type Foo = { ... }` | Structural | ✅ | `typedef struct`, methods forbidden |
| `interface Foo { ... }` | Structural | ✅ (if no methods) | `typedef struct` or fat pointer + vtable |
| `class Foo { ... }` | **Nominal** | ❌ | struct + methods |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // ok — structural compatibility
const v: Vector = p                     // ok — same fields

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // error — class is nominal
```

Key difference `type` vs `interface`:
- `type Point = { x: f64; y: f64 }` — **guaranteed** data struct without vtable. Methods are forbidden by compiler error. Use for embedded MMIO, binary structs, ABI-critical code.
- `interface Point { x: f64; y: f64 }` — data struct for now, but can be extended with methods in the future (then ABI will switch to vtable).

## Type inference

Type is inferred if not explicitly specified:

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — anonymous struct
const s = "hello"            // → string
const n = 42                 // → number (= f64 on desktop)
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[] (= f64[])
```

Explicit annotation overrides: `const i: i32 = 1` → `i32`.

## Numeric type autocast

Three mechanisms, applied sequentially. First applicable wins.

### Mechanism 1 — type-level widening (let and const)

Works only on types, doesn't look at values. Unconditionally safe.

| From | To | Comment |
|------|-----|---------|
| `i8`/`i16`/`i32` | `i64` | same-sign, no loss |
| `u8`/`u16`/`u32` | `u64` | same-sign, no loss |
| `u8` | `i16` | all 256 values fit |
| `u16` | `i32` | all 65,536 fit |
| `u32` | `i64` | all 4.3G fit |
| `i32`, `u32` | `f64` | no loss (53-bit mantissa) |
| `f32` | `f64` | no loss |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 always fits in i64
```

### Mechanism 2 — compile-time value analysis (const only)

When both operands are `const` with known literal values and mechanism 1 doesn't apply. Step-by-step algorithm — see [Numeric Types → Autocast](./numbers.md).

### Mechanism 3 — explicit `as` (for let)

If mechanism 1 doesn't apply to `let` variables — explicit cast is required:

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // error — no type-level widening
let c: f64 = (a + (b as i64)) as f64  // ok
```

Details for each mechanism — on the [Numeric Types](./numbers.md) page.

## Subpages

| Page | Description |
|------|-------------|
| [Numeric Types](./numbers.md) | i8..i64, u8..u64, f32, f64, usize, number, autocast, `as` |
| [Strings](./strings.md) | UTF-8 strings, literals, methods, std/string |
| [Special Types](./special-types.md) | any, never, void, unknown |
| [Null](./null.md) | Nullable types, optional chaining, `??` |
| [Arrays](./arrays.md) | Dynamic, fixed, Slice<T> |
| [Map and Set](./map-set.md) | Hash tables and sets |
| [Tuples](./tuples.md) | Tuples, labeled, readonly, optional, rest |
| [Clone](./clone.md) | Explicit cloning of owned values |
| [Type Aliases](./type-aliases.md) | `type`, opaque aliases, String Literal Union |
| [Utility Types](./utility-types.md) | Partial, Required, Readonly, Pick, Omit, Record, etc. |
| [Date](./date.md) | Legacy JS-compatible date/time type |

## Errors

| Error | Cause |
|-------|-------|
| `expected f64, got i32` | Incompatible numeric types without autocast |
| `empty object literal is forbidden` | Empty `{}` — use `Map<K,V>` or declare type |
| `cannot use "void" as variable type` | `void` only for function return type |
| `non-nullable runtime union: string \| i32` | Non-nullable union forbidden, use interface or discriminated union |

## See also

- [Variables: let / const](../02-syntax/variables/index.md) — impact of `let`/`const` on types and autocast
- [Memory Model](../05-memory/index.md) — ownership, `Ref<T>`, `Mut<T>`
- [Classes and Interfaces](../04-classes/index.md) — nominal typing, generics
- [Error Handling](../06-errors/index.md) — `throws`, `T | null` vs `T throws E`
