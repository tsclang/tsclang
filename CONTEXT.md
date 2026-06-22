# CONTEXT.md — TSClang Internal Knowledge Base

> **Purpose:** Self-contained knowledge dump for AI sessions. Read this FIRST — no need to re-read spec/ unless doing specific work. Last updated: 2026-06-22 (JS→TS migration complete, #81-#90 closed. 6/8 strict options enabled).

---

## 1. TL;DR

**TSClang** = TypeScript-like language (`.tsc`) compiled to C. Stack: Node.js ESM.
- **Compiler:** `src/compiler/` (lexer.ts → parser.ts → codegen.ts → C string). JS→TS migration complete (#81-#90). ZERO .js files. All 74 project files are .ts. 6/8 strict options enabled. 54 files have @ts-nocheck (#91 removes them).
- **Runtime:** `src/runtime/runtime.h` (C header, included in every output)
- **CLI:** `bin/index.ts` (`tsclang build|run|init|lint|...`)
- **Tests:** `tsx test/runner.ts 03-types` (15 spec-based dirs, **1749 tests**, all pass)
- **Build:** `npm run typecheck` (tsc --noEmit, 6 strict options), `npm run build` (tsc → dist/), `tsx` for dev
- **Targets:** desktop (libuv), embedded (AVR, no heap), retro (NES/Genesis/Spectrum), WASM
- **Design:** TS syntax + C backend + Rust-style ownership (no GC, no manual free)
- **Next goal:** #57 (NaN/Infinity), then self-hosting.

---

## 2. Compiler Pipeline

```
input.tsc
  → lexer.ts        (lex → tokens)
  → parser.ts       (parse → AST, returns { ast, errors } with recovery)
  → [optimizer.ts]  (optional: --opt, AST-level: const fold, dead branch, strength reduce)
  → codegen.ts      (codegen(ast, filename, src, opts) → { c, warnings, exports })
      └─ Context class walks AST → emits C string
  → runtime.h       (prepended to output, provides all C types/macros)
  → output.c        (→ gcc/avr-gcc/emcc → binary/hex/wasm)
```

**Key entry points:**
- `codegen()` in `codegen.ts:26` — creates `Context`, calls `visitProgram(ast)`, returns `ctx.emit()`
- `Context.visitProgram(ast)` in `top-level/program.ts` — dispatches top-level nodes
- `visitStmtInMain(node)` in `stmt.ts` — thin dispatcher for statements
- `exprToC(node)` in `expr/dispatch.ts` — main expression → C string converter

**Pre-scan phase:** Before codegen of function bodies, compiler pre-scans top-level declarations to populate `this.classes`, `this.interfaces`, `this._typeAliases`, function signatures (for overloads), and platform capability checks. (Note: Result type emission is now **lazy** per-function via `_emittedResultTypes` Set in `func.ts`, not pre-scanned.)

**Generics:** Monomorphization in `generics.ts`. Each concrete instantiation (`Box<i32>`) generates separate C code. `_genericClasses` / `_genericFuncs` Maps track instantiations. `substNode` substitutes typeArgs in AST.

**Module bundling:** `bin/index.ts` `compileTsc()` recursively compiles imports. Each module gets `modulePrefix` (basename). All top-level C symbols mangled with prefix. `opts.libraryMode` = emit without `#include`/`main()`.

---

## 3. Codegen Architecture

### Context class (`codegen.ts:109`)

God-object with ~300+ methods (~827 lines). Split across **49 files** via mixin pattern (modules export a function that adds methods to `Context.prototype`).

**Extracted state objects** (delegated from Context):
- `ScopeManager` (`codegen/scope-manager.ts`) — scope stack, `define()`/`lookup()`.
- `BorrowTracker` (`codegen/borrow-tracker.ts`) — Ref/Mut borrow tracking, quarantine, scope-exit cleanup.
- `OutputBuffer` (`codegen/output-buffer.ts`) — output sections (`includes`/`typedefs`/`topLevel`/`mainStmts`/`lambdaLines`), `addTop()`/`addLambda()`.
- `TypeChecker` (`typechecker.ts`) — type resolution + inference (resolveType, inferType, _effectiveType, etc.). **Proxy-based delegation**: forwards `this.X` to `this.ctx.X`. Context delegates via wrapper methods.

**IR pipeline — DEFERRED:** Prototype removed. Spec retained as `[PLANNED]` in `spec/16-tooling/16-compiler.md`. Revisit post-self-hosting (#30).

### Module map

| Directory | Files | Responsibility |
|-----------|-------|----------------|
| `codegen.ts` | 1 | `codegen()` entry, `Context` class, cleanup core, `emit()` assembly |
| `codegen/scope-manager.ts` | 1 | **ScopeManager** — scope stack, `define()`/`lookup()`/`pushScope()`/`popScope()` |
| `codegen/borrow-tracker.ts` | 1 | **BorrowTracker** — Ref/Mut borrow tracking, quarantine, scope-exit cleanup |
| `codegen/output-buffer.ts` | 1 | **OutputBuffer** — output sections, `addTop()` smart routing, `addLambda()` |
| `top-level/` | 6 | `dispatch.ts` (entry), `program.ts` (visitProgram, pre-scan), `func.ts`, `class.ts`, `types-alias.ts`, `decorators.ts` |
| `stmt/` | 4 | `index.ts`→`stmt.ts` (visitStmtInMain dispatcher), `vardecl.ts` (let/const), `control-flow.ts` (if/while/for/switch/try-catch/break/continue), `destruct.ts`, `match.ts` |
| `expr/` | 4 | `index.ts`→`dispatch.ts` (exprToC), `operators.ts`, `assign.ts`, `literals.ts` |
| `calls/` | 8 | `call-dispatch.ts` (function calls), `method-dispatch.ts` (method calls, chains), `console.ts`, `stdlib.ts` (Map/Set/array methods), `builtin.ts`, `builtin-helpers.ts`, `conversion.ts` (parseInt/toString), `concurrency.ts` (Atomic/channel/spawn) |
| `types/` | 3 | `resolve.ts` (TSC type → C type), `infer.ts` (expression type inference), `helpers.ts` (`_ensure*Struct`, `_wrapOptValue`, mangle helpers) |
| `misc/` | 4 | `index.ts`, `arrays.ts` (array literals), `closures.ts` (lambda hoisting, capture), `new-expr.ts` (new X()), `emit-helpers.ts` (spawn, Thread) |
| `async/` | 5 | `index.ts`, `async-stmt.ts` (emit async statements), `async-emit.ts` (state machine poll fn), `generator.ts`, `scan.ts` (collect await states, liveness), `helpers.ts` |
| `types.ts` | 1 | `PRIMITIVE_MAP`, `toCType`, `mangleType`, `fmtSpec`, `inferLiteralCType` |

### Key Context state (the `this.*` properties)

**Symbol table & scope (delegated to ScopeManager):**
- `this.classes` — `Map<name, { fields, methods, decorators, _isHeap, _isPool, ... }>`
- `this.interfaces` — `Map<name, { methods }>`
- `this._typeAliases` — `Map<name, TypeRef>`
- `define(name, info)` — auto-marks heap vars, delegates to `_scopeMgr`. `info` = `{ ctype, varKind, isRefParam, isMutParam, isArc, isWeak, _moved, ... }`

**Borrow tracking** — delegated to `BorrowTracker`. Context coordinates `pushScope()`/`popScope()` across both ScopeManager + BorrowTracker. `_checkBorrowsAcrossAwait` and `_trackBorrowForRefReturn` stay on Context (need `this.error()`/`this.interfaces`). See Section 5 for semantics.

**Cleanup system** — `_blockCleanupStack` (per-block), `_heapVarStack` (auto-free at scope), `_loopCleanupStack` (labeled break), `_usesGotoCleanup` (throws functions). `_emitFuncCleanup()` emits all pending before return/throw. `_snapshotHeapMoved`/`_restoreHeapMoved` for conditional paths. See Section 5 for semantics.

**Lazy emission guards** — `_emittedArrayStructs`/`_emittedOptStructs`/`_emittedResultTypes`/`_emittedTuples`/`_emittedMapStructs` Sets. Pattern: `_ensureXxx(name, ...)` checks Set → emit typedef → add to Set.

**Capabilities & config:**
- `this._capabilities` — `{ allocator, async, fpu, bits, usize, defaultNumber, posix, strtoll, console_uart, os }`
- `this._cap(key)` — capability lookup with DESKTOP_CAPABILITIES fallback
- `this._ptrBytes()` — pointer size from `_cap('usize')`: `{u16:2, u32:4, u64:8}`
- `this._strictRules` — `Set<string>` (`no-any`, `safe-math`, `no-closures`, ...)
- `this._defaultNumber` — Priority: CLI > builds > profile > DESKTOP_CAPABILITIES ('f64')

**Output buffers** — delegated to `OutputBuffer`. `ctx.emit()` assembles: includes + typedefs + lambdaLines + topLevel + `int main() { mainStmts }`.

### Common patterns

- **`_ensureXxx(name, ...)`** — lazy struct/typedef generation. Check Set → emit → add to Set.
- **`exprToC(node)`** — returns C string. Switch on `node.kind` (`'Ident'`, `'Binary'`, `'Call'`, `'Member'`, `'Index'`, `'Lambda'`, etc.)
- **`this.define(name, {ctype, varKind, ...})`** — registers variable in scope
- **`this.lookup(name)`** — searches scope stack bottom-up
- **`this.error(msg, node)` / `this.warn(msg)`** — diagnostics (TscError, rustc-style)
- **`_checkMoved(sym, node, name)`** — E002 use-after-move check
- **`_postStmtCleanups`** — deferred cleanups after statement (e.g., zero-out after move)
- **`hoistClosure(node, ...)`** — lifts lambda to file-scope function + env struct

---

## 4. Type System → C Mapping

### Primitive types (`types.ts: PRIMITIVE_MAP`)

| TSC type | C type | printf fmt | Notes |
|----------|--------|------------|-------|
| `number` | `double` | `%g` | resolves to `defaultNumber` C type per profile (f64/f32/i32/i16) |
| `i8` | `int8_t` | `%d` | |
| `i16` | `int16_t` | `%d` | |
| `i32` | `int32_t` | `%d` desktop, `%ld`+(long) when `_cap('bits') < 32` | AVR `int`=16bit! |
| `i64` | `int64_t` | `%lld` | no-i64-print strict rule on embedded |
| `u8`–`u64` | `uint8_t`–`uint64_t` | `%u`/`%lu`/`%llu` | |
| `f32` | `float` | `%g` | |
| `f64` | `double` | `%g` | |
| `boolean` | `bool` | `%d` (0/1) | TSC name = `boolean`, NOT `bool` |
| `usize` | `size_t` | `%zu` desktop, `%u`+cast when `_cap('bits') < 32` | platform-dependent (u16/u32/u64) |
| `isize` | `ptrdiff_t` | `%td` | |
| `char` | `uint8_t` | `%c` | single-char string `'A'` = char code |
| `void` | `void` | — | |
| `string` | `String` | `%.*s` + `.data,.length` | immutable ARC struct, NOT `char*` |

**CRITICAL:** TSC uses `boolean`/`string` (lowercase). `bool`/`String` (capitalized) are REJECTED as TSC types — they're C-only.

### String struct (runtime.h)
```c
typedef struct {
    char* data;       // UTF-8 bytes
    size_t length;    // byte count (NOT char count)
    size_t capacity;  // 0 = literal/rodata (non-owning), >0 = heap (ARC)
    #ifndef TSC_EMBEDDED
    uint32_t _refcount;  // ARC refcount (desktop only)
    #endif
} String;
```
- `capacity = 0` → literal, no ARC (retain/release = no-op)
- `capacity > 0` → heap-allocated, ARC managed
- `tsc_string_retain(s)` / `tsc_string_release(s)` — ARC ops
- String params = **implicit borrow** (caller owns, no retain/release in callee)

### Complex types → C

| TSC type | C representation | Notes |
|----------|-----------------|-------|
| `T` (owned class) | `T value` (stack value type) | move on assign, `_free()` destructor |
| `T[]` (dynamic array) | `Array_T { T* data; size_t length; size_t capacity; }` | heap, growable |
| `T[N]` (fixed array) | `T name[N]` | stack, compile-time size |
| `[A, B]` (tuple) | `Tuple_A_B { A _0; B _1; }` | struct, labeled = dot access |
| `T | null` (nullable) | `opt_T { bool has_value; T value; }` or `{ bool has_value; T* ptr; }` | primitive vs complex |
| `Ref<T>` | `const T* ptr` | immutable borrow |
| `Mut<T>` | `T* ptr` | mutable borrow |
| `Arc<T>` | `T* ptr` + `_refcount`/`_weakcount` in struct | ARC, desktop only |
| `Weak<T>` | same struct as Arc | `tsc_weak_create`/`upgrade`/`release` |
| `Slice<T>` | `{ T* ptr; size_t length; }` | zero-copy view |
| interface w/ methods | fat ptr `{ void* self; const Iface_vtable* vtable; }` | dyn dispatch |
| `@heap` class | `T* ptr` (malloc'd) | heap-allocated, auto-free at scope |
| `@pool(N)` class | `opt_ref_T { bool has_value; T* value; int idx; }` | static pool in BSS |
| `@struct` class | `T value` (no vtable, no methods) | pure value type |
| `unknown` | `tsc_unknown { uint32_t type_id; vtable* vtable; uint8_t buffer[24]; }` | type-tagged container |

### Name mangling (`types.ts: mangleType`)

```
foo(i32, string)     → foo_i32_string
Array<T>             → Array_T (e.g., Array_string, Array_i32)
T | null             → opt_T (e.g., opt_i32, opt_string)
Ref<T>               → ref_T (pointer)
Map<K,V>             → TscMap_K_V (e.g., TscMap_string_i32)
Result<T,E>          → Result_T_E (e.g., Result_i32_TscError)
```

Reserved prefixes (user types starting with these = error): `ref_`, `mut_`, `arc_`, `weak_`, `opt_`, `Array_`, `Tuple_`, `TscMap_`, `Result_`

---

## 5. Ownership Model

### Core rules

| Operation | Primitive | String | Class/Array |
|-----------|-----------|--------|-------------|
| `let b = a` | copy | retain (ARC copy) | **move** + zero-out source |
| `const b = a` | copy (const) | retain (ARC copy) | **move** + zero-out source |
| `b = a` (reassign) | copy | release old, retain new | release old, move new, zero-out source |
| `foo(a)` (T param) | copy | implicit borrow (no retain) | **move** (zero-out caller) |
| `foo(a)` (Ref param) | copy | borrow | borrow (`const T*`) |
| `foo(a)` (Mut param) | copy | borrow | borrow (`T*`) |
| `foo(a)` (Arc param) | N/A | N/A | ARC retain |
| `return a` | copy | retain (if borrowed expr) | move (no zero-out, scope ending) |
| spread / destruct | copy | copy + retain | **always copy** (source alive!) |
| `arr[i]` (read) | copy | ARC copy (retain) | borrow (`Ref<T>`) |
| `arr[i] = val` | assign | release old, retain new | assign |

### Borrow checker

- **Aliasing XOR mutability:** multiple `Ref<T>` OK simultaneously; only one `Mut<T>` exclusive; `Mut` + `Ref` = error.
- **Scope-based release:** borrows auto-released on `popScope()` via `_scopeBorrowStack`.
- **Use-after-move (E002):** accessing `_moved` symbol = compile error. Secondary span shows move location.
- **Move from array (E009):** `arr[i]` for complex types = borrow, can't move out by index.
- **Borrow across await (E051):** `Ref<T>` / `Mut<T>` alive across `await` = error. Must `.clone()` first.
- **Ref/Mut in class fields (E044):** forbidden — would dangle.
- **Ref return from function:** Conservative Union — all Ref/Mut args borrowed.

### Cleanup system

- **Block/loop/goto cleanup:** See Section 3 state vars. Owned vars freed at scope exit; throws functions use single `_cleanup:` label (O(N+M)).
- **Auto-destructors:** Classes with string fields get `ClassName_free()` auto-generated (releases strings, does NOT free struct — value types on stack).
- **@heap classes:** `ClassName_destructor(ptr)` + `tsc_free(ptr)` at scope exit.
- **@pool classes:** `ClassName_drop(&ref, idx)` returns slot to pool.

### Arc/Weak (ARC, desktop only)

- `Arc<T>` — `_refcount` + `_weakcount` embedded in struct. `tsc_arc_alloc` (calloc + refcount=1), `tsc_arc_retain`, `tsc_arc_release`.
- `Weak<T>` — `tsc_weak_create` (weakcount++), `tsc_weak_upgrade` → `Arc<T> | null`, `tsc_weak_release`.
- `allocator: 'static'` → `Arc<T>` = compile error.

---

## 6. Async & Concurrency

### Async = state machines

Async functions compile to a **poll struct + poll function** in C:
```c
typedef struct {
    int _state;            // current state (0 = initial)
    Result_T_E _await_0;   // await result storage
    ...promoted locals...  // only vars crossing await points
} asyncFunc_frame_N;

opt_T asyncFunc_poll_N(asyncFunc_frame_N* self) {
    switch (self->_state) {
        case 0: /* code before first await */
            self->_state = 1;
            return (opt_T){false, 0}; // pending
        case 1: /* code after first await */
            ...
    }
}
```

- `_collectAwaitStates(node)` in `scan.ts` — walks AST, finds await points, collects states + live vars.
- `_livenessScan()` — only vars crossing await boundary get promoted to struct. Primitives in `safeLocal` whitelist stay on C stack.
- `_emitAsyncStmt` / `_emitAsyncWhile` / `_emitAsyncFor` / `_emitAsyncForOf` / `_emitAsyncDoWhile` — emit state machine code.
- Async `switch` → transformed to `if/else if` (conflicts with outer state machine `switch(self->_state)`).
- Async `break`/`continue` → `goto` labels (not C `break`/`continue`).

### Promise

- `Promise<T>` struct with `.then`/`.catch`/`.finally` — dispatch in `method-dispatch.ts`.
- `Promise.all` / `race` / `any` / `allSettled` — combinators.
- Desktop: event loop via libuv. Embedded: cooperative scheduler (`@static async function*`).

### Threads (desktop only)

- `Thread.spawn(fn)` — OS thread (pthread/Win32). **Isolates:** no shared memory.
- Communication via `channel<T>` (SPSC ring buffer).
- `spawn {}` blocks require `Send` type (checked by `_checkSend()`): primitives, String, Atomic, Readonly = OK; Array/Set/Map/Ref/Mut/Arc/Weak = error.
- `await t.join()` — join thread from async context.

### Atomic / Volatile / ISR

- `Atomic<T>` — `.load()`/`.store()`/`.fetchAdd()`/`.compareExchange()` with memory orderings.
- `Volatile<T>` — `volatile T*`, MMIO. `.read()`/`.write()`.
- `@isr("VECTOR")` — interrupt handler. No await, no throw, no heap alloc.

---

## 7. Runtime (`src/runtime/runtime.h`)

Single-header C library. `#include`d in every output. Key components:

| Component | Purpose |
|-----------|---------|
| `_tsc_xmalloc`/`_tsc_xrealloc` | Fail-fast alloc wrappers — panic on NULL (OOM), all 83 malloc + 18 realloc calls routed through them |
| `tsc_malloc`/`tsc_free` | Macros for @heap class codegen (`#define tsc_malloc _tsc_xmalloc`) |
| `String` struct + ARC | String type with refcount |
| `tsc_string_*` macros | retain/release/clone/eq/concat/concat_n/format |
| `Array_T` macros | `TSC_ARRAY_DECL(T,ident)` — create/push/pop/free/slice/get/map/filter/... |
| `TscMap_K_V` macros | `TSC_MAP_DECL(K,V,id)` — open-addressing hash map |
| `TscSet_T` macros | `TSC_SET_DECL_PRIM(T,ident)` — flat array set |
| `Tuple_A_B` structs | Generated per-use by codegen |
| `opt_T` structs | `{ bool has_value; T value; }` |
| `Result_T_E` structs | `{ bool ok; T value; E error; }` for throws |
| `tsc_arc_*` | ARC alloc/retain/release for Arc |
| `tsc_weak_*` | Weak ref create/upgrade/release |
| `tsc_closure` | Fat ptr `{ void(*fn)(void*,...); void* env; }` for closures |
| `tsc_channel_*` | SPSC ring buffer channel |
| `_tsc_console_init` | UART init on embedded (`#ifdef TSC_CONSOLE_UART`) |
| `tsc_throw` / `tsc_panic` | Error reporting (no setjmp) |

**Platform headers:** `runtime_nes.h`, `runtime_wasm.h`, etc. — subset for constrained platforms.
**Std runtime headers:** `src/runtime/std/*.h` — `fs.h`, `net.h`, `ws.h`, `io.h`, `regex.h`, `base64.h`, `reactive.h`, `temporal.h`, `url.h`, `blob.h`, `embedded.h`, `hal.h`, `avr.h`.

### Platform capabilities (`src/profiles/*.d.tsc`)

12 built-in profiles: `desktop`, `avr`, `avr-heap`, `avr-coop`, `arm`, `nes`, `spectrum`, `genesis`, `ps2`, `dos`, `wasm`, `wasm32`. Capabilities: `bits`, `fpu`, `allocator` (heap|static), `async` (libuv|state_machine|none), `usize`, `defaultNumber`, `posix`, `strtoll`, `console_uart`, `console_baud`, `unaligned_access`, `os`. See Section 3 for `_cap()` usage.

`defaultNumber` per profile: desktop/dos/wasm/wasm32=`f64`, ps2=`f32`, arm/genesis=`i32`, avr/avr-heap/avr-coop/nes/spectrum=`i16`. 8-bit platforms use `i16` because C `int` is 16-bit.

`TSC_NO_POSIX`, `TSC_NO_STRTOLL`, `TSC_CONSOLE_UART`, `TSC_CONSOLE_BAUD` defines passed to gcc.

### Strict mode (`_strictRules`)

Rules: `no-any`, `no-unsafe`, `no-native`, `safe-math`, `no-lossy-cast`, `no-dynamic-alloc`, `no-closures`, `no-interfaces`, `no-threads`, `no-sort`, `switch-default`, `no-abort`, `no-i64-print`. Configured via `tsc.package.json` `"strict": [...]` or `--strict` CLI. SIL3 preset combines all.

---

## 8. Current State

### Tests: 1749 (spec-based structure)

Tests organized by spec section (`test/cases/<NN-section>/`):

| Section | Tests | Topic |
|---------|-------|-------|
| 02-syntax | 124 | Arithmetic, assign, bitwise, comparison, logical, variables, formatting |
| 03-types | 395 | Numbers, enum, type aliases, tuples, utility types, null/optional, widening |
| 04-ownership | 116 | Ownership, Arc, Weak, Clone, @static let, destructuring |
| 05-control-flow | 49 | if/else, while, switch, ternary, for-of, match |
| 06-functions | 61 | Functions, arrows, default/rest params, closures, overloads, extensions |
| 07-classes | 44 | Classes, methods, inheritance, instanceof, interfaces |
| 08-collections | 231 | Arrays, Map, Set, strings, objects, slices |
| 09-errors | 41 | throws, try/catch/finally, ?/!, bare-throws, cleanup |
| 10-async | 82 | async/await, Promise, generators, AbortSignal, timers |
| 11-concurrency | 44 | Threads, Atomic, channels, ISR, Volatile |
| 12-modules | 26 | import/export, entry point |
| 13-build | 164 | CLI, build, strict mode, CMake, C interop, @platform |
| 14-stdlib | 302 | console, Math, Date, JSON, std/* (net, ws, fs, hal, reactive, regex) |
| 15-decorators | 22 | Decorator function, factories, before/after |
| 16-tooling | 44 | LSP, linter, formatter, optimizer, wasm, capabilities |

**Total: 1749 tests, all pass (`--no-gcc`).**

### `[NOT YET IMPLEMENTED]` / Deferred

| Feature | Status | Where |
|---------|--------|-------|
| IR / SSA pipeline | Deferred (post-self-hosting). Prototype removed. Spec retained as `[PLANNED]`. | `spec/16-tooling/16-compiler.md` |
| Borrow elision for field access (M1) | Deferred (#78) | `const name = user.name` does ARC copy instead of pointer borrow |
| Full Descriptor API (PropDesc, ParamDesc) | NOT YET | `spec/15-decorators/` |
| `FnPtr<T>` (pure C fn pointer) | NOT YET | `spec/12-modules/` |
| Auto-constructor generation | NOT YET | `spec/07-classes/` |
| Unaligned access helpers (@packed) | NOT YET | `spec/07-classes/` |
| `instanceof` narrowing | NOT YET | Use `as` cast workaround |
| Full grapheme segmentation (UAX #29) | Simplified | Needs utf8proc (~300KB) |
| Regex backreferences/lookahead | NOT YET | Use `@tsc/pcre` package |
| Full Ref semantics in callbacks | Partial | String* auto-deref done, full auto-deref deferred |
| `tsc_init_all()` topological module init | NOT YET | Module-level vars currently promoted to static |

### Project state & tracking

- **Branch:** `develop` on `https://github.com/tsclang/tsclang.git`
- **GitHub Issues:** All bugs and enhancements #1–#65 closed. Open: #23 (deferred), #30–#31 (IR, long-term), #32 (bindgen, deferred), #33 (QNX, long-term), #47–#50 (self-hosting: string methods, file I/O, CLI/process, StringBuilder), #57 (NaN/Infinity support).
- **Refactoring done:** #25 (ScopeManager/BorrowTracker/OutputBuffer extraction), #26 (TypeChecker separation). Context: ~843 lines across 49 mixin files.
- **IR prototype (#27-#29):** Code removed. Prototype was never integrated. Spec retained as `[PLANNED]` in `spec/16-tooling/16-compiler.md`. Deferred until post-self-hosting (#30, long-term).
- **Next goal: Self-hosting.** Gaps identified: string methods (#47), file I/O (#48), CLI/process (#49), StringBuilder (#50).
- **Documentation:** root has 3 .md files — `README.md`, `AGENTS.md`, `CONTEXT.md`. Spec navigation in `spec/INDEX.md`.

### Architectural decisions

- **Compiler language: JS, not TS.** Port to TS rejected — huge effort, no user value. JSDoc annotations on critical files for IDE support. Long-term goal: self-host in `.tsc`.
- **IR/SSA: deferred.** Existing codegen supports all language features. IR is architectural improvement, not release blocker. Prototype removed, spec retained as `[PLANNED]`. Revisit post-self-hosting.
- **Bug fix priority before refactoring:** All bugs fixed before refactoring started (П6 — can't refactor safely with red tests).

---

## 9. Gotchas & Non-Obvious Behavior

### AVR / Embedded

- **`int` != `int32_t` on AVR!** AVR `int` = 16-bit. Codegen uses `%ld` + `(long)` for i32, `%lu` + `(unsigned long)` for u32 on embedded.
- **`%lld` unsupported** on avr-libc → `no-i64-print` strict rule auto-enabled. Manual digit conversion in `tsc_i64_to_string`.
- **`%g` needs `-lprintf_flt`** linker flag on AVR.
- **`%zu` unsupported** → `%u` + `(unsigned)` cast.
- **`static char` buffers = NOT reentrant** → replaced with malloc+ARC (desktop) / ring buffer pool (embedded).
- **PROGMEM strings** — `STR_LIT()` macro, `pgm_read_byte` for access. `tsc_print_str()` for PROGMEM-aware output.
- **`F_CPU`** must be `#define`d (avr-gcc doesn't auto-define).

### Arrays

- **`capacity = 0` = non-owning array** (view/slice/static data). `tsc_array_free_*` checks `capacity > 0` before `free()`. Mutating non-owning = UB.
- **`new Array(N)`** → capacity=N, **length=0** (NOT length=N like JS — no `undefined` to fill).
- **`arr[i]` for complex types = borrow** (Ref), NOT copy. Can't move out by index (E009).
- **`arr[i]` for string = ARC copy** (retain), NOT borrow.
- **Empty `[]`** without type annotation → defaults to `double` element (use type annotation: `let a: string[] = []`).
- **`(T | null)[]`** — elements wrapped in `_wrapOptValue()`, pop/shift return unwrapped, console.log prints "null" for missing.

### Ownership

- **Spread/destructuring = ALWAYS copy.** Source stays alive. No E002 after spread. Key design decision (D1 in spec).
- **Closure capture = reference for class/array** (pointer), **copy for primitives**, **retain for string** (ARC). Explicit capture `[x: Ref<T>]` / `[x: Mut<T>]` for borrow.
- **`const` on struct** only prevents reassignment, NOT property mutation → compiler does NOT emit C `const` for struct-typed variables.
- **`==` is `===`** — no type coercion in TSClang (unlike JS). `===`/`!==` are synonyms.
- **`undefined` = `null`** — synonym, both compile to NULL.
- **`var` = `let`** — synonym, no hoisting/TDZ.
- **Single quotes = double quotes** — `'hello'` = `"hello"`. Single-char `'A'` = string by default, `u8` with annotation.

### Async

- **Async `switch`** → `if/else if` chain (can't nest C `switch` inside state machine `switch(self->_state)`).
- **Async `break`/`continue`** → `goto` labels (not C keywords).
- **`Ref<T>` across `await`** = E051 error. String = retain-on-capture (exception to implicit borrow).
- **`for-of` index vars** (`_forof_idx_N`) force-promoted to state struct regardless of liveness.
- **Nested async loops** — inner loop must NOT emit terminal/goto cleanup if outer loop still active.

### Codegen

- **`_ensureXxx()` pattern** — ALWAYS use lazy guards (Set check → emit → add). Never emit a typedef/struct without checking first.
- **`_postStmtCleanups`** — deferred cleanups after current statement (zero-out after move, temp release). **`_expectedType`** — set in vardecl.ts before init expr; empty array literals use it for element type.
- **Narrowing** — `_narrowedVars` (Set, `if (x != null)` / `if (x)`), `_narrowedUnknownVars` (Map, `typeof x === "i32"`). Access uses unwrapped type.
- **Double-evaluation prevention** — complex expressions in temp vars before multi-use (`??`, `?.`, compound assigns).
- **`goto cleanup`** — triggers when `_usesGotoCleanup && owned vars >= 2`. String concat chain (3+) uses `_flattenStringConcat` → `tsc_string_concat_n` compound literal.
- **Closures** — `hoistClosure` lifts lambdas to file-scope with env struct. Env always heap-allocated (`_closure_N_destroy`). `_returnsCapturingClosure` flag for functions returning capturing closures. Trampoline adapter for array callbacks (NOT reentrant).
- **Recursive type detection** — `_resolvingTypes` Set. If `resolveType` returns its own name → compile error ("use Ref/Arc/Mut for indirection").
- **Cross-module types** — In type tables (`this.classes`, `this._typeAliases`), NOT in scope. All declaration types get module-prefixed C names.
- **Non-const static init** — `Call` nodes in init → zero-init at top level + runtime assignment. Library mode: `void <prefix>__init(void)`.
- **Numeric widening** — (1) implicit narrowing = error; (2) explicit `as` = OK; (3) safe functions = always OK. `_isSafeWidening` + `_effectiveType` with simplified usual arithmetic conversions (not full C promotion). All same-width mixed signed+unsigned pairs banned for `let` variables (`i8+u8`, `i16+u16`, `i32+u32`, `i64+u64`) — require explicit `as`. Cross-width `i64+u32` also banned. `const`/literals exempt.
- **Defined wrap for signed integers** — binary `+`/`-`/`*` and compound `+=`/`-=`/`*=` on signed types emit `(intN_t)((uintN_t)a OP (uintN_t)b)` to eliminate signed overflow UB. Widening check runs BEFORE the cast (so `i8 += i32` still errors). `safe-math` strict rule overrides to compile error. INT_MIN / -1 guarded in `operators.ts`/`assign.ts`.
- **safe-math try/catch** — In `safe-math` strict mode, integer arithmetic outside `try { } catch (e: MathError)` or a `throws MathError` function → compile error. Inside try: compiler transforms each integer op to checked version (`__builtin_*_overflow` for +-*-, zero/INT_MIN guard for /%), goto catch on error. `MathError` is a builtin class with `.operation` field. Float arithmetic NOT checked (IEEE 754). `Math.checkedAdd/Sub/Mul` removed — use try/catch.
  - **`_isIntOperand` helper** (`operators.ts`): Detects integer operands even when number literals infer as `double` but emit as `int` in C (e.g., `a - 1` where `a: i32`). Used for safe-math +/-/*  and division checks. Default-mode division guard keeps old `intTypes.has()` check to avoid changing non-safe-math behavior.
  - **Loop restructure in `_inMathTry`** (`control-flow.ts`): While/DoWhile/For loops restructure to `while(1) { checked_cond; if (!cond) break; body; }` so checked arithmetic conditions are re-evaluated each iteration (not hoisted before loop). For-loop update emitted as statement at end of body.
  - **`throws MathError` on functions** (`func.ts:emitFuncBody`): Function declares `throws MathError` + `safe-math` → body treated as `_inMathTry` context with `_func_math_throw` label. Overflow → `goto _func_math_throw` → error Result return. Auto-propagation: `return inner()` / `inner();` in throws function → Result checked, error propagated via `_mathCatchLabel`. Supports void/non-void, goto cleanup (owned vars).
  - **Union throws wrapping** (`func.ts` + `control-flow.ts:_wrapErrForCaller`): When caller declares `throws A | B` and callee throws only `A`, the callee's error is wrapped in `_ErrUnion_A_B` tagged union. Applied in all 6 propagation paths (ExprStmt, Return, VarDecl, ?/!). `_funcMathThrow` label wraps MathError in union when `throwsNames.length > 1`.
  - **Bare throws call compile error** (`control-flow.ts` ExprStmt): Calling a throws function without `?`/`!`/try-catch/enclosing `throws` → compile error. Manual Result handling (`let r = risky(); if (!r.ok)`) is allowed (VarDecl not restricted). ExprStmt auto-propagate extended to `_inMathTry` (top-level math try/catch without `_throwsCtx`).
  - **Union error panic** (`codegen.ts:_panicMsgExpr`): For union error types, generates `_tsc_panic_msg_KEY` helper function with tag-based switch to extract `.message` from correct union member. Single error type: direct field access. Pre-computed before `emit()` section assembly for main function. Used in match.ts (`!`), console.ts, codegen.ts (main).
  - **`!`/`?` in expression context** (`dispatch.ts:683-735`): NonNull (`!`) and Propagate (`?`) work inside expressions (`risky()! + 1`, `foo(inner()?)`, `(getData()?).field`). NonNull: Result temp + `tsc_panic`, returns `.value`. Propagate: Result temp + error propagation, returns `.value`. Void returns `((void)0)`. Parser (`parser.ts:1509`): `?` disambiguated from ternary via **whitespace-based rule** (O(1), no scanner): **tight** (no space before `?`: `risky()?`) or **closed** (next token is `)`/`]`/`,`/`;`/EOF: `foo(risky()?)`) → propagate; otherwise → ternary. `?.` (optional chaining) is a separate lexer token (QUESTDOT), no conflict. `_checkNoBareThrows` (`codegen.ts`): recursive check for bare throws calls in binary/array/member/template/argument/index/ternary/unary/cast/range contexts + New args → compile error. `?`/`!` in async → compile error (use try/catch). Unary `+`/`-`/`~` unified under NUMERIC type guard.
- **`_cap()` everywhere** — All platform checks via `_cap(key)`. `_ptrBytes()` from `_cap('usize')`, printf from `_cap('bits')`. No `_isEmbedded()`.

---

## 10. Quick Reference: Task → File

| I need to... | Look at... |
|--------------|-----------|
| Add a new AST node type | `ast-types/ast.ts` (add interface + union member) |
| Add a new statement type | `stmt/index.ts` (dispatch), then specific file in `stmt/` |
| Add a new expression type | `expr/dispatch.ts` (exprToC switch), then `expr/*.ts` |
| Add a new method on arrays/Map/Set | `calls/stdlib.ts` (dispatch + emit), `types/infer.ts` (return type), `runtime.h` (C macro) |
| Add a new stdlib module | `stdlib-registry.ts` (register), `calls/call-dispatch.ts` (dispatch) |
| Add a new builtin (console, Math, etc.) | `stdlib-registry.ts` (LANGUAGE_BUILTINS), `calls/builtin.ts` |
| Add a new type annotation | `types/resolve.ts` (TSC→C), `types/infer.ts` (inference) |
| Add a new decorator | `top-level/decorators.ts` (codegen), `parser.ts` (parse) |
| Add a new platform profile | `src/profiles/<name>.d.tsc`, `src/profiles/<name>.json`, `bin/index.ts` (loadProfile) |
| Add a new strict rule | `codegen.ts` (_strictRules init), check in relevant codegen file, `spec/13-build/13-strict-mode.md` |
| Fix borrow checker error | `codegen.ts` (scope/borrow core), `stmt/vardecl.ts`, `expr/assign.ts`, `calls/*.ts` |
| Fix cleanup/memory leak | `codegen.ts` (_blockCleanupStack), `stmt/control-flow.ts`, `stmt/vardecl.ts` |
| Fix async codegen | `async/scan.ts` (state collection), `async/async-stmt.ts` (emit), `async/async-emit.ts` (poll fn) |
| Fix string ownership | `stmt/vardecl.ts`, `expr/assign.ts`, `calls/call-dispatch.ts`, `calls/method-dispatch.ts`, `top-level/func.ts` |
| Add a test | `test/cases/<NN-section>/<feature>/<name>/` with `input.tsc` + expected files + `meta.json` |
| Run tests | `node test/runner.ts 03-types` (filter by spec section or feature name) |
| Compile manually | `node bin/index.ts build input.tsc --outDir .tsclang-tmp/` (NEVER without --outDir) |

### Test file structure

```
test/cases/<NN-section>/feature/name/
  input.tsc            # input source
  expected.c           # expected C output ([F] fragment or [R] runnable)
  expected.out         # expected stdout ([R] only)
  expected.error       # expected error message ([E] error tests)
  expected.runtime-error  # expected runtime panic ([RE])
  meta.json            # { kind: "[F]"|"[R]"|"[E]"|"[RE]", target/profile, ... }
```

Sections mirror spec: `02-syntax`, `03-types`, `04-ownership`, ..., `16-tooling`. See `spec/INDEX.md` for full table.

### Test kinds
- `[F]` fragment — compare C output only (no compilation)
- `[R]` runnable — compile with gcc + run + compare stdout
- `[E]` error — compare compiler error message
- `[RE]` runtime error — compile, run, expect runtime panic message
