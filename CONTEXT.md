# CONTEXT.md — TSClang Internal Knowledge Base

> **Purpose:** Self-contained knowledge dump for AI sessions. Read this FIRST — no need to re-read spec/ unless doing specific work. Last updated: 2026-06-14 (compact after #37 #38 #39).

---

## 1. TL;DR

**TSClang** = TypeScript-like language (`.tsc`) compiled to C. Stack: Node.js ESM.
- **Compiler:** `src/compiler/` (lexer.js → parser.js → codegen.js → C string)
- **Runtime:** `src/runtime/runtime.h` (C header, included in every output)
- **CLI:** `bin/index.js` (`tsclang build|run|init|lint|...`)
- **Tests:** `node test/runner.js phaseN` (20 phases, ~1963 tests, **all pass**)
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

**Pre-scan phase:** Before codegen of function bodies, compiler pre-scans top-level declarations to populate `this.classes`, `this.interfaces`, `this._typeAliases`, function signatures (for overloads), and platform capability checks. (Note: Result type emission is now **lazy** per-function via `_emittedResultTypes` Set in `func.js`, not pre-scanned.)

**Generics:** Monomorphization in `generics.js`. Each concrete instantiation (`Box<i32>`) generates separate C code. `_genericClasses` / `_genericFuncs` Maps track instantiations. `substNode` substitutes typeArgs in AST.

**Module bundling:** `bin/index.js` `compileTsc()` recursively compiles imports. Each module gets `modulePrefix` (basename). All top-level C symbols mangled with prefix. `opts.libraryMode` = emit without `#include`/`main()`.

---

## 3. Codegen Architecture

### Context class (`codegen.js:109`)

God-object with ~300+ methods (~827 lines). Split across **49 files** via mixin pattern (modules export a function that adds methods to `Context.prototype`).

**Refactoring Phase 1 (#25) — extracted state objects:**
- `ScopeManager` (`codegen/scope-manager.js`) — scope stack, `define()`/`lookup()`. Context delegates via wrappers + `get scopes()` backward-compat getter.
- `BorrowTracker` (`codegen/borrow-tracker.js`) — `_scopeBorrowStack`, `_scopeMutQuarantineStack`, `_scopeMutBorrowStack`, `trackRefBorrow`/`trackMutBorrow`/`trackMutQuarantine`/`releaseQuarantineBy`. Depends on ScopeManager. Context delegates via thin wrappers.
- `OutputBuffer` (`codegen/output-buffer.js`) — `includes`/`typedefs`/`topLevel`/`mainStmts`/`lambdaLines` + `addTop()`/`addLambda()`. Context delegates via backward-compat getters.

### Module map

| Directory | Files | Responsibility |
|-----------|-------|----------------|
| `codegen.js` | 1 | `codegen()` entry, `Context` class, cleanup core, `emit()` assembly |
| `codegen/scope-manager.js` | 1 | **ScopeManager** — scope stack, `define()`/`lookup()`/`pushScope()`/`popScope()` |
| `codegen/borrow-tracker.js` | 1 | **BorrowTracker** — Ref/Mut borrow tracking, quarantine, scope-exit cleanup |
| `codegen/output-buffer.js` | 1 | **OutputBuffer** — output sections, `addTop()` smart routing, `addLambda()` |
| `top-level/` | 6 | `dispatch.js` (entry), `program.js` (visitProgram, pre-scan), `func.js`, `class.js`, `types-alias.js`, `decorators.js` |
| `stmt/` | 4 | `index.js`→`stmt.js` (visitStmtInMain dispatcher), `vardecl.js` (let/const), `control-flow.js` (if/while/for/switch/try-catch/break/continue), `destruct.js`, `match.js` |
| `expr/` | 4 | `index.js`→`dispatch.js` (exprToC), `operators.js`, `assign.js`, `literals.js` |
| `calls/` | 8 | `call-dispatch.js` (function calls), `method-dispatch.js` (method calls, chains), `console.js`, `stdlib.js` (Map/Set/array methods), `builtin.js`, `builtin-helpers.js`, `conversion.js` (parseInt/toString), `concurrency.js` (Atomic/channel/spawn) |
| `types/` | 3 | `resolve.js` (TSC type → C type), `infer.js` (expression type inference), `helpers.js` (`_ensure*Struct`, `_wrapOptValue`, mangle helpers) |
| `misc/` | 4 | `index.js`, `arrays.js` (array literals), `closures.js` (lambda hoisting, capture), `new-expr.js` (new X()), `emit-helpers.js` (spawn, Thread) |
| `async/` | 5 | `index.js`, `async-stmt.js` (emit async statements), `async-emit.js` (state machine poll fn), `generator.js`, `scan.js` (collect await states, liveness), `helpers.js` |
| `types.js` | 1 | `PRIMITIVE_MAP`, `toCType`, `mangleType`, `fmtSpec`, `inferLiteralCType` |

### Key Context state (the `this.*` properties)

**Symbol table & scope (delegated to ScopeManager):**
- `this._scopeMgr` — `ScopeManager` instance. `this.scopes` getter returns `_scopeMgr.scopes`.
- `this.classes` — `Map<name, { fields, methods, decorators, _isHeap, _isPool, ... }>`
- `this.interfaces` — `Map<name, { methods }>`
- `this._typeAliases` — `Map<name, TypeRef>`
- `define(name, info)` — Context wrapper: auto-marks heap vars, then delegates to `_scopeMgr.define()`. `info` = `{ ctype, varKind, isRefParam, isMutParam, isArc, isWeak, _moved, _movedLine, _refBorrowCount, _mutQuarantined, ... }`

**Borrow tracking (delegated to BorrowTracker):**
- `this._borrowTracker` — `BorrowTracker` instance (depends on `_scopeMgr`).
- `pushScope()`/`popScope()` — Context coordinates: calls both `_scopeMgr` + `_borrowTracker`.
- `_trackRefBorrow(sym)` / `_trackMutBorrow(sym)` / `_trackMutQuarantine(sym)` — thin wrappers delegating to `_borrowTracker`.
- `_checkBorrowsAcrossAwait(node)` — stays on Context (needs `this.error()`).
- `_trackBorrowForRefReturn(callNode, resultName, mode)` — stays on Context (needs `this.lookup()`/`this.interfaces`).

**Cleanup system:**
- `this._blockCleanupStack` — `[{ list: [], set: Set }]` — per-block owned-var cleanups
- `this._heapVarStack` — `[{ name, className }][]` — per-block heap vars for auto-free at scope exit
- `this._loopCleanupStack` — `Array<Array>` — stack of loop-level cleanup arrays (for labeled break)
- `this._usesGotoCleanup` — boolean, throws functions use `goto cleanup` pattern
- `this._throwsOwnedVars` — owned vars needing cleanup in throws functions
- `_emitFuncCleanup(lines, I)` — emits all pending cleanups (block + heap) before return/throw
- `_emitHeapCleanup(lines, I)` — emits `if (ptr != NULL) { Xxx_destructor(ptr); tsc_free(ptr); }` for all non-moved heap vars
- `_hasPendingCleanups()` / `_hasPendingHeapCleanups()` — check if any cleanups are pending
- `_snapshotHeapMoved()` / `_restoreHeapMoved(snapshot)` — save/restore `_moved` flags around conditional blocks (prevents leak when throw/return inside if-block marks vars moved but other paths still need cleanup)

**Lazy emission guards (prevent duplicate C typedefs):**
- `this._emittedArrayStructs` — `Set<'Array_i32', ...>` — `_ensureArrayStruct(ident, elemC)`
- `this._emittedOptStructs` — `Set<'opt_i32', ...>` — `_ensureOptStruct(name, innerCType)`
- `this._emittedResultTypes` — `Set<'Result_i32_Error', ...>` — used by both `async-emit.js` and `func.js` (lazy per-function emission via `resolveType()`, not pre-scan)
- `this._emittedTuples`, `_emittedMapStructs`, `_emittedChannelTypes`, etc.
- Pattern: `_ensureXxx(name, ...)` checks Set, emits typedef if missing, adds to Set

**Capabilities & config:**
- `this._capabilities` — `{ allocator: 'heap'|'static', async: 'libuv'|'state_machine'|'none', fpu: bool, bits: 8|16|32|64, usize: 'u16'|'u32'|'u64', defaultNumber: 'f64'|'f32'|'i32'|'i16', posix: bool, strtoll: bool, console_uart: bool, os: bool }`
- `this._cap(key)` — capability lookup with DESKTOP_CAPABILITIES fallback
- `this._ptrBytes()` — pointer size from `_cap('usize')`: `{u16:2, u32:4, u64:8}` (replaces old `_isEmbedded()`-based size guesses)
- `this._strictRules` — `Set<string>` — strict mode rules (`no-any`, `safe-div`, `no-closures`, ...)
- `this._defaultNumber` — from `_cap('defaultNumber')`. Priority: CLI `--default-number` > `builds.<name>.defaultNumber` > `profile.defaultNumber` > `DESKTOP_CAPABILITIES.defaultNumber` ('f64'). No auto-detect.

**Output buffers (delegated to OutputBuffer):**
- `this._output` — `OutputBuffer` instance.
- `this.includes` / `this.typedefs` / `this.topLevel` / `this.mainStmts` / `this.lambdaLines` — backward-compat getters return `_output.*`.
- `addTop(line)` / `addLambda(line)` — delegate to `_output`. `addTop()` routes typedefs vs. topLevel.
- `ctx.emit()` — final assembly: includes + typedefs + lambdaLines + topLevel + `int main() { mainStmts }`. Stays on Context (needs cross-cutting state).

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
- **@heap classes:** `ClassName_destructor(ptr)` + `tsc_free(ptr)` at scope exit or before return (via `_emitHeapCleanup`). `_snapshotHeapMoved`/`_restoreHeapMoved` ensures conditional paths (throw inside if) don't leak.
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

12 built-in profiles: `desktop`, `avr`, `avr-heap`, `avr-coop`, `arm`, `nes`, `spectrum`, `genesis`, `ps2`, `dos`, `wasm`, `wasm32`.

```typescript
declare platform {
    bits: 32;               // 8 (AVR), 16 (NES), 32 (ARM), 64 (desktop)
    fpu: false;             // hardware float support
    allocator: "static";    // "heap" | "static" (was "none", merged)
    async: "state_machine"; // "libuv" | "state_machine" | "none"
    usize: "u16";           // size_t width
    defaultNumber: "i16";   // "f64" | "f32" | "i32" | "i16" — C type for `number`
    unaligned_access: false;
    posix: false;           // POSIX API available
    strtoll: false;         // strtoll() available
    console_uart: true;     // UART console output
    console_baud: 9600;
}
```

`defaultNumber` per profile: desktop/dos/wasm/wasm32=`f64`, ps2=`f32`, arm/genesis=`i32`, avr/avr-heap/avr-coop/nes/spectrum=`i16`. 8-bit platforms use `i16` because C `int` is 16-bit.

`_cap(key)` looks up capabilities. `TSC_NO_POSIX`, `TSC_NO_STRTOLL`, `TSC_CONSOLE_UART`, `TSC_CONSOLE_BAUD` defines passed to gcc.

### Strict mode (`_strictRules`)

Rules: `no-any`, `no-unsafe`, `no-native`, `safe-div`, `safe-arith`, `no-lossy-cast`, `no-dynamic-alloc`, `no-closures`, `no-interfaces`, `no-threads`, `no-sort`, `switch-default`, `no-abort`, `no-i64-print`. Configured via `tsc.package.json` `"strict": [...]` or `--strict` CLI. SIL3 preset combines all.

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
| 11 | 69 | Embedded (pool, heap, stack_size, @struct) |
| 12 | ~120 | Stdlib runtime |
| 13 | 21 | Decorators |
| 14 | 7 | Reactive |
| 15 | 10 | Regex |
| 16 | 3 | LSP |
| 17 | 12 | Linter, retro platforms |
| 18 | 21 | Optimizer, WASM, DTS, sourcemaps |
| 19 | 74 | IO/Net/WS |

**Total: ~1963 tests, all pass with gcc.** Phase 11 heap/pool gcc failures (#35) — all 25 fixed in `90764c1`.

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

- **Branch:** `develop` on `https://github.com/tsclang/tsclang.git` — HEAD: `bb0e7b9`
- **GitHub Issues:** #1–#39. **All bugs closed.** Closed: #1–#5, #8–#10, #14, #21–#22, #34, #35 (bugs); #7, #11, #12, #13, #36 (correctness/enhancement); #37 (defaultNumber required), #38 (`_isEmbedded()` eliminated), #39 (multiple var decls). Open: #25–#31 (tech-debt refactoring), #15–#20, #24, #32–#33 (investigation/enhancement).
- **Refactoring Phase 1 (#25) — DONE:** Extracted ScopeManager (`b4ab719`), BorrowTracker (`d710a0f`), OutputBuffer (`0069c13`). Context: 901→827 lines. TypeRegistry deferred (`_typeCache` doesn't exist, design needed). All tests pass.
- **Refactoring plan:** 10 phases to extract IR/SSA pipeline. Phase 1: extract state objects from Context (#25). Phase 7 (ownership on IR) deferred. Old codegen deleted after switch-over.
- **Documentation:** root has 3 .md files — `README.md`, `AGENTS.md`, `CONTEXT.md`. Spec navigation in `spec/INDEX.md`. All removed: `LOG.md`, `AGENTS_PLAN.md`, `AUDIT-PLAN.md`, `FUTURE.md`, `QNX.md`.

### Architectural decisions (2026-06-13)

- **Compiler language: JS, not TS.** Port to TS rejected — huge effort, no user value, types would need rewrite after refactoring. JSDoc annotations on critical files (`codegen.js`, `types.js`, `parser.js`) for IDE support instead. Long-term goal: self-host in `.tsc`.
- **IR/SSA: own, not TypeScript compiler API.** TSClang ≠ TypeScript — ownership types, capabilities, C emission are fundamentally different. `typescript` package (~40MB) is unacceptable for embedded tooling. Spec in `spec/16-tooling/16-compiler.md`.
- **Bug fix priority before refactoring:** (1) ~~16 test failures~~ ✅ #34; (2) memory safety: ~~#14~~ ✅, ~~#8~~ ✅, ~~#3~~ ✅, ~~#1~~ ✅; (3) correctness: ~~#2~~ ✅, ~~#4~~ ✅, ~~#5~~ ✅, ~~#9~~ ✅, ~~#10~~ ✅, ~~#21~~ ✅, ~~#22~~ ✅; (4) then refactoring Phase 1 (#25). Rationale: P6 — can't refactor safely with red tests.

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
- **String concat chain (3+ operands)** — `_flattenStringConcat` recursively flattens `+` chain in `operators.js`; `_stringConcatChain` emits `tsc_string_concat_n((String[]){ ... }, N)` via C99 compound literal. Complex operands (heap String calls, non-string conversions) get temp vars + `_pushPostStmtCleanup` release. 2-operand case unchanged (`tsc_string_concat`).
- **Closure env always heap-allocated** — `hoistClosure` always emits destroy function (`_closure_N_destroy`: releases strings + `free(env)`). All 6 allocation sites use `tsc_malloc`. Cleanup via `_registerCleanup(${destroyFn}(env))`. `_suppressCleanupFor`/`_hasCleanupFor` match `${name}_env)` pattern. Functions returning capturing closures tracked via `_returnsCapturingClosure` flag (set in `hoistClosure` when `_inReturnContext`); call dispatch passes `.env` for `isClosure || !funcPtr` closures.
- **Recursive type detection** — `_resolvingTypes` Set tracks types currently being defined. In `visitTypeAlias` (TypeObject) and `visitInterface` (struct branch), name is added before field processing, removed after. If `resolveType` returns the type's own name → compile error ("use Ref/Arc/Mut for indirection"). Only catches direct by-value self-reference; indirect cycles (`A→B→A`) caught by C compiler. Pointer-based (`Ref<A>`, `Arc<A>`, `A[]`) not affected.
- **Cross-module type resolution** — Types (class/interface/enum/type-alias) are NOT in scope (`this.define`), they're in type tables (`this.classes`, `this._typeAliases`). Export side: `dispatch.js` Export/ExportFrom cases check type tables as fallback when `lookup()` fails. Import side: `codegen.js` pre-population routes type entries to type tables (`isStruct`/`isEnum`/`isScalarAlias` → `this.classes`, `_isTypeAlias` → `this._typeAliases`) instead of scope. `newToC` (`new-expr.js`) uses `cls._cname ?? name` for all C identifiers. Module prefix: ALL declaration types now get prefixed (`_cname` for types, `_cAlias` for consts, `funcName` for functions, `<prefix>_closure_N`/`<prefix>_lambda_N` for closures). `import type { X }` parsed but treated same as `import { X }` (typeOnly flag not enforced).
- **Result type emission (#35)** — Lazy per-function in `func.js` using `resolveType()` + `_emittedResultTypes` Set. Pre-scan removed (used simplified type mapping that missed pool/heap wrapping). Union error types still emitted per-errKey via `_emittedResultErrKeys`. Throws function symbols carry `_resultType`, `_resultValueType`, `_resultErrTypes`, `_isThrowsFunc` for use by call sites.
- **Error vs TscError (#35)** — Built-in error type is `TscError` in C, not `Error`. `_errMsgField(errTypes)` helper returns `'message'` for `TscError`, `'_base.message'` for user-defined throws classes. `throw new Error("msg")` → compound literal `(TscError){ .message = ... }`, NOT `TscError_new()`. User-defined throw classes use `_new()` constructor.
- **Heap/pool method dispatch (#35)** — `classSym.ctype` may be `'Counter *'` (with trailing ` *`). Strip with `.replace(/ \*$/, '')` before looking up class in `this.classes`.
- **Default constructor for heap (#35)** — `new Box()` without constructor: emit `(Box){0}` zero-init instead of undefined `Box_new()`. Pool exhaustion: `(TscError){ .message = STR_LIT("pool exhausted: ClassName") }`.
- **Recursive struct forward declaration (#35)** — Non-Arc self-referential classes (e.g., `class Node { value: i32; next: Node }`) need `typedef struct Name Name;` before struct body. Previously only Arc classes had this.
- **Field access after cast on heap (#35)** — `(n as Node).value` on heap pointer: `dispatch.js` must `inferType()` for non-Ident member objects to decide `->` vs `.`. Without this, generated `n.value` instead of `n->value`.
- **Synthesized main with throws (#35)** — When `_tsc_main()` returns `Result<T,E>`, `int main()` must unwrap: check `.ok`, panic on error with `.error` message, return `.value`. Added `_explicitMainThrows`/`_explicitMainResultType`/`_explicitMainErrTypes` fields.
- **Auto-propagation in VarDecl (#35)** — `const a = create(1)` inside throws function: `vardecl.js` detects throws func call in init, emits Result temp + `.ok` check + error propagation (goto cleanup or return), binds var to `.value`.
- **Recursive closures** — Closures (`const f = (n) => f(n-1)`) need pre-declaration before body compilation. `vardecl.js` pre-declares name with `_isRecursiveSelf: true` and predicted `_closureFnName` BEFORE calling `hoistClosure`/`hoistArrow`. Prediction: `_closure_${this.closureCount}_fn` for capturing path, `_lambda_${this.lambdaCount}_${retSuffix}` for non-capturing path. `_findFreeVars` (`closures.js`) excludes self name (3rd param `selfName`). `call-dispatch.js` checks `_isRecursiveSelf` before `tsc_closure` dispatch: emitting direct static call `_closure_N_fn(env, args)` (capturing) or `_lambda_N_ret(args)` (non-capturing) instead of indirect `fn.fn(env, args)`. Inside closure body, `env` is the first parameter name. Pattern mirrors `func.js:372` define-before-body for named functions.
- **Closure type preservation** — Two call dispatch patterns: `isClosure:true` (capturing, passes `.env`: `((ret)(*)(void*,params)fn)(env, args)`) vs `funcPtr:true` (non-capturing, no `.env`: `((ret)(*)(params)fn)(args)`). Choice depends on whether the underlying C function expects `void*` first param. `func.js:395` sets `closureRetType` on function symbols for TypeFunc returns. `closures.js:181` sets `_returnsCapturingClosure` on enclosing function when hoisting a capturing closure in return context. `vardecl.js` Path C (line 1301) uses `_returnsCapturingClosure` to choose isClosure vs funcPtr. `infer.js:376` must check `!sym.funcName` — functions returning tsc_closure (funcName set) should return ctype, not closureRetType. Known limitations: chained calls `f()()` need temp-var mechanism; array-of-closures `arr[i]()` needs `.env` passing in non-Ident callee dispatch.
- **Non-const static init splitting** — C requires static/global vars to have constant initializers. `dispatch.js` `needsStatic` block detects `Call` nodes in init AST (NOT `New` — `new Struct()` generates `{0}` which IS constant). When non-const: zero-init declaration at top level + runtime assignment. Library mode: assignment goes to `_libInitStmts` → emitted as `void <prefix>__init(void) { ... }`. Non-library: assignment goes to `mainStmts`. `compileTsc` collects `_initFn` from deps → passes as `depInitFns` to consuming module's codegen → injected after `TSC_INIT()` in main(). Each library `__init` calls its own deps' `__init` (transitive chain). Limitation: `new Arc<T>()` at top-level in library mode still generates non-constant static init (edge case).
- **Integer literal range check (#12)** — `_checkLiteralFitsType(node, ctype)` in `literals.js`: compile error if literal overflows target integer type. Full range table for i8-i64, u8-u64. Uses `constVal()` (handles Unary minus). Called from `vardecl.js` before `literalToCTyped` when `typeAnn` is set. Spec: `03-numbers.md:178-199`.
- **safe-arith strict rule (#11)** — Integer `+`, `-`, `*` = compile error when `safe-arith` enabled. Pattern mirrors `safe-div`: `operators.js` (binary ops) + `assign.js` (compound `+=`, `-=`, `*=`). Escape hatches: `Math.checkedAdd/Sub/Mul` via `__builtin_*_overflow` → returns `opt_T` (null on overflow). Type inference in `infer.js` returns `opt_<ident>`. GCC statement expression `({ ... })` used for inline checked arithmetic. Spec: `13-strict-mode.md` (new section, SIL3 preset).
- **PROGMEM string sort on AVR (#7)** — `_tsc_cmp_string_asc` in `runtime.h`: `#ifdef __AVR__` branch uses `_tsc_str_get` byte-by-byte instead of `memcmp` (which reads SRAM, not flash). Same pattern as `_tsc_str_eq`. Cannot be tested without avr-gcc + simavr.
- **Numeric auto-cast (#36)** — Three-mechanism system: (1) implicit narrowing = error; (2) explicit `as` = OK (blocked by `no-lossy-cast`); (3) safe functions = always OK. `_isSafeWidening(src, dst)` in `helpers.js` — algorithmic widening matrix (bit sizes + signedness), replaces old ad-hoc `illegalConversions` table (5 pairs). Rules: int→int widening OK if dst wider AND NOT signed→unsigned; int→float OK if bits ≤ mantissa (f32=24, f64=53); f32→f64 OK; size_t→i64/u64 special-cased OK. `constVal` + `literalToCTyped` parse `3.0` as integer `3` (zero-fraction floats). Float literal with fractional part to integer type = compile error. Widening check skips: Literal, Unary, Ternary, Binary, Index, Member (inferType returns `double` for expressions with number literals — not accurate enough for narrowing checks). Applied in `vardecl.js` (typed declarations) and `assign.js` (simple `=` assignments).
- **`defaultNumber` required (#37)** — All 12 profiles × 2 formats (24 files) must declare `defaultNumber`. Removed from `program.js`/`codegen.js` constructor auto-detect. Priority: CLI > builds > profile > DESKTOP_CAPABILITIES. `inferLiteralCType` (`types.js:93`) returns `PRIMITIVE_MAP[defaultNumber]` for ALL number literals — on integer-default platforms (avr/nes/spectrum), number literals are integers. fpu:false pre-scan (`program.js:106-125`) catches float TypeRef AND float literals (`.` or exponent); hex literals (`0xFF`) correctly skipped. 3 new tests in phase17.
- **`_isEmbedded()` eliminated (#38)** — Replaced 36 call sites with direct `_cap()` checks. Mapping: pointer sizes → `_ptrBytes()` from `_cap('usize')`; printf format → `_cap('bits') < 32`; OS features → `_cap('os') === false`; libuv/async features → `_cap('async') !== 'libuv'`; embedded-only (Tasks/HashMap) → `_cap('async') === 'libuv'` (inverse); @struct → `_cap('allocator') !== 'heap'`; stdlib → `_cap('os')`/`_cap('allocator')`. `_ptrBytes()` at `codegen.js:343`. Fixed AVR pointer size bug (2 bytes, not 4).
- **Multiple variable declarations (#39)** — `let x = 1, y = 2` via `parseSingleDeclarator` helper + comma loop in `parseVarDecl` (`parser.js:588-640`). Returns `VarDecls` wrapper (`{ kind:'VarDecls', decls:[...], line }`) if >1 declarator, `VarDecl` if 1 (backward compat). `parseBlock`/`parseProgram` spread `VarDecls` into individual `VarDecl` nodes. For-loop init: same-type inline (`for (T x = 0, y = 10; ...)`), different-type hoisted before `for`. 7 tests in phase1.

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
