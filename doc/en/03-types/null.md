# Null — Nullable Types (T | null)

[← Up](./index.md) | [Next →](./arrays.md) | [Previous ←](./special-types.md)

---

`null` is the only "missing value" in TSClang. Unlike JS/TS, there is **no `undefined`** and **no `NaN`** — parsing functions return `T | null`, integer division by zero causes panic, for float — IEEE 754 behavior.

---

## Declaring a Nullable Type

### Explicit Syntax: `T | null`

```typescript
let name: string | null = null;
let age: i32 | null = 42;
let result: User | null = findUser(id);
```

### Sugar: `?T`

`?T` — syntactic sugar for `T | null`:

```typescript
function find(id: i32): ?User { ... }    // equivalent to User | null
let name: ?string = null;                 // equivalent to string | null
```

---

## C Representation

`T | null` compiles to a struct with a bool flag `has_value`:

```c
typedef struct {
    bool    has_value;   // 1 byte
    // padding to align T
    int32_t value;       // 4 bytes
} opt_i32;
```

Initialization:

```typescript
let x: i32 | null = 42;  // value
let y: i32 | null = null; // absence
```

```c
opt_i32 x = {true, 42};
opt_i32 y = {false, 0};
```

### Size Table Including Padding

| Type | C struct | Size |
|-----|----------|--------|
| `u8 \| null` | `bool + u8` | 2 bytes |
| `i16 \| null` | `bool + pad(1) + i16` | 4 bytes |
| `i32 \| null` | `bool + pad(3) + i32` | 8 bytes |
| `i64 \| null` | `bool + pad(7) + i64` | 16 bytes |
| `f32 \| null` | `bool + pad(3) + f32` | 8 bytes |
| `f64 \| null` | `bool + pad(7) + f64` | 16 bytes |
| `string \| null` | `bool + pad(7) + String` | 32 bytes |

On desktop, overhead is negligible. On embedded (AVR: 2KB RAM), padding can be significant.

---

## Optional Chaining `?.`

Safe access to fields and methods of a nullable value. If the left side is `null`, the result is also `null`:

```typescript
let user: User | null = findUser(id);
let name = user?.name;               // string | null
let len = user?.name.length;         // usize | null

// with methods
let upper = user?.getName().toUpperCase();  // string | null
```

### C Output

```c
opt_i32 x = {true, 7};
const int32_t y = x.has_value ? x.value : 99;
```

When `?.` on `null`:

```c
opt_i32 x = {false, 0};
opt_string y = x.has_value
    ? (opt_string){true, tsc_i32_to_string(x.value)}
    : (opt_string){false, STR_LIT("")};
```

---

## Nullish Coalescing `??`

The `??` operator returns the left side if it is not `null`, otherwise the right:

```typescript
let x: i32 | null = null;
let y = x ?? 99;               // 99

let name: string | null = getNullable();
let display = name ?? "N/A";   // string — guaranteed non-null
```

### C Output

```typescript
let x: i32 | null = 7;
let y = x ?? 99;   // x is not null → y = 7
```

```c
opt_i32 x = {true, 7};
const int32_t y = x.has_value ? x.value : 99;
```

---

## Type Narrowing After Null Check

After checking `x != null`, the compiler narrows the type from `T | null` to `T`:

```typescript
let x: i32 | null = 5;

if (x != null) {
    // x: i32 — null is excluded
    console.log(x + 1);   // ok — no need for ?.
}

// alternative — early return
if (x == null) return;
// x: i32 below
```

### C Output

```c
opt_i32 x = {true, 5};
if (x.has_value) {
    printf("%d\n", x.value + 1);
}
```

---

## Patterns for Embedded

When `T | null` overhead (bool + padding) is unacceptable on memory-constrained platforms, two alternative patterns are used.

### Pattern 1: Sentinel Value

Allocate one value from the type's range as "missing". Suitable when the sentinel is guaranteed not to occur in data:

```typescript
const NO_READING: u16 = 0xFFFF;  // ADC: 10-bit values 0..1023 — 0xFFFF is never valid

function readADC(): u16 {
    if (!adcReady()) return NO_READING;
    return adcRead();  // 0..1023
}

const reading = readADC();
if (reading != NO_READING) {
    processReading(reading);  // 2 bytes instead of 4
}
```

Typical sentinel values:

| Type | Sentinel | When to Use |
|-----|----------|-------------------|
| `u8` | `0xFF` | values 0..254 |
| `u16` | `0xFFFF` | values 0..65534 |
| `i16` | `-32768` (`INT16_MIN`) | temperature, sensors |
| `u32` | `0xFFFFFFFF` | addresses, identifiers |

### Pattern 2: Separate Flag in Struct

Group several bool flags at the end of a struct — all flags are packed without padding:

```typescript
// Instead of: { temp: i16|null, humidity: u8|null, pressure: i16|null }
// = (4 + 2 + 4) = 10 bytes

// Pattern: data + flags separately
interface SensorData {
    temp:     i16    // 2 bytes
    pressure: i16    // 2 bytes
    humidity: u8     // 1 byte
    // --- flags at the end, no padding between them ---
    tempValid:     bool  // 1 byte
    pressureValid: bool  // 1 byte
    humidityValid: bool  // 1 byte
}
// total: 8 bytes instead of 10
```

Field order affects padding — the compiler **does not reorder** fields automatically (ABI compatibility).

### When to Use Which Pattern

| Situation | Recommendation |
|----------|-------------|
| Single optional primitive | sentinel value |
| Struct with several optional fields | separate flag at end of struct |
| Desktop / sufficient memory | `T \| null` — safer, more readable |

---

## Absence of undefined and NaN

Unlike JS/TS:

- **No `undefined`** — only `null` as "missing value"
- **No `NaN`** — parsing functions return `T | null` instead of `NaN`

```typescript
// JS:  parseInt("abc") → NaN
// TSC: parseInt("abc") → null

const age = parseInt("abc");  // i32 | null → null
const safe = age ?? 0;        // 0
```

---

## Errors

| Error | Reason |
|--------|---------|
| `any is already nullable, "any \| null" is redundant` | `any` is already implicitly nullable (`void*`) |
| `use of possibly null value` | Using `T \| null` without checking |
| `Object is possibly null` | Accessing field/method without null check |

---

## See Also

- [Special Types (void, never, any)](./special-types.md) — `any` as implicitly nullable
- [Arrays](./arrays.md) — `pop()`, `find()` return `T | null`
- [Map and Set](./map-set.md) — `get()` and `delete()` return `T | null`
- [Memory Model — Owner](../05-memory/owner.md) — ownership and nullable
