# Indexing and Slices

[← Up](./index.md) | [Previous ←](./match/switch.md)

---

Unified indexing and slice syntax for arrays `T[]` and strings `string`. Slice end is always **exclusive** (not included). Negative indices count from the end.

## Summary Table

| Syntax | Array `T[]` | String `string` |
|--------|-------------|-----------------|
| `x[i]` | element `T` | byte `u8`, O(1) |
| `x[1..3]` | elements 1, 2 | bytes 1, 2 → `Ref<string>`, O(1) |
| `x[1..]` | from 1 to end | bytes from 1 to end |
| `x[..3]` | from start to 3 | bytes 0, 1, 2 |
| `x[..]` | entire array | entire string (borrow) |
| `x[-1]` | last element | last byte `u8` |
| `x[0..-1]` | everything except last | all bytes except last |
| `x[-2..]` | last two elements | last two bytes |

## Single Index `x[i]`

### Array

Returns element of type `T`. For primitives — copy, for complex types — borrow (`Ref<T>`).

```typescript
const arr: i32[] = [10, 20, 30];
const first = arr[0];    // i32 — 10
const last  = arr[-1];   // i32 — 30
```

C-output:

```c
int32_t first = arr.data[0];
int32_t last  = arr.data[arr.length - 1];
```

### String

Returns a **byte** of type `u8`, not `string`. This is the main difference from JavaScript, where `"abc"[0]` gives `"a"`.

```typescript
const s = "ABC";
const b: u8 = s[0];     // 65 — ASCII code of 'A'
const last: u8 = s[-1];  // 67 — ASCII code of 'C'
```

C-output:

```c
const uint8_t b    = (uint8_t)s.data[0];
const uint8_t last = (uint8_t)s.data[s.length - 1];
```

### Converting `u8` → string

If you need a single-byte character as a string, use a slice of width 1:

```typescript
const s = "ABC";
const ch: Ref<string> = s[0..1];  // "A" — one-byte slice
```

Error when trying to use `s[i]` where `string` is expected:

```
error: expected string, got u8
hint: s[i] returns a raw byte in TSC (strings are UTF-8 byte arrays).
  - s[i..i+1]  — one-byte slice as Ref<string>
  - for...of   — iteration over grapheme clusters
  - import { graphemeAt } from "std/string"  — grapheme cluster by byte offset
```

## Slices `x[a..b]`

### Arrays

Array slice by default is a **borrow** (`Ref<T[]>`), without copying data. The original array remains alive.

```typescript
const arr = [1, 2, 3, 4, 5];

const mid  = arr[1..3];   // Ref<i32[]> — elements 2, 3
const tail = arr[1..];    // Ref<i32[]> — elements 2, 3, 4, 5
const init = arr[..-1];   // Ref<i32[]> — elements 1, 2, 3, 4
const all  = arr[..];     // Ref<i32[]> — entire array (borrow)
const last2 = arr[-2..];  // Ref<i32[]> — elements 4, 5
```

Explicit type annotation gives an **owned copy** (requires `T: Clone`):

```typescript
const copy: i32[] = arr[1..3];  // i32[] — owned copy [2, 3]
```

### Strings

String slices are O(1), return `Ref<string>` (borrow). Data is not copied.

```typescript
const s = "hello world";

const sub  = s[6..];    // Ref<string> — "world"
const pref = s[..5];    // Ref<string> — "hello"
const all  = s[..];     // Ref<string> — "hello world" (borrow)
```

C-output:

```c
// s[..5]
const String pref = {.data = s.data, .length = 5, .capacity = 0};

// s[6..]
const String sub = {.data = s.data + 6, .length = s.length - 6, .capacity = 0};

// s[..]
const String all = {.data = s.data, .length = s.length, .capacity = 0};
```

`capacity = 0` means the string is a borrow (doesn't own memory).

## UTF-8 and Strings

**Indices point to bytes, not characters.** String `"привет"` is 6 letters, but 12 bytes in UTF-8.

```typescript
const s = "привет";  // 12 bytes
s.length              // 12
s[0]                  // 208 — first byte of letter 'п'
s[0..2]               // Ref<string> — first byte of letter 'п' (valid UTF-8)
```

The developer is responsible for ensuring the slice doesn't split a multi-byte UTF-8 character. Splitting a multi-byte character is not a compiler error, but the runtime result will be an invalid string.

For safe slices by **codepoint indices**:

```typescript
import { sliceChars } from "std/string"

const s = "привет";
const sub = sliceChars(s, 1, 3);  // "ри" — codepoints 1..2, O(n)
```

> **Embedded:** `sliceChars` requires utf8proc (~300KB) and is unavailable on platforms with `flash < 300KB`. Byte `slice(start, end?)` and `indexOf` are available everywhere.

## Borrow and Mutation

Borrow slice blocks mutation of the source while the slice is alive:

```typescript
let arr = [1, 2, 3, 4, 5];
const s = arr[1..3];   // Ref — arr is borrowed
arr.push(6);           // error: arr is borrowed
```

Move from array by index is forbidden:

```typescript
let ref: User;
{
    const users = [user1, user2, user3];
    ref = users[0];  // error: cannot move out of array by index
}
// hint: use users.remove(0) to take ownership
```

## Method `.slice()` vs Operator `[..]`

Besides operator `[]`, arrays and strings have method `.slice()`:

| | Operator `[a..b]` | Method `.slice(a, b)` |
|---|---|---|
| **Array** | `Ref<T[]>` — borrow | `T[]` — owned copy (requires `T: Clone`) |
| **String** | `Ref<string>` — borrow | `string` — owned copy |

```typescript
const arr = [1, 2, 3, 4, 5];
const view = arr[1..3];        // Ref<i32[]> — borrow
const copy = arr.slice(1, 3);  // i32[] — owned copy [2, 3]

const s = "hello world";
const sv = s[..5];             // Ref<string> — borrow
const sc = s.slice(0, 5);      // string — owned copy "hello"
```

## Out of Bounds

Indexing outside array/string causes **runtime panic** (abort). This is not undefined behavior.

```typescript
let arr: i32[] = [1, 2];

arr[0];    // ok → 1
arr[2];    // runtime error: index 2 out of bounds (length=2)
arr[-3];   // runtime error: index -3 out of bounds (length=2)
```

Compiler does not perform bounds check statically, except trivial cases with constant indices.

---

## See also

- [Types: Arrays](../../03-types/arrays.md) — `T[]`, `T[N]`, array methods
- [Types: Strings](../../03-types/strings.md) — `string`, UTF-8, string methods
- [Memory Model](../../05-memory/index.md) — ownership, borrow checker, `Ref<T>`
- [std/string](../../10-stdlib/string.md) — `sliceChars`, `chars`, `graphemes`
