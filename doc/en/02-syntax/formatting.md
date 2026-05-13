# Formatting

[← Up](./index.md) | [Next →](./truthy-falsy.md)

Code formatting is the responsibility of a **separate tool**, not the compiler. The compiler (`tsclang build`) checks only semantics and completely ignores code style. This allows the language server (autocompletion, types, refactoring) to work correctly even when the developer writes incomplete or unformatted code.

Tools and their roles:

| Tool | Role |
|---|---|
| `tsclang build` | Semantic errors, formatting **ignored** |
| `tsclang lint` | Semantic errors + style warnings, CI check — exit code 1 on violations |
| `tsclang lint --fix` | Formats code in place (analogous to `prettier` / `gofmt`) |
| IDE | Format-on-save via plugin |

```bash
tsclang lint          # check without changes — for CI
tsclang lint --fix    # format code in place
```

TSC follows TypeScript/JavaScript conventions.

---

## Semicolons

Semicolons are **optional**. ASI (Automatic Semicolon Insertion) works as in JavaScript:

```typescript
const x = 1       // without ;
const y = 2;      // with ; — also ok
```

## Curly Braces

Curly braces are recommended for **all** blocks:

```typescript
if (x > 0) {           // recommended
    doSomething()
}

if (x > 0) doSomething()   // allowed (linter may warn)
```

### Opening Brace Style

K&R style (brace on the same line) is recommended:

```typescript
function foo(): void {   // recommended
}

function bar(): void     // allowed (linter may warn)
{
}
```

## Indentation

Indentation **does not affect** semantics (unlike Python). 4 or 2 spaces recommended; tabs are allowed.

## Quotes

Single and double quotes are equivalent. Template strings support interpolation:

```typescript
const a = "hello"
const b = 'hello'             // same
const c = `Hello, ${name}!`   // template literal
```

## Trailing Comma

Trailing comma is allowed **everywhere**:

```typescript
const obj = { a: 1, b: 2, }        // ok
function foo(x: i32, y: i32,) {}    // ok
const arr = [1, 2, 3,]              // ok
```

## Line Breaks

Line breaks are allowed after:

- `,` — comma
- `(` — opening call paren
- `{` — opening curly brace
- binary operator (`+`, `&&`, `||`, …)

## Comments

Three kinds of comments are supported:

```typescript
// single-line
/* multi-line */
/** JSDoc */
```

## Spaces Around Operators

Spaces around operators are recommended. The compiler doesn't check.

## Spaces in Type Annotations

Space **after** colon recommended, but not before:

```typescript
const x: i32 = 5          // recommended
const x :i32 = 5          // allowed (linter may warn)
```

## Generics

Inside angle brackets `< >` spaces are **not recommended**:

```typescript
function first<T>(arr: T[]): T { /* ... */ }   // recommended
function first< T >(arr: T[]): T { /* ... */ } // linter will warn
```

## Union Types

Spaces around `|` are recommended:

```typescript
type Result = i32 | null      // recommended
type Result = i32|null        // linter may warn
```

## Arrow Functions

Parens around parameter are **required** if there are type annotations. Without annotations — optional:

```typescript
const f = (x: i32): i32 => x + 1     // annotations → parens required
const f = x => x + 1                  // no annotations → parens optional
```

## Method Chains

If method chain is long, each call goes on a separate line:

```typescript
const result = items
    .filter(x => x > 0)
    .map(x => x * 2)
    .reduce((a, b) => a + b, 0)
```

## Ternary Operator

Simple expressions — one line. Complex — multiple lines:

```typescript
// simple — inline
const label = count > 0 ? "items" : "no items"

// complex — multiline
const label = count > 1000
    ? "many items"
    : count > 0
        ? "some items"
        : "no items"
```

## Empty Lines

- **One** empty line between top-level functions / classes.
- **At most one** empty line inside function body.
- **No empty lines** right after `{` or before `}`.

## Line Length

Recommended maximum — **120 characters**. The compiler doesn't enforce, but `tsclang lint` may warn.

## End of File

File must end with **one newline character** (`\n`).

---

## See also

- [Comments](./comments.md) — more on JSDoc and documentation
- [Data Types](./types.md) — type annotations and their syntax
- [Arrow Functions](./arrow-functions.md) — syntax details
- [Linter](../06-tools/linter.md) — formatting rule configuration
