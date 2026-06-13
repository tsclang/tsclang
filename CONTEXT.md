# CONTEXT.md — TSClang Internal Knowledge Base

> **Purpose:** Self-contained knowledge dump for AI sessions. Read this FIRST — no need to re-read spec/ unless doing specific work. Last updated: 2026-06-13.

---

## 1. TL;DR

**TSClang** = TypeScript-like language (`.tsc`) compiled to C. Stack: Node.js ESM.
- **Compiler:** `src/compiler/` (lexer.js → parser.js → codegen.js → C string)
- **Runtime:** `src/runtime/runtime.h` (C header, included in every output)
- **CLI:** `bin/index.js` (`tsclang build|run|init|lint|...`)
- **Tests:** `node test/runner.js phaseN` (20 phases, ~1900 tests, 16 pre-existing failures in phases 1/10/11)
- **Targets:** desktop (libuv), embedded (AVR, no heap), retro (NES/Genesis/Spectrum), WASM
- **Design:** TS syntax + C backend + Rust-style ownership (no GC, no manual free)

---

## 2. Compiler Pipeline

```
input.tsc
  → lexer.js        (lex → tokens)
  → parser.js       (parse → AST, returns { ast, errors } with recovery)
  → [optimizer.js]  (optional: --opt, AST-level: const fold, dead branch, strength reduce)
  → codegen.js      (codegen(ast, filename, src, opts) → { c, warnings, exports })
      └─ Context class walks AST → emits C string
  → runtime.h       (prepended to output, provides all C types/macros)
  → output.c        (→ gcc/avr-gcc/emcc → binary/hex/wasm)
```

**Key entry points:**
- `codegen()` in `codegen.js:26` — creates `Context`, calls `visitProgram(ast)`, returns `ctx.emit()`
- `Context.visitProgram(ast)` in `top-level/program.js` — dispatches top-level nodes
- `visitStmtInMain(node)` in `stmt.js` — thin dispatcher for statements
- `exprToC(node)` in `expr/dispatch.js` — main expression → C string converter

**Pre-scan phase:** Before codegen of function bodies, compiler pre-scans top-level declarations to populate `this.classes`, `this.interfaces`, `this._typeAliases`, function signatures (for overloads), and platform capability checks.

**Generics:** Monomorphization in `generics.js`. Each concrete instantiation (`Box<i32>`) generates separate C code. `_genericClasses` / `_genericFuncs` Maps track instantiations. `substNode` substitutes typeArgs in AST.

**Module bundling:** `bin/index.js` `compileTsc()` recursively compiles imports. Each module gets `modulePrefix` (basename). All top-level C symbols mangled with prefix. `opts.libraryMode` = emit without `#include`/`main()`.

---

## 3. Codegen Architecture

### Context class (`codegen.js:96`)

God-object with ~300+ methods. Split across **46 files** via mixin pattern (modules export a function that adds methods to `Context.prototype`).

### Module map

| Directory | Files | Responsibility |
|-----------|-------|----------------|
| `codegen.js` | 1 | `codegen()` entry, `Context` class, scope/borrow/cleanup core |
| `top-level/` | 6 | `dispatch.js` (entry), `program.js` (visitProgram, pre-scan), `func.js`, `class.js`, `types-alias.js`, `decorators.js` |
| `stmt/` | 4 | `index.js`→`stmt.js` (visitStmtInMain dispatcher), `vardecl.js` (let/const), `control-flow.js` (if/while/for/switch/try-catch/break/continue), `destruct.js`, `match.js` |
| `expr/` | 4 | `index.js`→`dispatch.js` (exprToC), `operators.js`, `assign.js`, `literals.js` |
| `calls/` | 8 | `call-dispatch.js` (function calls), `method-dispatch.js` (method calls, chains), `console.js`, `stdlib.js` (Map/Set/array methods), `builtin.js`, `builtin-helpers.js`, `conversion.js` (parseInt/toString), `concurrency.js` (Atomic/channel/spawn) |
| `types/` | 3 | `resolve.js` (TSC type → C type), `infer.js` (expression type inference), `helpers.js` (`_ensure*Struct`, `_wrapOptValue`, mangle helpers) |
| `misc/` | 4 | `index.js`, `arrays.js` (array literals), `closures.js` (lambda hoisting, capture), `new-expr.js` (new X()), `emit-helpers.js` (spawn, Thread) |
| `async/` | 5 | `index.js`, `async-stmt.js` (emit async statements), `async-emit.js` (state machine poll fn), `generator.js`, `scan.js` (collect await states, liveness), `helpers.js` |
| `types.js` | 1 | `PRIMITIVE_MAP`, `toCType`, `mangleType`, `fmtSpec`, `inferLiteralCType` |

### Key Context state (the `this.*` properties)

**Symbol table & scope:**
- `this.scopes` — `Map[]` stack, `[0]` = global. `pushScope()`/`popScope()` manage it.
- `this.classes` — `Map<name, { fields, methods, decorators, _isHeap, _isPool, ... }>`
- `this.interfaces` — `Map<name, { methods }>`
- `this._typeAliases` — `Map<name, TypeRef>`
- `define(name, info)` — adds symbol to current scope. `info` = `{ ctype, varKind, isRefParam, isMutParam, isArc, isWeak, _moved, _movedLine, _refBorrowCount, _mutQuarantined, ... }`

**Borrow tracking (core safety):**
- `this._scopeBorrowStack` — `Sym[][]` — Ref borrows per scope, auto-released on `popScope()`
- `this._scopeMutQuarantineStack` — Mut quarantine per scope
- `this._scopeMutBorrowStack` — Mut borrow per scope
- `_trackRefBorrow(sym)` — increments `_refBorrowCount`, pushes to current scope
- `_trackMutBorrow(sym)` / `_trackMutQuarantine(sym)` — Mut tracking
- `_checkBorrowsAcrossAwait(node)` — throws E051 if Ref/Mut alive across await

**Cleanup system:**
- `this._blockCleanupStack` — `[{ list: [], set: Set }]` — per-block owned-var cleanups
- `this._loopCleanupStack` — `Array<Array>` — stack of loop-level cleanup arrays (for labeled break)
- `this._usesGotoCleanup` — boolean, throws functions use `goto cleanup` pattern
- `this._throwsOwnedVars` — owned vars needing cleanup in throws functions

**Lazy emission guards (prevent duplicate C typedefs):**
- `this._emittedArrayStructs` — `Set<'Array_i32', ...>` — `_ensureArrayStruct(ident, elemC)`
- `this._emittedOptStructs` — `Set<'opt_i32', ...>` — `_ensureOptStruct(name, innerCType)`
- `this._emittedResultTypes` — `Set<'Result_i32_Error', ...>`
- `this._emittedTuples`, `_emittedMapStructs`, `_emittedChannelTypes`, etc.
- Pattern: `_ensureXxx(name, ...)` checks Set, emits typedef if missing, adds to Set

**Capabilities & config:**
- `this._capabilities` — `{ allocator: 'heap'|'static', async: 'libuv'|'state_machine'|'none', fpu: bool, bits: 8|16|32|64, usize: 'u16'|'u32'|'u64', posix: bool, strtoll: bool, console_uart: bool }`
- `this._cap(key)` — capability lookup with DESKTOP_CAPABILITIES fallback
- `this._isEmbedded()` — `allocator !== 'heap' || bits < 64`
- `this._strictRules` — `Set<string>` — strict mode rules (`no-any`, `safe-div`, `no-closures`, ...)
- `this._defaultNumber` — `'f64'` (desktop) or `'f32'` (embedded)

**Output buffers:**
- `this.includes` — `Set<string>` — `#include` lines
- `this.typedefs` — `string[]` — struct typedefs (emitted first)
- `this.topLevel` — `string[]` — function definitions
- `this.mainStmts` — `string[]` — statements inside `main()`
- `this.lambdaLines` — `string[]` — hoisted lambda functions (before topLevel)
- `ctx.emit()` — concatenates: includes + typedefs + lambdaLines + topLevel + `int main() { mainStmts }`

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

### Primitive types (`types.js: PRIMITIVE_MAP`)

| TSC type | C type | printf fmt | Notes |
|----------|--------|------------|-------|
| `number` | `double` | `%g` | default; `f32` on embedded via `defaultNumber` |
| `i8` | `int8_t` | `%d` | |
| `i16` | `int16_t` | `%d` | |
| `i32` | `int32_t` | `%d` desktop, `%ld`+(long) AVR | AVR `int`=16bit! |
| `i64` | `int64_t` | `%lld` | no-i64-print strict rule on embedded |
| `u8`–`u64` | `uint8_t`–`uint64_t` | `%u`/`%lu`/`%llu` | |
| `f32` | `float` | `%g` | |
| `f64` | `double` | `%g` | |
| `boolean` | `bool` | `%d` (0/1) | TSC name = `boolean`, NOT `bool` |
| `usize` | `size_t` | `%zu` desktop, `%u`+cast AVR | platform-dependent (u16/u32/u64) |
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

### Name mangling (`types.js: mangleType`)

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

- **Block cleanup:** owned vars (string, array, class) freed at scope exit via `_blockCleanupStack`.
- **Loop cleanup:** `_loopCleanupStack` — break/continue emit cleanups for loop-local vars.
- **goto cleanup (throws functions):** `_usesGotoCleanup` — all cleanup at single `_cleanup:` label. Owned vars NULL-init'd. O(N+M) not O(N*M).
- **Auto-destructors:** classes with string fields get `ClassName_free(ClassName*)` auto-generated (releases strings, does NOT free struct itself — value types on stack).
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

- `_collectAwaitStates(node)` in `scan.js` — walks AST, finds await points, collects states + live vars.
- `_livenessScan()` — only vars crossing await boundary get promoted to struct. Primitives in `safeLocal` whitelist stay on C stack.
- `_emitAsyncStmt` / `_emitAsyncWhile` / `_emitAsyncFor` / `_emitAsyncForOf` / `_emitAsyncDoWhile` — emit state machine code.
- Async `switch` → transformed to `if/else if` (conflicts with outer state machine `switch(self->_state)`).
- Async `break`/`continue` → `goto` labels (not C `break`/`continue`).

### Promise

- `Promise<T>` struct with `.then`/`.catch`/`.finally` — dispatch in `method-dispatch.js`.
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
| `String` struct + ARC | String type with refcount |
| `tsc_string_*` macros | retain/release/clone/eq/concat/format |
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

12 built-in profiles: `desktop`, `avr`, `avr-heap`, `avr-coop`, `arm`, `nes`, `spectrum`, `genesis`, `ps2`, `dos`, `wasm`, `wasm32`.

```typescript
declare platform {
    bits: 32;               // 8 (AVR), 16 (NES), 32 (ARM), 64 (desktop)
    fpu: false;             // hardware float support
    allocator: "static";    // "heap" | "static" (was "none", merged)
    async: "state_machine"; // "libuv" | "state_machine" | "none"
    usize: "u16";           // size_t width
    unaligned_access: false;
    posix: false;           // POSIX API available
    strtoll: false;         // strtoll() available
    console_uart: true;     // UART console output
    console_baud: 9600;
}
```

`_cap(key)` looks up capabilities. `TSC_NO_POSIX`, `TSC_NO_STRTOLL`, `TSC_CONSOLE_UART`, `TSC_CONSOLE_BAUD` defines passed to gcc.

### Strict mode (`_strictRules`)

Rules: `no-any`, `no-unsafe`, `no-native`, `safe-div`, `no-lossy-cast`, `no-dynamic-alloc`, `no-closures`, `no-interfaces`, `no-threads`, `no-sort`, `switch-default`, `no-abort`, `no-i64-print`. Configured via `tsc.package.json` `"strict": [...]` or `--strict` CLI. SIL3 preset combines all.

---

## 8. Current State

### All 20 phases DONE (0–19)

| Phase | Tests | Topic |
|-------|-------|-------|
| 0 | 24 | Core runtime (console, Error) |
| 1 | ~180 | Basic parsing, codegen |
| 2 | ~320 | Type system (null, enum, generics, utility types) |
| 3 | ~360 | Memory model (ownership, borrow, arrays, strings, sets) |
| 4 | ~80 | Classes, interfaces, closures, match |
| 5 | ~27 | Error handling (throws, try/catch, Result) |
| 6 | ~48 | Modules (import/export, C interop, @platform) |
| 7 | ~80 | Async/await (state machines, Promise) |
| 8 | ~44 | Concurrency (threads, channels, Atomic) |
| 9 | ~57 | CLI, build, strict mode |
| 10 | 20 | Strings & encodings |
| 11 | ~50 | Embedded (pool, heap, stack_size, @struct) |
| 12 | ~120 | Stdlib runtime |
| 13 | 21 | Decorators |
| 14 | 7 | Reactive |
| 15 | 10 | Regex |
| 16 | 3 | LSP |
| 17 | 12 | Linter, retro platforms |
| 18 | 21 | Optimizer, WASM, DTS, sourcemaps |
| 19 | 74 | IO/Net/WS |

**Total: ~1900 tests, 16 pre-existing failures** (phase1: 8, phase10: 1, phase11: 7 — all predate current refactoring cycle)

### `[NOT YET IMPLEMENTED]` / Deferred

| Feature | Status | Where |
|---------|--------|-------|
| IR / SSA (basic blocks, phi nodes) | PLANNED | Currently AST→C directly. `spec/16-tooling/` |
| Borrow elision for field access (M1) | Deferred to phase 18 | `const name = user.name` does ARC copy instead of pointer borrow |
| Full Descriptor API (PropDesc, ParamDesc) | NOT YET | `spec/15-decorators/` |
| `FnPtr<T>` (pure C fn pointer) | NOT YET | `spec/12-modules/` |
| Auto-constructor generation | NOT YET | `spec/07-classes/` |
| Unaligned access helpers (@packed) | NOT YET | `spec/07-classes/` |
| Consumer-side monomorphization (IR cache) | PLANNED | `spec/16-tooling/` |
| `instanceof` narrowing | NOT YET | Use `as` cast workaround |
| Full grapheme segmentation (UAX #29) | Simplified | Needs utf8proc (~300KB) |
| Regex backreferences/lookahead | NOT YET | Use `@tsc/pcre` package |
| Full Ref semantics in callbacks | Partial | String* auto-deref done, full auto-deref deferred |
| `tsc_init_all()` topological module init | NOT YET | Module-level vars currently promoted to static |

### Project state & tracking

- **Branch:** `develop` on `https://github.com/tsclang/tsclang.git`
- **GitHub Issues:** 33 issues (#1–#33) track all work. Labels: `investigation` (#1–#24), `tech-debt` (#25–#31, refactoring phases 1–7), `enhancement` (#32–#33)
- **Refactoring plan:** 10 phases to extract IR/SSA pipeline. Phase 1: extract `Emitter`/`ScopeManager`/`BorrowTracker`/`TypeRegistry` from Context (issue #25). Phase 7 (ownership on IR) deferred. Old codegen deleted after switch-over.
- **Documentation:** root has 3 .md files — `README.md`, `AGENTS.md`, `CONTEXT.md`. Spec navigation in `spec/INDEX.md`. All removed: `LOG.md`, `AGENTS_PLAN.md`, `AUDIT-PLAN.md`, `FUTURE.md`, `QNX.md`.

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

- **`_ensureXxx()` pattern** — ALWAYS use lazy guards. Never emit a typedef/struct without checking the Set first.
- **`hoistClosure`** — lambdas lifted to file-scope. Captures → env struct. Trampoline adapter for capturing closures in array callbacks (static env ptr + adapter fn, NOT reentrant).
- **`_postStmtCleanups`** — deferred cleanups after current statement (e.g., zero-out after move, temp release).
- **`_expectedType`** — set in vardecl.js before compiling init expression. Array literals use it to determine element type when empty.
- **`_narrowedVars`** — Set of var names narrowed inside `if (x != null)` / `if (x)`. Access uses unwrapped type.
- **`_narrowedUnknownVars`** — Map<name, ctype> for `typeof x === "i32"` narrowing.
- **Double-evaluation prevention** — complex expressions stored in temp vars before multi-use (`??`, `?.`, compound assigns, etc.).
- **`goto cleanup`** threshold: `_emitFuncCleanup` triggers when `_usesGotoCleanup && owned vars >= 2`.

---

## 10. Quick Reference: Task → File

| I need to... | Look at... |
|--------------|-----------|
| Add a new statement type | `stmt/index.js` (dispatch), then specific file in `stmt/` |
| Add a new expression type | `expr/dispatch.js` (exprToC switch), then `expr/*.js` |
| Add a new method on arrays/Map/Set | `calls/stdlib.js` (dispatch + emit), `types/infer.js` (return type), `runtime.h` (C macro) |
| Add a new stdlib module | `stdlib-registry.js` (register), `calls/call-dispatch.js` (dispatch) |
| Add a new builtin (console, Math, etc.) | `stdlib-registry.js` (LANGUAGE_BUILTINS), `calls/builtin.js` |
| Add a new type annotation | `types/resolve.js` (TSC→C), `types/infer.js` (inference) |
| Add a new decorator | `top-level/decorators.js` (codegen), `parser.js` (parse) |
| Add a new platform profile | `src/profiles/<name>.d.tsc`, `src/profiles/<name>.json`, `bin/index.js` (loadProfile) |
| Add a new strict rule | `codegen.js` (_strictRules init), check in relevant codegen file, `spec/13-build/13-strict-mode.md` |
| Fix borrow checker error | `codegen.js` (scope/borrow core), `stmt/vardecl.js`, `expr/assign.js`, `calls/*.js` |
| Fix cleanup/memory leak | `codegen.js` (_blockCleanupStack), `stmt/control-flow.js`, `stmt/vardecl.js` |
| Fix async codegen | `async/scan.js` (state collection), `async/async-stmt.js` (emit), `async/async-emit.js` (poll fn) |
| Fix string ownership | `stmt/vardecl.js`, `expr/assign.js`, `calls/call-dispatch.js`, `calls/method-dispatch.js`, `top-level/func.js` |
| Add a test | `test/cases/<phase>/<feature>/<name>/` with `input.tsc` + expected files + `meta.json` |
| Run tests | `node test/runner.js phaseN` (NEVER without args — timeout risk) |
| Compile manually | `node bin/index.js build input.tsc --outDir .tsclang-tmp/` (NEVER without --outDir) |

### Test file structure

```
test/cases/phaseN/feature/name/
  input.tsc            # input source
  expected.c           # expected C output ([F] fragment or [R] runnable)
  expected.out         # expected stdout ([R] only)
  expected.error       # expected error message ([E] error tests)
  expected.runtime-error  # expected runtime panic ([RE])
  meta.json            # { kind: "[F]"|"[R]"|"[E]"|"[RE]", target/profile, ... }
```

### Test kinds
- `[F]` fragment — compare C output only (no compilation)
- `[R]` runnable — compile with gcc + run + compare stdout
- `[E]` error — compare compiler error message
- `[RE]` runtime error — compile, run, expect runtime panic message
