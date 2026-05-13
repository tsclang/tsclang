# Strings

[← Up](./index.md) | [Next →](./special-types.md) | [Previous ←](./numbers.md)

---

The `string` type in TSClang is a **UTF-8 byte sequence**. Key difference from JS: indexing and `length` work with **bytes**, not characters.

## C Layout

```c
typedef struct {
    const char* data;      // указатель на байты: rodata (литералы) или heap (динамические)
    size_t      length;    // количество байт
    size_t      capacity;  // 0 = статическая строка (rodata, не освобождать)
                           // > 0 = heap (malloc, освобождать при drop)
} String;
```

- `string` (non-nullable) → `String` in C (value type, embedded in structs)
- `string | null` → `String*` in C (pointer, `NULL` = null)

## String Literals — No Heap

Literals do not allocate heap: `capacity = 0`, `data` points to the rodata section:

```typescript
const s = "hello"
```

```c
String s = { .data = "hello", .length = 5, .capacity = 0 };  // rodata, malloc не вызывается
```

Heap is allocated only during dynamic construction (concatenation, `toString()`, formatting):

```typescript
const s = a + b   // tsc_str_concat(a, b) — capacity > 0, malloc
```

## Indexing and Length

```typescript
const s = "привет"   // 6 letters, 12 bytes in UTF-8

s.length    // 12 — number of bytes, O(1)
s[0]        // 208 — first byte of 'п', type u8, O(1)
s[0..2]     // Ref<string> — slice by byte offsets, O(1)
```

**`s[i]` returns `u8`** (a byte), not `string`. This is the main difference from JS.

```
error: expected string, got u8
hint: s[i] returns a raw byte in TSC (strings are UTF-8 byte arrays).
  - s[i..i+1]  — однобайтовый срез как Ref<string>
  - for...of   — итерация по графемным кластерам
  - import { graphemeAt } from "std/string"
```

Slice `s[a..b]` — by **byte offsets**, O(1), `Ref<string>` (borrow). Splitting a multi-byte character is not a compiler error, but runtime may produce invalid UTF-8.

## Character Literals

```typescript
const a: u8 = 'A'    // 65 — type u8, as in C
const n: u8 = '\n'   // 10
const p: u8 = 'п'    // error: 'п' is multi-byte (2 bytes), not u8
```

`'X'` — literal of type `u8`. ASCII and escape sequences only.

## Iteration: for-of

`for...of` iterates **grapheme clusters** (UAX #29):

```typescript
for (const ch of "привет❤️") {
    // ch: string — "п", "р", "и", "в", "е", "т", "❤️"
}
```

## Slices and Byte Access

```typescript
s.bytes          // Slice<u8> — borrow of raw bytes, O(1)
s.bytes[i]       // u8 — same as s[i]
s.bytes.clone()  // u8[] — owned copy of bytes

s[0..4]          // Ref<string> — byte slice, O(1)
```

## Built-in Methods (JS-Compatible)

No import needed — always available:

| Method | Return Type | Description |
|-------|-----------------|----------|
| `s.indexOf(sub)` | `i32` | Byte offset, -1 if not found |
| `s.includes(sub)` | `boolean` | Contains substring |
| `s.startsWith(sub)` | `boolean` | Starts with |
| `s.endsWith(sub)` | `boolean` | Ends with |
| `s.slice(start, end?)` | `string` | Copy by byte offsets |
| `s.substring(start, end?)` | `string` | Copy |
| `s.toUpperCase()` | `string` | ASCII only |
| `s.toLowerCase()` | `string` | ASCII only |
| `s.trim()` | `string` | Remove whitespace from both ends |
| `s.trimStart()` | `string` | Remove whitespace from the start |
| `s.trimEnd()` | `string` | Remove whitespace from the end |
| `s.split(sep)` | `string[]` | Split by separator |
| `s.replace(search, repl)` | `string` | Replace first occurrence (string) |
| `s.replaceAll(search, repl)` | `string` | Replace all occurrences (string) |
| `s.padStart(len, fill?)` | `string` | Pad at the start |
| `s.padEnd(len, fill?)` | `string` | Pad at the end |
| `s.repeat(n)` | `string` | Repeat n times |
| `s.charAt(i)` | `string` | `s[i..i+1]` by byte offset |
| `s.charCodeAt(i)` | `u8` | Byte at offset (synonym for `s[i]`) |
| `s.lastIndexOf(sub)` | `i32` | Byte offset of last occurrence |
| `s.at(i)` | `u8 \| null` | Byte at offset, negative from end |

```typescript
const s = "Hello, World!"
s.indexOf("World")       // 7
s.includes("Hello")      // true
s.slice(0, 5)            // "Hello"
s.toUpperCase()          // "HELLO, WORLD!"
s.trim()                 // "Hello, World!"
s.split(", ")            // ["Hello", "World!"]
s.replace("World", "TSC")  // "Hello, TSC!"
s.repeat(3)              // "Hello, World!Hello, World!Hello, World!"
s.at(-1)                 // 33 (byte for '!')
```

## Methods with Regex (require import)

```typescript
import { search, match, matchAll, replaceAll } from "std/string"

s.search(regex)               // i32 — byte offset of first match
s.match(regex)                // string[] | null — groups of first match
s.matchAll(regex)             // string[][] — all matches (array, not a lazy iterator)
s.replaceAll(regex, replace)  // string — replace all regex matches
```

`matchAll` returns `string[][]`, not `IterableIterator` as in JS — the full result is computed immediately.

## std/string — Unicode Extension Methods

TSC-specific methods not present in JS/TS. Loaded via explicit import:

```typescript
import { chars, charCount, graphemes, codePointAt, graphemeAt, sliceChars } from "std/string"

s.chars()                  // Iterator<u32> — codepoints (1087, 1088...)
s.charCount()              // i32 — number of codepoints, O(n)
s.graphemes()              // Iterator<string> — grapheme clusters
s.codePointAt(byteIdx)     // u32 — codepoint at byte offset
s.graphemeAt(byteIdx)      // string — grapheme cluster at byte offset
s.sliceChars(start, end)   // string — slice by codepoint indices, O(n)
```

`codePointAt(byteIdx)` and `graphemeAt(byteIdx)` accept a **byte offset** — convenient after `indexOf`: the offset is already known.

### Platform Availability

| Method | Without utf8proc | With utf8proc |
|-------|-------------|------------|
| `chars`, `charCount`, `codePointAt` | ✅ | ✅ |
| `indexOf`, `slice` (byte) | ✅ | ✅ |
| `graphemes`, `graphemeAt`, `sliceChars` | ❌ | ✅ |

Grapheme segmentation requires **utf8proc** (~300KB, C-native). On embedded platforms with `flash < 300KB`, importing `graphemes`, `graphemeAt`, `sliceChars` is a **compiler error**.

## C Output

### Literal

```typescript
const s = "hello"
```

```c
String s = { .data = "hello", .length = 5, .capacity = 0 };
```

### Concatenation

```typescript
const greeting = "Hello, " + name + "!"
```

```c
String _tmp1 = tsc_str_concat(STR_LIT("Hello, "), name);
String greeting = tsc_str_concat(_tmp1, STR_LIT("!"));
tsc_str_free(&_tmp1);
```

### for-of Iteration

```typescript
for (const ch of text) {
    console.log(ch)
}
```

```c
GraphemeIter _it = graphemes_iter(text);
while (true) {
    String ch = graphemes_next(&_it);
    if (ch.data == NULL) break;
    tsc_console_log(ch);
}
```

### Built-in Methods

```typescript
const pos = s.indexOf("needle")
const upper = s.toUpperCase()
```

```c
int32_t pos = tsc_str_indexof(s, STR_LIT("needle"));
String upper = tsc_str_toUpper(s);
```

## Errors

| Error | Reason |
|--------|---------|
| `expected string, got u8` | `s[i]` returns a byte, not a string. Use `s[i..i+1]` or `charAt(i)` |
| `'п' is a multi-byte character, not u8` | Character literal contains non-ASCII |
| `utf8proc not available on embedded (flash < 300KB)` | `graphemes`/`graphemeAt`/`sliceChars` on platform without utf8proc |
| `empty object literal is forbidden` | For dynamic keys use `Map<string, string>` |

## See Also

- [Numeric Types](./numbers.md) — number ↔ string conversion, `.toString()`, `parseInt`
- [Arrays](./arrays.md) — `string[]`, `split()`, `join()`
- [Null](./null.md) — `string | null`, optional chaining `s?.length`
- [Memory Model](../05-memory/index.md) — `string` as heap owner, `Ref<string>`, move semantics
- [std/string](../10-stdlib/string.md) — Unicode methods, regex, encodings
