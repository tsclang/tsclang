# Migration: TypeScript → TSClang

[← Up](../index.md) | [Next →](./automatic.md)

---

Guide for developers migrating from TypeScript to TSClang. Describes automatic and manual conversions, incompatible patterns, and new capabilities.

## Process Overview

TSClang strives for maximum compatibility with TypeScript syntax. Most TypeScript code ports without changes or with minimal edits. Migration process is divided into three stages:

1. **Automatic fixes** — `tsclang migrate` applies mechanical transformations
2. **Manual fixes** — patterns that cannot be safely automated
3. **Incompatible patterns** — constructs without direct analog, requiring redesign

## Quick Check

```bash
tsclang migrate ./src            # dry-run: show what will change
tsclang migrate ./src --fix      # apply automatic fixes
tsclang migrate ./src --check    # CI: exit 1 if incompatibilities exist
```

## What Migrates Unchanged

Interfaces, functions with types, arrow functions, classes (without `extends`), generics, `try/catch`, template strings, destructuring — all of this works as in TypeScript. Details — in [Manual Migration](./manual.md).

## Subpages

| Page | Description |
|------|-------------|
| [Automatic Migration](./automatic.md) | `tsclang migrate`: dry-run, --fix, --check, list of auto-transformations |
| [Manual Migration](./manual.md) | What works as-is and what requires manual fixes |
| [Incompatible Patterns](./incompatible.md) | Constructs without analog and alternatives |
| [New Features](./new-features.md) | Ownership, Ref/Mut/Shared, match, throws and more |

## Errors

| Error | Cause |
|-------|-------|
| `undefined is not defined` | Using `undefined` — replace with `null` |
| `throw requires Error instance` | Throwing string or number — wrap in `new Error()` |
| `export default is not supported` | Replace with named export |
| `extends is not supported` | Class inheritance — replace with composition |

## See also

- [Introduction: What is TSClang](../01-intro/what-is-tsclang.md) — language overview and philosophy
- [Build: CLI](../09-build/cli.md) — commands `tsclang build`, `tsclang migrate`
- [Memory Model](../05-memory/index.md) — ownership, borrow checker, Ref/Mut/Shared
