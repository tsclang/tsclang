# CONTEXT.md — TSClang Internal Knowledge Base

> **Purpose:** Self-contained knowledge dump for AI sessions. Read this FIRST. Last updated: 2026-07-04.

---

## 1. TL;DR

**TSClang** = TypeScript-like language (`.tsc`) compiled to C. Stack: Node.js ESM.
- **Monorepo (pnpm workspaces):** `@tsclang/ast` (pure AST/token/symbol types) · `@tsclang/compiler` (core library: lexer→parser→codegen→C + runtime + profiles) · `@tsclang/cli` (binary: dispatcher + commands + LSP) · `@tsclang/pm` (package manager domain: lock/manifest/registry/semver — mock prototype) · `@tsclang/tests` / `@tsclang/test-engine` · `@tsclang/spec`
- **Compiler:** `packages/compiler/src/compiler/` (lexer → parser → codegen → C). Public API barrel: `packages/compiler/src/index.ts`. `strict: true`, ZERO @ts-nocheck.
- **Runtime:** `packages/compiler/src/runtime/runtime.h` (single-header C library)
- **CLI:** `packages/cli/src/index.ts` (диспетчер) → `packages/cli/src/cli/commands/*.ts`
- **Tests:** 1829 spec-based tests (`--no-gcc`) + 135 engine tests
- **Targets:** desktop, AVR, NES, Genesis, Spectrum, DOS, PS2, WASM
- **Next goal:** Self-hosting (#47–#50)

---

## 2. Compiler Pipeline

```
input.tsc → lexer.ts → parser.ts → [optimizer.ts] → codegen.ts → runtime.h → output.c
```

**Entry points:** `codegen()` in `codegen.ts:26`, `compileTsc()` in `compile.ts` (recursive imports).

**Pre-scan:** Populates `this.classes`, `this.interfaces`, function signatures before body codegen.

**Generics:** Monomorphization in `generics.ts`. Each instantiation generates separate C code.

**Module bundling:** `compileTsc()` recursively compiles imports. Module prefix mangles all C symbols.

---

## 3. Codegen Architecture

**Context class** (~1710 lines). **Fully typed** (Phase 2.3+2.4): 185 typed properties (100 constructor + 85 dynamic), no `[key: string]: any`, zero `any` annotations in entire compiler. All codegen logic is **free functions** (`emitFoo(ctx, ...)` ) — mixin objects, `Object.assign`, declaration merging, `fn.bind(ctx)` all eliminated. Extracted state: `ScopeManager`, `BorrowTracker`, `OutputBuffer`.

**Module map (free functions, not mixins):** `top-level/` (7), `stmt/` (5), `expr/` (5), `calls/` (9), `types/` (4), `misc/` (5), `async/` (6), `stdlib-registry.ts`, `resolve.ts`, `infer.ts`.

**Common patterns:** `_ensureXxx()` (lazy typedefs), `exprToC(ctx, node)` (expr→C), `define()`/`lookup()` (scope), `hoistClosure()` (lambda lifting).

**Phase 2.4 COMPLETE (all steps):** `resolve.ts` + `infer.ts` converted from last 2 mixin objects to free functions. `TypeChecker` class deleted (was only a `fn.bind(ctx)` binder). Zero mixin objects remain. Phase A/B split (type declarations before functions). Explicit monomorphization pre-pass (`generics.ts`). `CodeGenThis` alias removed. ~232 delegating methods on Context retained as **dependency inversion layer** (breaks ESM circular imports between 10+ subsystems — not dead code). Pure pre-pass architecture rejected: type tables mutate during codegen, memoization unsafe (#153 analysis).

---

## 4. Type System → C Mapping

See `spec/03-types/` for full details. Key mappings:

| TSC | C | Notes |
|-----|---|-------|
| `i32` | `int32_t` | AVR `int`=16bit! |
| `f64` | `double` | `defaultNumber` on desktop |
| `d32` | `d32_t` (= `int32_t`) | Decimal fixed-point, scale=10000, 4 dp |
| `string` | `String` (struct) | ARC, NOT `char*` |
| `T[]` | `Array_T` | heap, growable |
| `T \| null` | `opt_T` | `{ bool has_value; T value; }` |
| `Ref<T>` | `const T*` | immutable borrow |
| `Arc<T>` | `T*` + refcount | desktop only |

**Critical:** `boolean`/`string` (TSC) vs `bool`/`String` (C). Reserved prefixes: `ref_`, `mut_`, `arc_`, `opt_`, `Array_`, `Result_`.

---

## 5. Ownership Model

| Operation | Primitive | String | Class/Array |
|-----------|-----------|--------|-------------|
| `let b = a` | copy | retain | **move** + zero-out |
| `foo(a)` (T param) | copy | borrow | **move** |
| `foo(a)` (Ref param) | copy | borrow | borrow |
| `return a` | copy | retain | move |

**Borrow checker:** Aliasing XOR mutability. `Ref<T>` multiple OK, `Mut<T>` exclusive. Use-after-move = E002.

**Cleanup:** `_blockCleanupStack`, `_heapVarStack`. Throws functions use `_cleanup:` label. Auto-destructors for classes with string fields.

**Arc/Weak:** `_refcount`/`_weakcount` in struct. `allocator: 'static'` → Arc = error.

---

## 6. Async & Concurrency

**Async = state machines.** `scan.ts` collects await states, `async-emit.ts` emits poll function. Only vars crossing await boundary get promoted.

**Threads:** `Thread.spawn(fn)` — OS thread, no shared memory. Communication via `channel<T>`.

**Atomic/Volatile/ISR:** `Atomic<T>` for lock-free ops, `Volatile<T>` for MMIO, `@isr("VECTOR")` for interrupts.

---

## 7. Runtime (`runtime.h`)

Single-header C library. Key components: `String` (ARC), `Array_T` macros, `TscMap_K_V`, `opt_T`/`Result_T_E` structs, `tsc_arc_*`, `tsc_closure`, `tsc_format_double`.

**Platform headers:** `runtime_nes.h`, `runtime_wasm.h`. **Std headers:** `std/*.h` (fs, net, ws, hal, regex, etc.).

**12 profiles:** desktop, avr, avr-heap, avr-coop, arm, nes, spectrum, genesis, ps2, dos, wasm, wasm32. Capabilities: `bits`, `fpu`, `allocator`, `async`, `usize`, `defaultNumber`, `posix`, etc.

---

## 8. Current State

### Tests: 1792 (spec-based) + 135 (engine)

**Spec-based:** 1792 pass, 0 fail, 2 skipped

| Section | Tests | Topic |
|---------|-------|-------|
| 02-syntax | 127 | Arithmetic, variables, formatting |
| 03-types | 412 | Numbers, enums, tuples, null |
| 04-ownership | 116 | Ownership, Arc, Weak, Clone |
| 06-functions | 66 | Functions, closures, overloads |
| 08-collections | 236 | Arrays, Map, Set, strings |
| 09-errors | 47 | throws, try/catch, bare-throws |
| 14-stdlib | 302 | console, Math, Date, JSON, std/* |

### Deferred / NOT YET

- IR/SSA pipeline (post-self-hosting)
- Borrow elision for field access
- Full Descriptor API, FnPtr, auto-constructor
- instanceof narrowing, full grapheme segmentation

### Project tracking

- **Branch:** `develop` on `https://github.com/tsclang/tsclang.git`
- **Open:** #23, #30–#31 (IR), #32 (bindgen), #33 (QNX), #47–#50 (self-hosting), #72–#82 (epics), #178 (AsyncMutex), #179 (warnings), #180 (decimal types)
- **Closed:** #66, #67 (throws on methods), #69 (saturatingCast), #101 (no-lossy-cast + safe alternatives), #111 (Number.*), #132–#137 (test engine), #149 (monorepo consolidation), #150–#152 (Phase 2 typing), #153–#165 (Phase 2.4 functional passes — Variant E), #166–#172 (pre-existing test failures + Phase 2.4 Step 0), #173 (named fn .map() type inference), #174 (string concat 2-op leak + Return cleanup flush), #175 (escaping closure ref/mut compile error), #176 (recursive + mutual type alias forward declaration), #177 (run.ts warning print + expected.no-warning)

---

## 9. Gotchas

- **AVR `int` = 16-bit.** Use `%ld` + `(long)` for i32.
- **`%lld` unsupported** on avr-libc → `no-i64-print` auto-enabled.
- **`capacity = 0` = non-owning array** (view/slice). Mutating = UB.
- **`new Array(N)` → length=0** (NOT N like JS).
- **Spread/destructuring = ALWAYS copy.** Source stays alive.
- **`==` is `===`** — no type coercion.
- **`undefined` = `null`** — synonym.
- **Async `switch` → `if/else if`** (can't nest C switch).
- **`Ref<T>` across `await`** = E051 error.
- **`_ensureXxx()` pattern** — ALWAYS use lazy guards.
- **Defined wrap for signed integers** — `+`/`-`/`*` emit unsigned cast to eliminate UB.
- **safe-math try/catch** — integer arithmetic in `safe-math` mode requires guard.
- **Context typing (Phase 2.3+2.4 COMPLETE).** Context class has 185 typed fields, NO `[key: string]: any`, ZERO `any` in compiler. All codegen logic is **free functions** (`emitFoo(ctx, ...)`), not mixin objects. No `Object.assign`, no declaration merging, no `fn.bind(ctx)`. `TypeChecker` deleted. ~232 delegating methods on Context are the **dependency inversion layer** (breaks ESM circular imports between subsystems). `@tsclang/ast` provides AST types: `Program`, `Expression`, `Stmt`, `Token`, `SymbolInfo` (with index signature for dynamic codegen props). Pipeline entry points typed: `parse(): { ast: Program, errors: TscError[] }`, `codegen(ast: Program, ...)`.
- **`implements_` runtime type.** Parser returns `string` for simple interfaces, `{ name: string; typeArgs: TypeAnn[] }` for generic ones — runtime is `(TypeRef | string)[]`. Use `_implName()` helper in `class.ts` to normalize.
- **Package model (monorepo).** All packages build to `dist/` (`.js` + `.d.ts`). Exports: `types`→`dist/*.d.ts`, `default`→`dist/*.js`. Run `pnpm build` after changes before testing via built JS. `pnpm tsclang` runs built JS (`node dist/index.js`); `pnpm tsclang:dev` runs from source via tsx (no build needed).
- **CLI runtime root.** `packages/cli/dist/index.js` (source: `src/index.ts`) resolves `COMPILER_ROOT` via `createRequire(import.meta.url).resolve('@tsclang/compiler')` to find `runtime/` + `profiles/` (they live in the compiler package, not cli).
- **KNOWN: `pnpm --filter` cwd bug (test-engine).** `pnpm test:engine` runs with cwd=package dir, which breaks repo-root-relative `file()` paths (2 file-param tests fail with doubled paths). Run engine tests via `pnpm tsx packages/test-engine/src/tests/run.ts` from repo root (135/135 pass). Fix: make `file()` resolve relative to test file, not cwd.
- **`_postStmtCleanups` in Return.** All Return paths in `control-flow.ts` now call `_flushPostStmtCleanups` before the actual return. Previously, temps created during return expression evaluation (e.g. string concat with non-String operand) were leaked. If adding new Return paths, always flush post-stmt cleanups before the return.
- **Named fn callbacks in `.map()`.** `infer.ts` handles both `Arrow` and `Ident` callbacks. Codegen (`_extractCallbackFn`) already worked — only type inference needed the fix. String array callbacks still have calling convention mismatch (macro passes `String *`, named fn takes `String` by value) — use arrow functions for string arrays.

---

## 10. Quick Reference: Task → File

| Task | File |
|------|------|
| Add AST node | `packages/ast/src/ast.ts` |
| Add statement | `stmt/index.ts` + `stmt/*.ts` |
| Add expression | `expr/dispatch.ts` + `expr/*.ts` |
| Add array/Map/Set method | `calls/stdlib.ts` + `types/infer.ts` (free functions) + `runtime.h` |
| Add stdlib module | `stdlib-registry.ts` (free functions) + `calls/call-dispatch.ts` |
| Add builtin (console, Math) | `stdlib-registry.ts` + `calls/builtin.ts` |
| Add type annotation | `types/resolve.ts` + `types/infer.ts` (free functions) |
| Add decorator | `top-level/decorators.ts` + `parser.ts` |
| Add platform profile | `profiles/<name>/index.d.tsc` + `profile-loader.ts` |
| Add strict rule | `codegen.ts` (_strictRules) + relevant file + spec |
| Fix borrow error | `codegen.ts` + `stmt/vardecl.ts` + `expr/assign.ts` |
| Fix async codegen | `async/scan.ts` + `async/async-stmt.ts` + `async/async-emit.ts` |
| Add test | `packages/tests/test/cases/<NN>/<feature>/<name>/` |
| Run tests | `pnpm tsx packages/tests/test/runner.ts 03-types` |
| Compile manually | `node packages/cli/dist/index.js build input.tsc --outDir .tsclang-tmp/` |

---

## 11. CLI Architecture

`packages/cli/dist/index.js` (source: `src/index.ts`) — slim dispatcher (lives in `@tsclang/cli`, separate from the compiler library). Resolves `COMPILER_ROOT` via `require.resolve('@tsclang/compiler')` to locate `runtime/`+`profiles/` (those stay in the compiler package). Commands: build, run, test, init, lint, format, explain, emit-dts, validate-config, install, update, search, publish, lsp.

Module map (all under `packages/cli/src/cli/`): `args.ts`, `help.ts`, `helpers.ts`, `registry.ts`, `config-validator.ts`, `profile-loader.ts`, `cmake.ts`, `semver.ts` (top-level `src/`), `formatter.ts` (top-level `src/`), `types/` (package-type, emit), `cli/commands/*.ts`, `lsp/server.ts`.

---

## 12. Test Engine (`packages/test-engine/`)

- **API:** describe, test, expect (matchers), hooks (beforeEach/afterEach), 4-phase pipeline
- **Backends:** gcc, clang, msvc, avr-gcc, wasm (pluggable)
- **CLI:** `tsclang test` → `tsclang-test` (subprocess)
- **File testing:** `file` parameter + `compileTsc()` for recursive imports
- **Spec:** `packages/spec/spec/13-build/` (CLI), `packages/test-engine/README.md`

---

## 13. Throws on Methods

Methods declare `throws` like functions. `emitMethod` builds `throwsCtx`. `_methodNames` stores `_isThrowsFunc`. Bare-throws detection works for `obj.method()`. Spec: `09-errors/09-errors.md`.

---

## 14. Math.saturatingCast/checkedCast

`saturatingCast<T>(x)` — clamp to range. `checkedCast<T>(x)` — return `T | null`. Escape hatch for `no-lossy-cast`. Inline C in `builtin-helpers.ts`. Spec: `14-stdlib/14-stdlib.md` + `13-strict-mode.md`.

---

## 15. Decimal Fixed-Point Types (#180 — Phase 1-4 DONE)

**Phase 1-4 implemented.** 37 tests pass. See issue #180 for full plan.

### Implemented (Phase 1-4)

- Type registration: `d8`/`d16`/`d32`/`d64` in `NUMBER_TYPES`, `PRIMITIVE_MAP` (`d8_t`/`d16_t`/`d32_t`/`d64_t`), runtime typedefs.
- Literal conversion: `literalToCTyped` scales float literals to integers (e.g., `1.5` → `15000` for d32). `scaleLiteral()` uses round-half-away-from-zero.
- Negative literals: `vardecl.ts` handles `Unary('-', Literal)` for decimal types only.
- `defaultNumber: "d32"` etc. makes `number` resolve to decimal ctype via `_effectiveType` in `infer.ts`.
- FPU check: `program.ts` pre-scan skips float-literal rejection inside decimal-typed `VarDecl` init (context-aware `skipFloatLiterals` flag).
- **Arithmetic:** `+`/`-` plain integer ops (same scale). `*` via `tsc_mul_dXX()` runtime helpers (wider intermediate, round-half-away-from-zero). `/` via `tsc_div_dXX()` + div-by-zero guard. `%` plain integer + div-by-zero guard. Mixed decimal types → compile error.
- **Compound assignment:** `+=`/`-=` work directly. `*=`/`/=` use runtime helpers.
- **Casts (`as`):** Scale-aware conversion. int→dec: `*scale`, dec→int: `/scale` (truncate), dec→dec widen: `*(dstScale/srcScale)`, dec→dec narrow: `/(srcScale/dstScale)` (truncate), dec↔float: `/scale.0` or `*scale.0`. `_isSafeWidening` updated for decimal kinds.
- **Formatting:** `console.log`, template literals, `.toString()`, string concat all use `tsc_dec_dtoa()` / `tsc_dXX_to_string()` — fixed decimal places (d8/d16=2dp, d32=4dp, d64=8dp).
- Key files: `decimal.ts`, `helpers.ts`, `literals.ts`, `infer.ts`, `vardecl.ts`, `program.ts`, `operators.ts`, `assign.ts`, `dispatch.ts`, `console.ts`, `closures.ts`, `runtime.h`.
- Spec: `03-types/03-decimal-types.md`.

### Roadmap (Phase 5)

- **Phase 5:** Math + Platform (Math.sqrt/abs on decimal, Math.roundCast/saturatingCast/checkedCast for decimal).