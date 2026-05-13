# std/regex

[← Up](./index.md) | [Next →](./hal.md) | [Previous ←](./json.md)

---

NFA-based regular expression engine. Guaranteed O(n×m) time — no catastrophic backtracking, no ReDoS.

Available on all platforms including embedded (≈5KB compiled code, no heap requirements).

## Import

```typescript
import { Regex, Match } from "std/regex"
```

## Creation

```typescript
const re = new Regex(r"\d{3}-\d{4}")   // raw string — compile-time syntax check
const re = /\d{3}-\d{4}/              // literal syntax — equivalent
const rei = /hello/i                   // with flags
```

## API

```typescript
const re = /\d{3}-\d{4}/

const m: Match | null = re.match("tel: 123-4567")

if (m != null) {
    m.value       // "123-4567" — entire match
    m.start       // i32 — byte position of start
    m.end         // i32 — byte position of end
    m.group(1)    // string | null — capture group
}

re.test("123-4567")          // boolean — is there a match
re.findAll("text")           // Match[] — all matches
re.replace("text", "repl")  // string — first replacement
re.replaceAll("text", "r")  // string — all replacements
re.split("a,b,,c")          // string[] — split by pattern
```

## String methods with Regex

String methods accept `Regex` from `std/regex`:

```typescript
"123-4567".match(/\d+/)      // Match | null
"a,b,c".split(/,/)           // string[]
"hello".replace(/l+/, "r")   // string
```

## Supported syntax

| Syntax | Support |
|--------|---------|
| `.` `*` `+` `?` `{n}` `{n,m}` | ✅ |
| `[abc]` `[^abc]` `[a-z]` | ✅ |
| `^` `$` `\b` `\B` | ✅ |
| `\d` `\w` `\s` and inverses `\D` `\W` `\S` | ✅ |
| `(groups)` `(?:non-capturing)` | ✅ |
| Alternation `a|b` | ✅ |
| Named groups `(?P<name>...)` | ✅ |
| Backreferences `\1` `\2` | ❌ — use `@tsc/pcre` |
| Lookahead `(?=...)` `(?!...)` | ❌ — use `@tsc/pcre` |
| Lookbehind `(?<=...)` `(?<!...)` | ❌ — use `@tsc/pcre` |
| Unicode categories `\p{L}` | ❌ — use `@tsc/pcre` |

Incompatible constructs — compiler error with hint to `@tsc/pcre`:

```
error: backreferences are not supported in std/regex
  hint: use import { Regex } from "@tsc/pcre" for full PCRE syntax
```

## @tsc/pcre

Wrapper over libpcre2 for full PCRE syntax (backreferences, lookahead, Unicode categories). API is identical to `std/regex` — just change the import:

```typescript
import { Regex } from "@tsc/pcre"   // instead of "std/regex"
// rest of the code unchanged
```

⚠️ **ReDoS**: patterns with backtracking (`(a+)+`) may hang. Do not use with untrusted input. On embedded — compiler error (~50KB flash).

## Example

```typescript
import { Regex } from "std/regex"

const email = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

const text = "Contact: alice@example.com and bob@test.org"
const matches = email.findAll(text)

for (const m of matches) {
    console.log(m.value)  // alice@example.com, bob@test.org
}

const phone = /(\d{3})-(\d{4})/
const m = phone.match("Call 123-4567")
if (m != null) {
    console.log(m.group(1))  // "123"
    console.log(m.group(2))  // "4567"
}
```

## Errors

| Error | Cause |
|-------|-------|
| `backreferences are not supported in std/regex` | Used `\1` or `\2` |
| `lookahead is not supported in std/regex` | Used `(?=...)` or `(?!...)` |
| `invalid regex syntax at position N` | Invalid pattern |
| `@tsc/pcre is not available on target "avr"` | PCRE requires heap, ~50KB flash |

## See also

- [std/string](./string.md) — Unicode utilities, string methods with Regex
- [std/json](./json.md) — JSON parsing
- [Strings](../03-types/strings.md) — string type, literals, base methods
