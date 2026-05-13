# Enum

[← Up](./index.md) | [Next →](./generics.md) | [Previous ←](./interfaces.md)

---

TSClang enumerations are named sets of values. Numeric, string, and `const enum` are supported. Regular `enum` gets runtime utilities (`values()`, `fromValue()`, `toString()`), `const enum` compiles to minimal C code without tables.

## Numeric enum

```typescript
enum Direction { North, South, East, West }   // 0, 1, 2, 3
enum Color { Red = 1, Green = 2, Blue = 4 }   // explicit values (bit flags)
```

```c
typedef enum { North, South, East, West } Direction;
static const Direction Direction_values[] = { North, South, East, West };
static const char*    Direction_names[]  = { "North", "South", "East", "West" };
```

## String enum

```typescript
enum Status { Ok = "OK", Fail = "FAIL", Pending = "PENDING" }
```

```c
typedef enum { Status_Ok, Status_Fail, Status_Pending } Status;
static const char* Status_strings[] = { "OK", "FAIL", "PENDING" };
```

## const enum

Only C enum, without runtime tables. For embedded, where binary size matters.

```typescript
const enum Pin { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 }
```

```c
typedef enum { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 } Pin;
// nothing else — no tables
```

Utilities on `const enum` are unavailable:

```typescript
Pin.values()         // error: const enum has no runtime table
Pin.fromValue(0)     // error: const enum has no runtime table
Pin.PA0.toString()   // error: const enum has no runtime table
```

## Enum utilities (regular enum only)

```typescript
enum Direction { North, South, East, West }

Direction.values()           // Direction[] — [North, South, East, West]
Direction.fromValue(2)       // Direction | null — Direction.East or null
Direction.North.toString()   // string — "North"

for (const d of Direction.values()) {
    console.log(d.toString());
}

const d = Direction.fromValue(userInput);
if (d != null) {
    console.log(d.toString());
}
```

## enum in switch / match

`switch` — the compiler emits a warning if not all values are covered. `match` — compiler error if not all values are covered (exhaustiveness check).

```typescript
// switch — warning on incomplete coverage
switch (dir) {
    case Direction.North: ...; break;
    case Direction.South: ...; break;
    case Direction.East:  ...; break;
    case Direction.West:  ...; break;
}

// match — error on incomplete coverage (exhaustiveness)
const label = match (dir) {
    Direction.North => "up",
    Direction.South => "down",
    Direction.East  => "right",
    Direction.West  => "left",
    // _ is not needed — all cases covered
};
```

## enum vs const enum

|  | `enum` | `const enum` |
|--|--------|--------------|
| C-output | `typedef enum` + tables | only `typedef enum` |
| `.values()` | yes | no |
| `.fromValue()` | yes | no |
| `.toString()` | yes | no |
| Binary size | larger | minimal |
| Application | general case | embedded, flags, constants |

## C-output

### Numeric enum

```typescript
enum Direction { North, South, East, West }
```

```c
typedef enum { North, South, East, West } Direction;
static const Direction Direction_values[] = { North, South, East, West };
static const char*    Direction_names[]  = { "North", "South", "East", "West" };
```

### String enum

```typescript
enum Status { Ok = "OK", Fail = "FAIL", Pending = "PENDING" }
```

```c
typedef enum { Status_Ok, Status_Fail, Status_Pending } Status;
static const char* Status_strings[] = { "OK", "FAIL", "PENDING" };
```

### const enum

```typescript
const enum Pin { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 }
```

```c
typedef enum { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 } Pin;
```

## Errors

| Error | Cause |
|-------|-------|
| `const enum has no runtime table` | Calling `.values()`, `.fromValue()` or `.toString()` on `const enum` |
| `non-exhaustive match: missing East, West` | `match` does not cover all enum variants |
| `duplicate enum value: 2` | Two elements with the same value |

## See also

- [Classes](./classes.md) — definition, modifiers
- [Interfaces](./interfaces.md) — contract interfaces, `implements`
- [Generics](./generics.md) — parameterized types
- [Syntax: match](../02-syntax/match/syntax.md) — pattern matching with exhaustiveness
