# Utility Types

[← Up](./index.md) | [Next →](./date.md) | [Previous ←](./type-aliases.md)

---

Utility types — **compile-time type operators**. They do not exist in C: the compiler expands them into concrete struct/enum during type checking.

## Overview

| Utility | Purpose | Example |
|---------|---------|---------|
| `keyof T` | Type keys as string literal union | `keyof User` → `"name" \| "age"` |
| `Partial<T>` | All fields optional | `{ name?: string; age?: i32 }` |
| `Required<T>` | All fields required | Inverse of `Partial` |
| `Readonly<T>` | All fields constant | `const` fields in C |
| `NonNullable<T>` | Remove `null` from type | `string \| null` → `string` |
| `Pick<T, K>` | Select a subset of fields | `Pick<User, "name">` |
| `Omit<T, K>` | Exclude fields | Inverse of `Pick` |
| `Record<K, V>` | Object with keys K and values V | `Record<"x" \| "y", f64>` |
| `ReturnType<T>` | Function return type | `typeof foo` → return type |
| `Parameters<T>` | Function parameters as tuple | `[i32, string]` |
| `Awaited<T>` | Unwrap Promise (recursively) | `Promise<User>` → `User` |

## keyof

`keyof T` — compile-time operator returning a string literal union of the type's keys. Works only inside utility types and type aliases.

```typescript
type User = { name: string; age: i32 }

keyof User  // → "name" | "age"
```

Cannot be used in runtime expressions.

## Partial\<T\>

All fields become optional:

```typescript
type User = { name: string; age: i32 }
type PartialUser = Partial<User>
// → { name?: string; age?: i32 }
```

### C-output

```c
typedef struct {
    opt_string name;  // bool has_value + string
    opt_i32    age;   // bool has_value + int32_t
} PartialUser;
```

### Example: configuration with defaults

```typescript
type Config = { host: string; port: i32; timeout: i32 }

function createConfig(overrides: Partial<Config>): Config {
    return {
        host:    overrides.host    ?? "localhost",
        port:    overrides.port    ?? 8080,
        timeout: overrides.timeout ?? 30000
    }
}
```

## Required\<T\>

All fields become required. Inverse of `Partial`:

```typescript
type User = { name?: string; age?: i32 }
type RequiredUser = Required<User>
// → { name: string; age: i32 }
```

## Readonly\<T\>

All fields become constant:

```typescript
type User = { name: string; age: i32 }
type ReadonlyUser = Readonly<User>
```

```c
typedef struct {
    const char* const name;
    const int32_t     age;
} ReadonlyUser;
```

## NonNullable\<T\>

Removes `null` from the type:

```typescript
type T  = string | null
type NN = NonNullable<T>  // → string
```

## Pick\<T, K\>

Selects a subset of fields. `K` — string literal or literal union (not a variable):

```typescript
type User = { name: string; age: i32; email: string }

type UserName    = Pick<User, "name">
// → { name: string }

type UserContact = Pick<User, "name" | "email">
// → { name: string; email: string }
```

### Example: public API

```typescript
type User = { id: i32; name: string; email: string; passwordHash: string }
type PublicUser = Pick<User, "id" | "name" | "email">

function getUser(id: i32): PublicUser { ... }
```

## Omit\<T, K\>

Excludes fields. Inverse of `Pick`:

```typescript
type UserPublic  = Omit<User, "passwordHash">
type UserMinimal = Omit<User, "age" | "email">
```

## Record\<K, V\>

| K | Result |
|---|--------|
| Literal union (`"x" \| "y"`) | `typedef struct` |
| `enum` | `typedef struct` |
| `string` | `Map<string, V>` (runtime) |

```typescript
type Coords  = Record<"x" | "y", f64>       // → struct { f64 x; f64 y; }
type Point3D = Record<Axis, f64>             // → struct by enum Axis
type StrMap  = Record<string, i32>           // → Map<string, i32>
```

```c
// Record<"x" | "y", f64>
typedef struct { double x; double y; } Coords;

// Record<Axis, f64>  (enum Axis { X, Y, Z })
typedef struct { double x; double y; double z; } Point3D;
```

### Example: vectors

```typescript
type Vec3 = Record<"x" | "y" | "z", f64>

function normalize(v: Vec3): Vec3 {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
    return { x: v.x / len, y: v.y / len, z: v.z / len }
}
```

## ReturnType\<T\>

Extracts the return type of a function. `T` — function type or `typeof function`:

```typescript
function foo(): string { ... }
type R = ReturnType<typeof foo>  // → string
```

## Parameters\<T\>

Function parameters as a tuple:

```typescript
function foo(x: i32, y: string): void { ... }
type P = Parameters<typeof foo>  // → [i32, string]
```

## Awaited\<T\>

Unwrap async/Promise type (recursively):

```typescript
async function fetchData(): Promise<User> { ... }

type U = Awaited<ReturnType<typeof fetchData>>  // → User
type B = Awaited<Promise<Promise<i32>>>         // → i32
```

## A+B rule for generic functions

Utility types in generic functions have limitations:

### A: type alias — always allowed

```typescript
type UserName = Pick<User, "name">       // ✅ ok
type PartialConfig = Partial<Config>     // ✅ ok
```

### B: utility type in generic function parameter — allowed

```typescript
function log<T>(obj: Pick<T, "name">): void {  // ✅ ok
    print(obj.name)
}

function merge<T>(base: T, patch: Partial<T>): T {  // ✅ ok
    // compiler knows concrete T at call site
}
```

### Forbidden: utility type in generic function return type

```typescript
function pick<T, K extends keyof T>(obj: T, key: K): Pick<T, K>
// ❌ error: Pick with runtime-key in return type is not supported in C
```

**Reason:** `{ [key]: obj[key] }` is impossible in C — there is no dynamic field access for structs.

## Unsupported utility types

| Utility | Reason |
|---------|--------|
| `Extract<T, U>` | Requires conditional types |
| `Exclude<T, U>` | Requires conditional types |
| `InstanceType<T>` | No constructor type concept |
| `ThisParameterType<T>` | No OOP `this` semantics |
| `Uppercase<T>` / `Lowercase<T>` | Template literal types |

## Errors

| Code | Error | Solution |
|------|-------|----------|
| `Pick<User, varName>` | `K must be a string literal or literal union, not a variable` | Use a string literal |
| `function f<T>(): Pick<T, "x">` | `Pick with runtime-key in return type is not supported in C` | Return a concrete type alias |
| `Extract<string, "a">` | `Extract is not supported: requires conditional types` | Use `Pick` or a type alias |

## See also

- [Type Aliases](./type-aliases.md) — `type`, `keyof`, string literal union
- [Interfaces](../04-classes/index.md) — structural typing
- [Generics](../04-classes/index.md) — monomorphization of generics
