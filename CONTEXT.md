# CONTEXT.md — TSClang Internal Knowledge Base

> **Purpose:** Self-contained knowledge dump for AI sessions. Read this FIRST. Last updated: 2026-06-29.

---

## 1. TL;DR

**TSClang** = TypeScript-like language (`.tsc`) compiled to C. Stack: Node.js ESM.
- **Monorepo (pnpm workspaces):** `@tsclang/ast` (pure AST/token/symbol types) · `@tsclang/compiler` (core library: lexer→parser→codegen→C + runtime + profiles) · `@tsclang/cli` (binary: dispatcher + commands + LSP) · `@tsclang/pm` (package manager domain: lock/manifest/registry/semver — mock prototype) · `@tsclang/tests` / `@tsclang/test-engine` · `@tsclang/spec`
- **Compiler:** `packages/compiler/src/compiler/` (lexer → parser → codegen → C). Public API barrel: `packages/compiler/src/index.ts`. `strict: true`, ZERO @ts-nocheck.
- **Runtime:** `packages/compiler/src/runtime/runtime.h` (single-header C library)
- **CLI:** `packages/cli/src/index.ts` (диспетчер) → `packages/cli/src/cli/commands/*.ts`
- **Tests:** 1764 spec-based tests (`--no-gcc`) + 135 engine tests
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

**Context class** (~888 lines, 51 mixin files). Extracted state: `ScopeManager`, `BorrowTracker`, `OutputBuffer`, `TypeChecker`.

**Module map:** `top-level/` (7), `stmt/` (5), `expr/` (5), `calls/` (9), `types/` (4), `misc/` (5), `async/` (6).

**Common patterns:** `_ensureXxx()` (lazy typedefs), `exprToC(node)` (expr→C), `define()`/`lookup()` (scope), `hoistClosure()` (lambda lifting).

---

## 4. Type System → C Mapping

See `spec/03-types/` for full details. Key mappings:

| TSC | C | Notes |
|-----|---|-------|
| `i32` | `int32_t` | AVR `int`=16bit! |
| `f64` | `double` | `defaultNumber` on desktop |
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

### Tests: 1764 (spec-based) + 127 (engine)

| Section | Tests | Topic |
|---------|-------|-------|
| 02-syntax | 124 | Arithmetic, variables, formatting |
| 03-types | 398 | Numbers, enums, tuples, null |
| 04-ownership | 116 | Ownership, Arc, Weak, Clone |
| 09-errors | 46 | throws, try/catch, bare-throws |
| 14-stdlib | 302 | console, Math, Date, JSON, std/* |

### Deferred / NOT YET

- IR/SSA pipeline (post-self-hosting)
- Borrow elision for field access
- Full Descriptor API, FnPtr, auto-constructor
- instanceof narrowing, full grapheme segmentation

### Project tracking

- **Branch:** `develop` on `https://github.com/tsclang/tsclang.git`
- **Open:** #23, #30–#31 (IR), #32 (bindgen), #33 (QNX), #47–#50 (self-hosting), #72–#82 (epics)
- **Closed:** #66, #67 (throws on methods), #69 (saturatingCast), #111 (Number.*), #132–#137 (test engine)

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
- **Package model (monorepo).** `@tsclang/compiler` `exports` splits `types`→`dist/*.d.ts` (for tsc of consumers) and `default`→`src/index.ts` (for tsx runtime). Editing compiler source needs NO rebuild for tsx tests; run `pnpm build` only to refresh declarations consumed by `@tsclang/cli` / `@tsclang/test-engine` typecheck.
- **CLI runtime root.** `packages/cli/src/index.ts` resolves `COMPILER_ROOT` via `createRequire(import.meta.url).resolve('@tsclang/compiler')` to find `runtime/` + `profiles/` (they live in the compiler package, not cli).
- **KNOWN: `pnpm --filter` cwd bug (test-engine).** `pnpm test:engine` runs with cwd=package dir, which breaks repo-root-relative `file()` paths (2 file-param tests fail with doubled paths). Run engine tests via `pnpm tsx packages/test-engine/src/tests/run.ts` from repo root (135/135 pass). Fix: make `file()` resolve relative to test file, not cwd.

---

## 10. Quick Reference: Task → File

| Task | File |
|------|------|
| Add AST node | `ast-types/ast.ts` |
| Add statement | `stmt/index.ts` + `stmt/*.ts` |
| Add expression | `expr/dispatch.ts` + `expr/*.ts` |
| Add array/Map/Set method | `calls/stdlib.ts` + `types/infer.ts` + `runtime.h` |
| Add stdlib module | `stdlib-registry.ts` + `calls/call-dispatch.ts` |
| Add builtin (console, Math) | `stdlib-registry.ts` + `calls/builtin.ts` |
| Add type annotation | `types/resolve.ts` + `types/infer.ts` |
| Add decorator | `top-level/decorators.ts` + `parser.ts` |
| Add platform profile | `profiles/<name>/index.d.tsc` + `profile-loader.ts` |
| Add strict rule | `codegen.ts` (_strictRules) + relevant file + spec |
| Fix borrow error | `codegen.ts` + `stmt/vardecl.ts` + `expr/assign.ts` |
| Fix async codegen | `async/scan.ts` + `async/async-stmt.ts` + `async/async-emit.ts` |
| Add test | `packages/tests/test/cases/<NN>/<feature>/<name>/` |
| Run tests | `pnpm tsx packages/tests/test/runner.ts 03-types` |
| Compile manually | `pnpm tsx packages/cli/src/index.ts build input.tsc --outDir .tsclang-tmp/` |

---

## 11. CLI Architecture

`packages/cli/src/index.ts` — slim dispatcher (lives in `@tsclang/cli`, separate from the compiler library). Resolves `COMPILER_ROOT` via `require.resolve('@tsclang/compiler')` to locate `runtime/`+`profiles/` (those stay in the compiler package). Commands: build, run, test, init, lint, format, explain, emit-dts, validate-config, install, update, search, publish, lsp.

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