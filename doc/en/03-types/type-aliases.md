# Type Aliases — Type Aliases

[← Up](./index.md) | [Next →](./utility-types.md) | [Previous ←](./clone.md)

---

`type` — compile-time type alias. Does not create a new runtime type — the compiler substitutes the original type everywhere the alias is used.

## Primitive alias

```typescript
type UserId = i32
type Timestamp = i64

function getUser(id: UserId): User { ... }
```

`UserId` and `i32` are **interchangeable** — no new C type is created:

```c
// getUser(id: UserId) → getUser(int32_t id)
User getUser_i32(int32_t id) { ... }
```

> **Note:** `type UserId = i32` is a **compile-time alias**, not a nominal type. You cannot overload a function by alias: `function f(id: UserId)` and `function f(id: i32)` — the same type.

## Object alias (struct)

```typescript
type Point = { x: f64, y: f64 }

let p: Point = { x: 1.0, y: 2.0 }
```

Generates `typedef struct` in C. Methods are **forbidden** — compiler error:

```c
typedef struct { double x; double y; } Point;

Point p = { .x = 1.0, .y = 2.0 };
```

### type vs interface

| Construct | Methods | C-output | Structural compatibility |
|-----------|---------|----------|--------------------------|
| `type Point = { x: f64 }` | Forbidden — error | Always `typedef struct` | ✅ |
| `interface Point { x: f64 }` | Allowed | Without methods: `typedef struct`; with methods: fat pointer (vtable) | ✅ |

Use `type` when you definitely need only data (embedded MMIO, binary structures, ABI-critical code). Use `interface` when methods may be added in the future.

## Nullable type

The only allowed union in TSClang is `T | null`:

```typescript
type Nullable<T> = T | null  // generic alias

function find(id: i32): Nullable<User> { ... }
// equivalent to: User | null
```

```c
// Nullable<User> → opt_User (bool has_value + User value)
typedef struct { bool has_value; User value; } opt_User;
```

## Function type

For callbacks and function signatures:

```typescript
type Callback = (x: i32) => void
type Comparator<T> = (a: Ref<T>, b: Ref<T>) => i32

function sort(arr: Mut<i32[]>, cmp: Comparator<i32>): void { ... }
```

```c
// Comparator<i32> — function pointer
typedef int32_t (*Comparator_i32)(const int32_t* a, const int32_t* b);

void sort_Mut_Array_i32(Array_i32* arr, Comparator_i32 cmp);
```

## Non-nullable union is forbidden

```typescript
// ❌ FORBIDDEN
type StringOrInt = string | i32       // compiler error
function process(x: string | i32) {}  // compiler error
```

**Reason:** in C there is no type for "string or number" without tagged union overhead. TSClang does not support non-nullable runtime union.

### Use interface for polymorphism

```typescript
interface Shape { area(): f64 }

class Circle implements Shape {
    r: f64;
    area(): f64 { return Math.PI * this.r * this.r; }
}

class Rect implements Shape {
    w: f64; h: f64;
    area(): f64 { return this.w * this.h; }
}

function process(x: Shape): void { ... }  // ok — fat pointer with vtable
```

## String Literal Union

String literal union — **compile-time concept**, compiles to a C enum:

```typescript
type Dir = "north" | "south" | "east" | "west"

let d: Dir = "north"   // ok
d = "up"               // error: "up" is not in Dir
```

```c
typedef enum { Dir_north, Dir_south, Dir_east, Dir_west } Dir;

static const char* const Dir_values[] = {
    [Dir_north] = "north",
    [Dir_south] = "south",
    [Dir_east]  = "east",
    [Dir_west]  = "west"
};
```

### Conversion to string

```typescript
const s1 = d.toString()   // "north" — explicit
const s2 = d as string    // "north" — short
```

Autoconversion is forbidden — in C this is a hidden `Dir_values[d]`, overhead must be visible in code.

### Where allowed

| Position | Allowed |
|----------|---------|
| `type` alias | ✅ |
| Function parameter type | ✅ |
| Generic parameter (`keyof`, `Pick`, `Record`) | ✅ |
| Runtime union with another type (`Dir | i32`) | ❌ |
| Autoconvert to `string` | ❌ |

## Errors

| Code | Error | Solution |
|------|-------|----------|
| `type S = string \| i32` | `non-nullable union types are not supported` | Use `interface` for polymorphism |
| `type P = { x: f64 }; P.distance = ...` | `methods are not allowed on type aliases` | Use `class` or `interface` |
| `d = "up"` (where `d: Dir`) | `"up" is not assignable to Dir` | Use a value from the union |
| `let s: string = d` | `cannot implicitly convert Dir to string` | Use `d.toString()` or `d as string` |

## See also

- [Utility Types](./utility-types.md) — `Partial`, `Pick`, `Omit`, `Record`, etc.
- [Interfaces](../04-classes/index.md) — structural typing with methods
- [Generics](../04-classes/index.md) — generics and monomorphization
- [Owner (T)](../05-memory/owner.md) — move semantics for type alias objects
