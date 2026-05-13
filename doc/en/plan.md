# TSClang Documentation Plan

## Goal

Create comprehensive developer documentation in English based on the specification.
The documentation should be practical, user-oriented (developer-focused), not compiler-author-focused.

## Target Audience

1. A developer coming from TypeScript who wants to start writing in TSClang
2. A developer evaluating the language for embedded development
3. A developer looking for a specific API (string method, ownership type, HTTP server)

## Writing Principles

- Language: English
- Code examples: working, minimal, with comments in English
- Structure: from simple to complex
- Each section is self-contained — can be read independently
- Cross-references between sections for deeper study

## File Structure

**Nested structure:** every method, function, type, and construct gets its own file.
No monolithic pages of 50 KB. If a method has 3 calling variants — that's 3 files
inside the method's directory.

Example structure:

```
doc/
  02-syntax/
    index.md                        # section overview + links
    variables/
      let.md
      const.md
    functions/
      declaration.md
      arrow.md
      anonymous.md
      iife.md
      default-params.md
      overload.md
        by-type.md
        by-count.md
        priority.md
    loops/
      for.md
      for-of.md
      while.md
      do-while.md
      break-continue.md
    match/
      syntax.md
      patterns/
        literal.md
        range.md
        destructuring.md
        wildcard.md
        union.md
      exhaustiveness.md
      vs-switch.md
    operators/
      arithmetic.md
      assignment.md
      comparison.md
      logical.md
      bitwise.md
      ternary.md
      optional-chaining.md
      nullish-coalescing.md
      spread.md
    truthy-falsy.md
    slices.md
```

## File Content Rules

Each file describes **one** method / function / construct / type and must contain:

### 1. Full Description

What it is, why it's needed, how it works. No fluff — concrete and to the point.
Mention edge cases and non-obvious behavior.

### 2. Signature / Syntax

Exact signature with parameter types and return type.
If a method has several variants (overloads) — describe each separately.

### 3. Usage or Implementation Examples

At least one working example per variant.
Examples should be minimal — without unnecessary context.
Each example with the result indicated (comment `// →`).

### 4. C Output

For each example — how it compiles to C.
Show the generated C code so the developer understands what happens under the hood.
Especially important for ownership constructs (move, borrow, drop, cleanup).

### 5. Errors and Fixes

Typical compiler errors when used incorrectly.
Format: `erroneous code → error text → fixed code`.
Must include the compiler hint.

### 6. Navigation and Links

Every file must contain navigation links:

**Navigation bar** — at the top of the file, after the heading:

```markdown
[← Up](./index.md) | [Next →](./filter.md) | [Previous ←](./sort.md)
```

Three links:
- **Up** (`←`) — jump to parent directory's `index.md` (section overview)
- **Next** (`→`) — jump to the next file at this level (in logical order, not alphabetical)
- **Previous** (`←`) — jump to the previous file at this level

The first file in a section has no "Previous", the last has no "Next".

**Cross-references** — at the end of the file, "See also" section:

```markdown
## See Also

- [filter](./filter.md) — filtering elements
- [reduce](./reduce.md) — accumulation
- [forEach](./for-each.md) — iteration without result
```

Links to related constructs in other sections — with full path:

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) — borrow of an element
```

**index.md in every directory** — section overview with links to all child files.
Serves as an entry point for top-down navigation.

Example file template:

```markdown
# map

Creates a new array by applying a function to each element of the source array.

## Signature

\`\`\`typescript
arr.map<U>(f: (Ref<T>) => U): U[]
\`\`\`

The callback receives `Ref<T>` — a borrow of the element, not ownership.

## Examples

### Basic Usage

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
const doubled = nums.map(x => x * 2)
// → [2, 4, 6]
\`\`\`

### C Output

\`\`\`c
int32_t* doubled = malloc(3 * sizeof(int32_t));
for (size_t i = 0; i < 3; i++) {
    doubled[i] = nums[i] * 2;
}
\`\`\`

### Type Conversion

\`\`\`typescript
const names: string[] = users.map(u => u.name)
// → ["Alice", "Bob"]
\`\`\`

## Errors

### Callback Mutates Element

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => { x++ })  // error: cannot assign to Ref<i32>
\`\`\`

Fix:

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => x * 2)  // return a new value
\`\`\`

## See Also

- [filter](./filter.md)
- [reduce](./reduce.md)
- [flatMap](./flat-map.md)
```

---

## Documentation Structure

### 01-intro.md — Introduction to TSClang

**Goal:** explain what it is, why it exists, and provide a first working example.

- What is TSClang (TS syntax → C, Rust safety, npm ecosystem)
- Design philosophy (3 priorities: safety, performance, TS syntax)
- Use cases (desktop, embedded, servers, retro platforms)
- Quick start: installation, `hello world`, build and run
- Requirements (Node.js, CMake, gcc/clang)
- CLI overview: `tsclang build`, `tsclang lint`, `tsclang lsp`

**Source:** `spec/01-intro.md`

---

### 02-syntax.md — Syntax

**Goal:** complete description of the language syntax.

- Formatting (ASI, K&R, indentation, quotes, trailing comma)
- Variables: `let` / `const` — difference in the context of ownership
- Functions: `function`, arrow, anonymous, IIFE
- Parameters: default, rest
- Function overloading (by type and count, resolution priority)
- Operators: arithmetic, assignment, comparison, logical, bitwise
- Truthy / Falsy (table by type)
- Loops: `for`, `for-of`, `while`, `do-while`, `break`/`continue`, labeled
- `switch` / `match` — comparison, exhaustiveness
- Spread operator (arrays, objects, ownership rules)
- Indexing and slices (arrays and strings, negative indexes)

**Source:** `spec/02-syntax.md`

---

### 03-types.md — Type System

**Goal:** description of typing, all types, and conversions.

- Structural vs nominal typing (`type`, `interface`, `class`)
- Type inference
- Numeric types (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`)
  - Literals (hex, binary, octal, `_` separators)
  - Auto-cast (3 mechanisms: widening, compile-time, `as`)
  - `usize` — platform type
  - `number` = `f64` (overwritable)
  - Performance warnings on AVR
- `string` — UTF-8 bytes, C layout, indexing, iteration, built-in methods
- Special types: `void`, `never`, `any`
- Null: `T | null`, optional `?`, optional chaining `?.`, nullish coalescing `??`
  - C representation of `T | null` (struct with flag)
  - Embedded patterns: sentinel value, separate flag
- Type conversion: number ↔ string, JS-compatible functions (`parseInt`, `parseFloat`)
- `Date` — creation, methods, formatting
- Arrays: `T[]` (dynamic), `T[N]` (fixed), methods, functional methods
- `Slice<T>` / `MutSlice<T>` — zero-copy view
- `Map<K,V>`, `Set<T>` — API, ownership, embedded patterns
- `Object` — static methods
- Tuples: fixed, labeled, readonly, optional, rest, spread
- `Clone` — interface, `clone()`, `structuredClone()`
- Type aliases (`type`)
- String literal union
- Utility types: `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`
- `Buffer`, `DataView`

**Source:** `spec/03-types.md`

---

### 04-classes.md — Classes, Interfaces, Enum, Generics

**Goal:** the language's object system.

- Generics: syntax, bounds (`implements`/`extends`), monomorphization, ownership with generics
- Extension methods: declaration, import, conflicts
- Enum: numeric, string, `const enum`, utilities, in switch/match
- Interfaces: data vs contract with methods, fat pointer, vtable
- `instanceof` — type narrowing via vtable
- Classes:
  - No inheritance (except `extends Error`), composition
  - Modifiers: `public`, `private`, `static`, `mut`, `move`
  - Semantics of `this` and field access
  - `readonly` fields
  - Constructor: auto-generation, explicit, `private`
  - Value object pattern
  - Builder pattern with `move`
- Alignment: `@packed`, `@align(N)`, padding diagnostics
- Decorators: overview, reference to full section

**Source:** `spec/04-classes.md`, `spec/13-decorators.md`

---

### 05-memory.md — Memory Model and Ownership

**Goal:** the language's key feature — safe memory management.

- Ownership types: `T` (Owner), `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>`, `Slice<T>`
- Basic rules: primitives copy, complex types — ownership
- Owner (T): move on assignment and pass
- `Ref<T>`: immutable borrow, rules, forbidden in fields, workaround patterns
- `Mut<T>`: mutable borrow, one at a time
- `Shared<T>`: ARC, `Weak<T>` for breaking cycles
- Borrow Checker Rules (4 rules)
- Argument passing matrix (let/const/Ref/Mut/Shared → Ref/Mut/T/Shared)
- Interior Mutability — why it's not present
- `@static let` — global mutable state
- Scope Constraint (without lifetime annotations): 4 rules
- Automatic Drop and `goto cleanup`
- `Iterable<T>` — user-defined iterable types
- Field access and destructuring (borrow vs move)
- Slices (borrow vs owned)
- Move from array, mutation during borrow
- Returning borrow from method
- Closures: capture rules, explicit capture list, Mut-closure via await

**Source:** `spec/05-memory.md`

---

### 06-errors.md — Error Handling

**Goal:** error system — Result-based without setjmp/longjmp.

- Principle: `throw`/`try`/`catch` in TS → Result structures in C
- Declaring `throws` in signature
- `Error` — base class, `error.stack`
- `throw`, `try`/`catch`/`finally`
- Union catch, exhaustive handling
- `?` operator (propagate)
- `!` operator (unwrap/panic)
- C output: Result structures, `if/else` on `ok` and `_kind`
- Ownership during errors (cleanup via `goto`)
- Limitations

**Source:** `spec/06-errors.md`

---

### 07-concurrency.md — Concurrency

**Goal:** three levels of concurrency and how to use them.

- Overview of three mechanisms (async/await, threads, ISR)
- **Async/Await:**
  - Async runtime architecture (state machines)
  - State machine size, stack safety on embedded
  - `Promise<T>`: creation, `.then`/`.catch`/`.finally`
  - `Promise.all`, `Promise.any`, `Promise.race`, `Promise.allSettled`
  - Rules of `await`, `async main`
  - Recursive async functions
  - `@embedded.stack` — explicit stack
  - Task cancellation: `AbortController`, `AbortSignal`
  - `AsyncMutex`
- **Threads (std/threads):**
  - Isolates without shared memory
  - `Atomic<T>`, `AtomicArray<T>`
  - `channel<T>`: bounded MPMC, ISR-safe operations
  - `select`: waiting on multiple channels
  - `Readonly<T>`: zero-copy sharing
  - `Thread<T>`: typed result
  - Thread.spawn rules, Send check
- **@embedded.isr:**
  - `Volatile<T>` — MMIO registers
  - ISR: signature, rules, patterns
  - `std/sync` — critical sections
  - `EmbeddedSignal` — ISR → async bridge
- Embedded annotations: `@embedded.inline`, `@embedded.noHeap`
- `@signal` — POSIX signals (desktop)
- Async generators: `async function*`, `for await`, `close()`
- Cooperative multitasking via generators

**Source:** `spec/07-concurrency.md`

---

### 08-modules.md — Modules and C Interop

**Goal:** how the module system works and C interop.

- Export: named, `export default` is forbidden
- Import: named, namespace, `import type`
- Module initialization order, cyclic imports
- Module-level variables
- Path aliases (`#`, `~`)
- Entry point: `"main"`, `"builds"`, C main generation
- Libraries: `"type": "library"`
- `.d.tsc` files: 5 kinds of declarations
  - C struct, opaque type, C functions, constants, MMIO registers
  - Link configuration (system, bundled, fetch)
- `native` — inline C (syntax, interpolation, limitations)
- Callbacks: `FnPtr<T>`, `TSC_CLOSURE_*` macros
- `unsafe {}` — disabling checks
- `@platform` — conditional compilation
- Declaration Merging
- Variadic C functions: `Scalar` type

**Source:** `spec/08-modules.md`

---

### 09-build.md — Build System

**Goal:** how a project, build, and packages are structured.

- Project types: executable, library, C-wrapper, platform package
- `tsc.package.json`: all fields
- C-wrapper: structure, publishing, link configuration (system/bundled/fetch)
- Platform package: `declare platform {}`, platform fields
- CLI: `tsclang build`, flags (`--outDir`, `--target`, `--profile`, `--optimize`)
- Package manager: `tsclang install`, `tsclang publish`, `tsclang search`
- Monorepo: `"workspaces"`
- Embedded builds: AVR, ARM, retro platforms
- CMakeLists.txt: generation, customization
- Profiles: debug/release, optimization

**Source:** `spec/09-build.md`

---

### 10-stdlib.md — Standard Library

**Goal:** reference for all stdlib modules.

- Principles: unified API via `std/`, lazy loading, tree-shaking
- Global objects: `console`, `Math`, `process`, timers, `performance`
- `Error` — base class
- `Map<K,V>`, `Set<T>` — API, ownership
- `Buffer`, `DataView`
- `std/io` — Reader/Writer
- `std/fs` — file operations
- `std/net` — fetch, HTTP server, TCP/UDP
- `std/ws` — WebSocket
- `std/math` — constants and methods (full table)
- `std/string` — Unicode, encoding, formatting
- `std/json` — parsing and serialization
- `std/url` — URL and URLSearchParams
- `std/blob` — Blob and File
- `std/formdata` — multipart/form-data
- `std/regex` — NFA regex, syntax, API
- `std/random` — Random, HardwareRandom
- `std/temporal` — PlainDateTime, Instant, Duration
- `std/reactive` — ReactiveVar, computed, effect
- `std/hal` — GPIO, UART, SPI, I2C
- `std/embedded` — Volatile, pointer, HashMap, StaticMap
- Platform compatibility (table)

**Source:** `spec/10-stdlib.md`, `spec/19-stdlib-*.md`

---

### 11-compiler.md — Compiler Architecture

**Goal:** for contributors and those who want to understand internals.

- Compilation phases (Parse → AST → Decorator → Typecheck → IR → Codegen)
- IR: basic blocks, instructions, phi nodes
- Name mangling (formal scheme)
- Debug info: `#line` directives, DAP server
- Consumer-side monomorphization
- Incremental compilation (roadmap)
- Optimization levels (O0–O3, Os)
- Error messages: format, categories, error codes

**Source:** `spec/11-compiler.md`

---

### 12-migration.md — Migration Guide: TypeScript → TSClang

**Goal:** help a TS developer migrate code.

- Automatic fixes (`tsclang migrate`)
- What works as-is (examples)
- What requires manual fixes (specific patterns)
- Incompatible patterns (table of alternatives)
- What TSClang adds (what's not in TS)

**Source:** `spec/12-migration.md`

---

## Summary Table of Sections

| # | File | Content | Source | Size |
|---|------|---------|--------|------|
| 01 | intro | What is TSClang, quick start, CLI | `spec/01-intro.md` | ~30 KB |
| 02 | syntax | Syntax, operators, loops, match/switch | `spec/02-syntax.md` | ~50 KB |
| 03 | types | Types, numbers, strings, arrays, Map/Set, tuples, utility types | `spec/03-types.md` | ~80 KB |
| 04 | classes | Classes, interfaces, enum, generics, extension methods | `spec/04-classes.md`, `spec/13-decorators.md` | ~40 KB |
| 05 | memory | Ownership, borrow checker, Ref/Mut/Shared, closures | `spec/05-memory.md` | ~50 KB |
| 06 | errors | throw/try/catch, Result, `?`/`!` operators | `spec/06-errors.md` | ~15 KB |
| 07 | concurrency | async/await, threads, ISR, atomic, channels, generators | `spec/07-concurrency.md` | ~70 KB |
| 08 | modules | Import/export, .d.tsc, native, unsafe, @platform | `spec/08-modules.md` | ~50 KB |
| 09 | build | Build, packages, C-wrapper, platforms | `spec/09-build.md` | ~50 KB |
| 10 | stdlib | Reference for all std modules | `spec/10-stdlib.md`, `spec/19-stdlib-*.md` | ~60 KB |
| 11 | compiler | Compiler architecture (for contributors) | `spec/11-compiler.md` | ~30 KB |
| 12 | migration | TypeScript → TSClang migration guide | `spec/12-migration.md` | ~15 KB |
| | | | **Total** | **~540 KB** |

## Recommended Writing Order

Recommended order (from most important and common to advanced):

1. `01-intro.md` — entry point for everyone
2. `02-syntax.md` — basic constructs
3. `05-memory.md` — key feature, needed by everyone
4. `03-types.md` — type system
5. `04-classes.md` — object system
6. `06-errors.md` — error handling
7. `08-modules.md` — modules and C interop
8. `07-concurrency.md` — concurrency
9. `10-stdlib.md` — API reference
10. `09-build.md` — build system
11. `12-migration.md` — migrating from TS
12. `11-compiler.md` — internals (for contributors)

## Size Estimate

| Document | Estimated Size |
|----------|----------------|
| 01-intro | ~30 KB |
| 02-syntax | ~50 KB |
| 03-types | ~80 KB |
| 04-classes | ~40 KB |
| 05-memory | ~50 KB |
| 06-errors | ~15 KB |
| 07-concurrency | ~70 KB |
| 08-modules | ~50 KB |
| 09-build | ~50 KB |
| 10-stdlib | ~60 KB |
| 11-compiler | ~30 KB |
| 12-migration | ~15 KB |
| **Total** | **~540 KB** |

## Format

- Markdown (.md)
- Each file is a self-contained section
- H1 headings for section titles, H2/H3 for subsections
- Tables for reference information
- Code blocks with language specifier (```typescript, ```c, ```bash)
- `> **Note:**` for important remarks
- `> **Warning:**` for critical limitations
