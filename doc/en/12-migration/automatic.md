# Automatic migration (tsclang migrate)

[← Up](./index.md) | [Next →](./manual.md) | [Previous ←](./index.md)

---

The `tsclang migrate` command *(roadmap — phase 13)* automatically applies mechanical transformations to TypeScript code, preparing it for compilation with TSClang. The tool analyzes the AST and replaces incompatible constructs.

## Command syntax

```bash
tsclang migrate [path]           # dry-run: show what will change
tsclang migrate [path] --fix     # apply changes in place
tsclang migrate [path] --check   # CI mode: exit 1 if incompatibilities exist
```

`path` — file, directory, or glob. Defaults to the current directory.

**Input files:** `.ts` / `.tsx` (TypeScript source)
**Output files:** `.tsc` (renamed + transformed, originals are not deleted)

## Modes

### Dry-run (default)

Shows planned changes without writing files:

```
tsclang migrate ./src

  src/user.ts → src/user.tsc
    line 12: throw "not found"  →  throw new Error("not found")
    line 34: x === undefined    →  x == null
    line 67: export default User  →  export { User }

  src/api.ts → src/api.tsc
    line 5:  x !== undefined    →  x != null

  Manual review required (2 files):
    src/base.ts:15  — class Dog extends Animal (inheritance)
    src/parser.ts:8 — s[i] string indexing

  3 files to transform, 2 require manual review.
  Run with --fix to apply automatic changes.
```

### --fix

Applies automatic transformations in place. Creates `.tsc` files next to the original `.ts` files. Originals are not deleted.

### --check

CI mode: does not apply changes, exits with `exit 1` if incompatibilities requiring manual editing are found. Used in pipelines to track migration debt.

## Automatic transformations

| TypeScript | TSClang | Reason |
|------------|---------|--------|
| `undefined` | `null` | TSClang does not have `undefined` |
| `throw "message"` | `throw new Error("message")` | Only `Error` instances can be thrown |
| `export default X` | `export { X }` | `export default` is prohibited |
| `import X from "./m"` | `import X from "./m"` | The name is a namespace, not default (already compatible) |
| `x === y` | `x == y` | `==` and `===` are identical in TSClang |
| `x !== y` | `x != y` | Same as above |
| `.ts` → `.tsc` | `user.ts` → `user.tsc` | File renaming |

### Transformation examples

```typescript
// TypeScript → TSClang (automatic)

// 1. undefined → null
let x = undefined          →  let x = null
if (y === undefined)       →  if (y == null)
if (y !== undefined)       →  if (y != null)

// 2. throw strings → throw Error
throw "not found"          →  throw new Error("not found")
throw 404                  →  throw new Error("404")

// 3. export default → named export
export default User        →  export { User }
export default { x: 1 }   →  const _default = { x: 1 }; export { _default }

// 4. === → ==, !== → !=
x === y                    →  x == y
x !== null                 →  x != null
```

## What is NOT automated

The following patterns require manual editing — `--check` lists them:

- **Class inheritance** (`extends` other than `Error`) — no safe automatic replacement
- **`s[i]` string indexing** — semantics have changed (u8 instead of string)
- **`for (let x of arr)`** — requires analysis of the element type
- **Numeric annotations** (`number` → concrete type) — depends on context
- **Ownership annotations** — requires understanding of data flow

More details — in the [Manual migration](./manual.md) section.

## Errors

| Error | Cause |
|-------|-------|
| `no .ts files found in path` | The specified path contains no TypeScript files |
| `circular import detected` | Circular import in the source code |
| `unable to parse .ts file` | The file contains syntax errors |

## See also

- [Migration overview](./index.md) — general migration information
- [Manual migration](./manual.md) — patterns requiring manual edits
- [Build: CLI](../09-build/cli.md) — all `tsclang` commands
