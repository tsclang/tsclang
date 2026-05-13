# std/string

[← Up](./index.md) | [Next →](./json.md) | [Previous ←](./ws.md)

---

Unicode utilities, encoding, and formatting for strings. Explicitly imported.

## Import

```typescript
import { chars, charCount, graphemes, codePointAt, graphemeAt, sliceChars } from "std/string"
import { base64, hex, url } from "std/string"
import { format } from "std/string"
```

## Unicode extension methods

Methods for working with Unicode. Accept byte offsets — convenient after `indexOf`.

```typescript
const s = "привет❤️"

s.chars()                  // Iterator<u32> — codepoints, O(1) per step
s.charCount()              // i32 — number of codepoints, O(n)
s.graphemes()              // Iterator<string> — grapheme clusters ("п", "р", "❤️")
s.codePointAt(byteIdx)     // u32 — codepoint at byte offset
s.graphemeAt(byteIdx)      // string — grapheme cluster at byte offset
s.sliceChars(start, end)   // string — safe slice by codepoint indices, O(n)
```

### Pattern: find substring → get character

```typescript
const idx = s.indexOf("❤️")        // byte offset, O(n)
if (idx >= 0) {
    const g = s.graphemeAt(idx)    // "❤️", O(1 character)
}
```

### Embedded limitations

Grapheme methods (`graphemes`, `graphemeAt`, `sliceChars`) require utf8proc (~300KB). On platforms with `flash < 300KB` — compiler error.

Methods without utf8proc (available everywhere): `chars()`, `charCount()`, `codePointAt()`, `indexOf()`, byte `slice()`.

## Encoding

### base64

```typescript
base64.encode(bytes: u8[]): string
base64.decode(s: string): u8[] throws ParseError
```

### hex

```typescript
hex.encode(bytes: u8[]): string     // "deadbeef"
hex.decode(s: string): u8[] throws ParseError
```

### URL

```typescript
url.encode(s: string): string       // "hello%20world"
url.decode(s: string): string throws ParseError
url.encodeComponent(s: string): string
url.decodeComponent(s: string): string throws ParseError
```

## Formatting

```typescript
format("Hello %s, you are %d years old", name, age)   // string
format("Pi is %.2f", Math.PI)                          // "Pi is 3.14"
format("%05d", 42)                                     // "00042"
```

### Specifiers

| Specifier | Description |
|-----------|-------------|
| `%s` | string |
| `%d` | integer |
| `%f` | float (`%.Nf` — N digits after decimal) |
| `%x` | hex (lowercase) |
| `%X` | hex (uppercase) |
| `%b` | binary |
| `%o` | octal |
| `%%` | literal `%` |

## Example

```typescript
import { chars, charCount, graphemes, base64, hex, format } from "std/string"

const s = "Hello, мир!"

console.log(charCount(s))                        // 11 codepoints
for (const cp of chars(s)) { console.log(cp) }   // each codepoint

const encoded = base64.encode([0xDE, 0xAD, 0xBE, 0xEF])  // "3q2+7w=="
const hexstr = hex.encode([0xDE, 0xAD])                   // "dead"

const msg = format("User %s, score: %05d", "Alice", 42)   // "User Alice, score: 00042"
```

## Errors

| Error | Cause |
|-------|-------|
| `grapheme methods require utf8proc (~300KB)` | Not enough flash for utf8proc on embedded |
| `ParseError: invalid base64` | Invalid base64 string |
| `ParseError: invalid hex` | Invalid hex string |

## See also

- [std/json](./json.md) — JSON parsing
- [std/regex](./regex.md) — regular expressions
- [Strings](../03-types/strings.md) — string type, literals, base methods
