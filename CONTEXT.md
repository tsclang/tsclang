# CONTEXT.md — TSClang Internal Knowledge Base

> **Purpose:** Self-contained knowledge dump for AI sessions. Read this FIRST. Last updated: 2026-10-31.

---

## 1. TL;DR

**TSClang** = TypeScript-like language (`.tsc`) compiled to C. Stack: Node.js ESM.
- **Monorepo (pnpm workspaces):** `@tsclang/ast` (pure AST/token/symbol types) · `@tsclang/compiler` (core library: lexer→parser→codegen→C + runtime + profiles) · `@tsclang/cli` (binary: dispatcher + commands + LSP) · `@tsclang/pm` (package manager domain: lock/manifest/registry/semver; npm-семантика install/remove, mock-реестр) · `@tsclang/tests` / `@tsclang/test-engine` · `@tsclang/spec`
- **Compiler:** `packages/compiler/src/compiler/` (lexer → parser → codegen → C). Public API barrel: `packages/compiler/src/index.ts`. `strict: true`, ZERO @ts-nocheck.
- **Runtime:** `packages/compiler/src/runtime/runtime.h` (single-header C library)
- **CLI:** `packages/cli/src/index.ts` (диспетчер) → `packages/cli/src/cli/commands/*.ts`
- **Tests:** 1980 case corpus + 619 spec-suite (4 suites) + 158 engine self-tests
- **Targets:** desktop, AVR, NES, Genesis, Spectrum, DOS, PS2, WASM
- **Next goal:** Self-hosting (#47–#50)

---

## 2. Compiler Pipeline

```
input.tsc → lexer.ts → parser.ts → semantics.ts → [optimizer.ts] → codegen.ts → runtime.h → output.c
```

**Entry points:** `codegen()` in `codegen.ts:26`, `compileTsc()` in `compile.ts` (recursive imports).

**Semantic pass (#208, `semantics.ts`):** runs in `compileTsc()` after parsing, **before codegen and before the artifact cache**. Two namespaces: type space (file-level set, hoisted, position-insensitive) + value space (scope chain, TDZ positional check, `var` hoists to function scope, nested-fn deferred execution bypasses TDZ). Codes: E121 unknown type, E122 undeclared ident (incl. TDZ), E123 duplicate decl (overload sets + interface/class merging legal, first binding wins), E124 literal/annotation mismatch (kind mismatch only; fractional value → E100, int range → E101, char string length → E102 stay in codegen; target `number` IS checked — it is not in PRIMITIVE_MAP, explicit branch, `let x: number = true` → E124). Allowlists: `BUILTIN_TYPE_NAMES` / `BUILTIN_VALUE_NAMES` (wrapper ctors, numeric namespaces `i32.parse`, utility types). Max 10 errors. Throws standard error bag (`isTscErrorBag`). `strict: ['safe-math']` pre-declares `MathError` type.

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

### Tests: 1974 case corpus (disk) + 620 spec-suite + 158 engine self-tests

**Case corpus:** 1980 cases (disk count 2026-11-07; #252 добавил 5 init-кейсов, #254 — 6 pm-кейсов: remove/basic, remove/not-installed, install/aliases-i-u-r, install/adds-to-manifest, update/resolve-range, update/bare-no-wipe). Full phased rerun 2026-11-03 (unicode idents #230 + bigint mixing #231, dist build clean): all 16 sections + book green. 2026-11-04 (#236): `@struct` allowed on ALL platforms — E304 non-embedded branch removed from class.ts; methods-ban (E412) and `_isInline` marking no longer gated on `isEmbedded`; desktop C-output is byte-identical to avr for data-only classes; runner resolves `@tsclang/compiler` from dist — `pnpm build` BEFORE rerunning tests after compiler changes. Manual gcc from Git Bash fails SILENTLY (exit 1, zero diagnostics — cc1.exe needs the MSYS2 runtime); for ad-hoc compile checks use `/c/msys64/usr/bin/bash -lc "gcc input.c -o app.exe -I.../runtime && ./app.exe"` — the same way the runner does it (tests/src/compilers/msys2.ts). Phased rerun after #236: 14-stdlib 303✓, 07-classes 45✓; 13-build 187✓ на 2026-11-07 (#251 вернул run — 3 кейса 176✓, #252 init-пресеты +5 → 181✓, #254 pm +6; до #251 — 170✓). Bigint mixing rules (#231): any expression containing an n-literal infers 64-bit (`let a = 42n + 1` → int64_t even under defaultNumber=f64 — vardecl uses `_effectiveType` when `hasBigintLiteral(init)`); E124 target `number` resolves through defaultNumber BEFORE the bigint check (i64 default accepts `let a: number = 42n`, f64 → E124; `42n + 1` into f64-number → E100); n-literals always emit C suffix by value range in ANY expression position (`42LL`, `18446744073709551615ULL` — bare out-of-i64-range decimal is a C constraint violation; `literalToC` + `binaryWidened` both suffix). Known edge, separate issue: unary minus on `-9223372036854775808n` (i64 min) is inconsistent — annotated i64 OK (vardecl split-form special case), unannotated → false E101, in binary expr → silently uint64. All three former baseline failures are resolved: `03-types/widening/warn-not-array` fixed in dd2a8348 (#226), `10-async/async-fn/warn-async-recursion` replaced by `err-async-recursion` E307 in 5b0d9a86 (#228), `06-functions/function-values/store-in-var` turned green after the #227 closure-inferCall fix (3970fde3). `12-modules` warn-native-block/warn-unsafe-block were broken test data since #179 — fixed in #208 commit.

**Engine self-tests (`packages/test-engine/test/`, `pnpm tsx packages/test-engine/test/run.ts`):** 151p/0f/5xf/2xp (158; +7 matrix structural tests in `matrix.test.ts`). The 2 xpass are intentional self-tests of the xpass path. Engine is THE primary testing mechanism (#206): collect-then-run (async), hooks with poison propagation, xfail markers, three-phase errors (TscCompilationError/CompileError/RuntimeError), 30s compile timeouts.

**Spec audit (#205):** spec files carry `> Spec status:` markers (verified @ commit / unverified). 01-intro verified @ 4ad8489d. Chapter files + tests are the source of truth; #205 is the decision log. Rules: move keeps status; split → recheck seams.

**Spec-suites (`packages/tests/test/spec/`, run via per-folder `run.ts`):**

| Suite | Result | xfail (issue) |
|-------|--------|---------------|
| 02-syntax/02-variables | 280p/0f/3xf (283) | 3 literal-case files are **matrix-driven** (#223): range/invalid/alt-literals iterate `test-engine/src/matrix.ts` (anchors 8.x per type, 9.x by radix, 10.x per type); #215 Arc/Weak zero-value ×2, #216 enum `?` sugar ×1 |
| 02-syntax/02-formatting | 52p/0f/8xf (60) | #209 untyped arrow param ×2, #210 forEach macro, #211 tagged template, #212 ++/-- ASI ×2, #213 anon-struct Array typedef, #214 tsc_dtoa digits |
| 03-types/cast-pairs | 201p/0f (201) | 14×14 numeric `as`-cast pairs (desktop gcc, self-casts included) + 5 avr samples gated on avr-gcc availability; expectations probed, zero cast bugs found |
| 13-build/cli | 123p/0f/2s (125) | CLI surface suite (#238): dictionary-driven from `dictionary.json` = what book 00.2.2/00.2.3/00.7 CLAIMS (book is the priority source, every entry carries provenance; after the book restructure 00.2.3 = quick start, option tables live in 00.7.2+). Spawns `packages/cli/dist/index.js` (`pnpm build` first); gcc-dependent probes (--emit binary) use `runCli({viaMsys2:true})` — MSYS2 login-bash wrap, plain win32 spawn has broken gcc (#241 closed 2026-11-07: missing gcc/avr-objcopy/avrdude → pre-check `ConfigError: ... requires X in PATH`; found-but-silent gcc prints an MSYS2 hint after `gcc failed:`; avrdude args built by pure `buildAvrdudeArgs` in `cli/flash.ts` and unit-tested; hardware-free flash E2E = corpus `13-build/build/flash-avrdude-mock` — real avr-gcc/avr-objcopy + shim avrdude recording exact argv, `needs-unix` marker → runs inside WSL on win32 (2026-11-07; 13-build 173✓)). 2 skips = emcc/avr-gcc absent. 2026-11-06 surface fixes (#242–#244, #247): bare `tsclang` → help + exit 0; `<cmd> --help` universal (per-command where defined, main help otherwise); unknown options hard-error via `COMMAND_FLAGS` registry in `cli/args.ts` (single source for both checks; inline `--x=y` rejected with a hint, only `lint --rule=` allowed); `--no-cache` is build-only, not in the global help. 2026-11-06 (#238): `-w` alias dropped — `--watch` единственное написание; `build-cmake` заменена на `build --emit cmake` (генерирует CMakeLists.txt в outDir через `generateProjectCmake`, без компиляции .c; главы книги 00.7.7-17 перенумерованы в 00.7.6-16, `generateBuildCmake` остался для сайд-эффекта emit=c); `--outDir` переименован в `--out-dir` без алиаса; `--command` post-build hook (CLI flag перекрывает `builds.<name>.command` из КОРНЕВОГО манифеста; env `TSC_OUT_DIR`; one-shot пробрасывает exit-код команды, `--watch` убивает дерево прошлой команды — taskkill /T на win, SIGTERM группе на unix — и перезапускает после успешной пересборки; shell ХОСТА: на win это cmd.exe, который НЕ понимает `./` и прямые слеши — бинарь запускать как `out\hello`, на unix `./out/hello`; gcc-тест с бинарём платформозависим). Corpus: 3 забытых build-cmake кейса (avr/desktop/profile-select) мигрированы на `--emit cmake` (2cec7a49). 2026-11-06 (#238, финал): команда `run` удалена — полностью заменена `--command` (argv программы теперь внутри строки команды, `--`-обрезка args.ts вычищена); `runDebugCommand` переехала в `cli/commands/debug.ts`; validate-config больше не отвергает library-манифесты (рудимент run); глава книги 00.7.3-run.md удалена, 00.7.4-16 → 00.7.3-15 («14 команд»); corpus 13-build/run/ удалён (170✓). 2026-11-07 (#251): `run` ВОЗВРАЩЕНА — но с npm-семантикой (имя было свободно): именованные задачи из top-level `scripts` КОРНЕВОГО манифеста (объект непустых строк; validate-config типизирует: не-объект/не-строка → ConfigError); `tsclang run` без аргумента — список скриптов exit 0, `run <name>` — shell хоста + stdio inherit + проброс exit-кода скрипта, unknown → `ConfigError: unknown script 'x'; available: ...`; **self-shim**: mkdtemp-каталог с обёрткой `tsclang` (win `.cmd` / unix sh + chmod 755) prepended к PATH → `tsclang` внутри скриптов всегда вызывает ЭТОТ CLI без глобальной установки (аналог node_modules/.bin; в tsx-режиме shim ломается — argv[1]=src/index.ts без лоадера, тесты требуют dist); архитектурный принцип: события сборки (watch, kill-tree, respawn артефакта) обслуживает build флагами `--watch`/`--emit exec`/`--command`, scripts — только слой именования поверх (`run dev` = `build --watch --emit exec` работает полностью); книга: 00.7.3-run.md возвращена, 00.7.3-15 → 00.7.4-16 (15 команд), TOC/00.7.1/dictionary provenance синхронизированы; corpus 13-build/run/ возвращён: run-basic/run-exit-code/run-unknown (13-build 176✓). Remaining CLI bugs: #245, #246, #253 investigation (#239/#240 закрыты db425a4f, #241 — 2026-11-07, #252 — 2026-11-07). Emit-ось = лестница пайплайна (2026-11-07, #238 К4): desktop `c → binary → exec`, embedded `c → hex → flash`, wasm — свой конец, `cmake` — выход со ступени C; симметрия exec:binary = flash:hex (артефакт остаётся + действие последней мили). `--emit exec` = binary-ступень (gcc, pre-check как у К3) + запуск артефакта прямым spawn по абсолютному пути БЕЗ shell (cmd.exe `./` vs `\` грабли не возникают; win: подбирается `<stem>.exe`, т.к. MinGW gcc дописывает .exe); one-shot пробрасывает exit-код программы (spawnSync+process.exit), `--watch` переиспользует kill-tree машинерию `--command` (в `_runCommand` exec-ветка стоит ПЕРЕД `if (!_command)`); `exec` + эффективный `--command` → ConfigError (exec сам запускатель; аргументы/env программы → `binary --command`); манифест `builds.dev={emit:"exec"}` работает — нового ключа не нужно. 2026-11-07 (#252) init-пресеты + emit dts + обязательный type: позиционное имя init через `firstPositional` + `VALUE_FLAGS.init = {'--type'}` (голый цикл ел значения флагов: `init --type library mylib` создавал папку `library`); `packageGenerate(name, type, preset)` — default executable = builds.desktop {emit binary, outDir build/desktop, O2} + scripts {start,dev} + src/main.tsc + test/main.test.tsc; `--avr` = builds.avr (profile avr, mcu atmega328p, emit flash, outDir build/avr, Os, flash {programmer arduino, port /dev/ttyUSB0, baud 115200}) + scripts {flash}; `--library` = index.tsc (`export function hello`) + builds.dts {main index.tsc, emit dts, outDir build/dts} + scripts {dts}; `--declaration` = index.d.tsc (`declare function example_add` / `declare const EXAMPLE_OK`); `type` ОБЯЗАТЕЛЕН в validate-config: `executable|library|declaration|platform|package` ('package' — новый родовый в PACKAGE_TYPE_VALUES; радиус: validateConfig зовёт только validate-config, 4 semver-фикстуры корпуса получили `"type": "package"`); `emit dts` — выход из лестницы без codegen (реюз emitDtsSync из emit-dts команды, outDir, `Emitted <path> (N declarations)`); EMIT_VALUES в shared — одной правкой закрывает валидацию, help и ConfigError-список; `builds.<n>.main` реализован (спека документировала, код не умел; VALID_BUILD_KEYS + main): цепочка позиционный .tsc > builds.<n>.main > pkg.main, missingInput отложен до резолва buildCfg (у library нет top-level main, вход приходит из builds); self-shim run: абсолютный `process.execPath` вместо голого `node` (spawned cmd.exe в corpus-песочнице не резолвит node из PATH — лома́л corpus-кейс type-library-dts); dictionary init: --avr + --type values +package + creates test/main.test.tsc; corpus 13-build +5 init-кейсов (181✓). 2026-11-07 (#254) pm-команды: словарь получил alias-поля install/update + NEW remove; `<cmd> --help` для всех 5 pm-команд (helps/{install,update,remove,search,publish}.ts); e2e-тесты в sandbox (mkdtemp + chdir): install дописывает `dependencies`, remove чистит манифест+lock+`tsc_packages/`, update резолвит из манифеста. Provenance-номера строк в dictionary.json надо перепроверять после КАЖДОЙ правки 00.2.2/00.2.3 (help-листинг = строки с командами; сдвиг на ±N строк ломает provenance, но не тесты — тесты сверяют CLI против description-строк) |

Known bugs are marked `test(name, fn, { xfail: '#NNN' })` — counted as `xfailed`, excluded from pass/fail and exit code; XPASS prints loudly (marker → remove). Entry points: `pnpm tsx packages/tests/test/spec/<section>/<folder>/run.ts`.

| Section | Tests | Topic |
|---------|-------|-------|
| 02-syntax | 127 | Arithmetic, variables, formatting |
| 03-types | 539 | Numbers, enums, tuples, null |
| 04-ownership | 117 | Ownership, Arc, Weak, Clone |
| 06-functions | 66 | Functions, closures, overloads |
| 08-collections | 236 | Arrays, Map, Set, strings |
| 09-errors | 47 | throws, try/catch, bare-throws |
| 14-stdlib | 299 | console, Math, Date, JSON, std/* |

### Deferred / NOT YET

- IR/SSA pipeline (post-self-hosting)
- Borrow elision for field access
- Full Descriptor API, FnPtr, auto-constructor
- instanceof narrowing, full grapheme segmentation

### Project tracking

- **Branch:** `develop` on `https://github.com/tsclang/tsclang.git`
- **Open:** #23, #30–#31 (IR), #32 (bindgen), #33 (QNX), #47–#50 (self-hosting), #72–#82 (epics), #178 (AsyncMutex), #205 (spec audit — deferred to separate session), #207 (test-engine v2 P1: C-snapshot/platform-matrix/parallelism), #228 (recursive async → heap state machines, E307 interim), #232 (i64-min unary minus edge), #233 (unknown decorators silently ignored — incl. spec-documented @signal), #234 (inline `new` as Ref<T> arg → invalid C `&{0}`), #235 (@struct `new T(args)` silently drops args → `{0}`), #237 (mixed-type `==`/`===` e.g. `1 == "1"` → invalid C `int == String`)
- **Closed:** #66, #67 (throws on methods), #69 (saturatingCast), #101 (no-lossy-cast + safe alternatives), #111 (Number.*), #132–#137 (test engine), #149 (monorepo consolidation), #150–#152 (Phase 2 typing), #153–#165 (Phase 2.4 functional passes — Variant E), #166–#172 (pre-existing test failures + Phase 2.4 Step 0), #173 (named fn .map() type inference), #174 (string concat 2-op leak + Return cleanup flush), #175 (escaping closure ref/mut compile error), #176 (recursive + mutual type alias forward declaration), #177 (run.ts warning print + expected.no-warning), #179 (warnings), #180 (decimal types), #206 (test-engine repair), #208 (semantic checks E121–E124), #220 (bigint n-suffix literals, fed0d08a), #223 (value matrix v2 + suites, b4da8132/10ca689b/d73b024e), #224 (isize %d truncation, da31f22b), #225 (usize range check, cd45699c), #226 (truthy !array invalid C, dd2a8348), #227 (closure inferCall ret type, 3970fde3), #229 (isize range check, 9c5049ca), #230 (unicode identifiers + mangling, 36542fb4), #231 (bigint mixing, see above), #236 (@struct on all platforms, 5b584ae4). Bonus fix without issue: `number`-target literal checks in semantics (cc63e4ce).

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
- **gcc on Windows = только через MSYS2 bash (test-engine).** Прямой `spawnSync('gcc')` из node молча умирает (status 1, пустой stderr — cc1.exe требует MSYS2 runtime). Все вызовы gcc-бэкендов идут через `test-engine/src/compilers/msys2.ts` (`bash --login -c` + `/mingw64/bin` в PATH + `toMsysPath`); старый `runner.ts` импортирует те же хелперы из `@tsclang/test-engine` (дедуп, #206 шаг 1). Селф-тесты движка: `pnpm test:engine` или `pnpm tsx packages/test-engine/test/run.ts` (пишутся с нуля по #206, шаг 10). `file()`/`compile(path)` резолвят пути от файла-вызывающего (stack-based `callerDir()`, обе формы кадров — file:// и виндовые пути; #206 шаг 3) — cwd не важен, `pnpm --filter` работает.
- **`_postStmtCleanups` in Return.** All Return paths in `control-flow.ts` now call `_flushPostStmtCleanups` before the actual return. Previously, temps created during return expression evaluation (e.g. string concat with non-String operand) were leaked. If adding new Return paths, always flush post-stmt cleanups before the return.
- **Named fn callbacks in `.map()`.** `infer.ts` handles both `Arrow` and `Ident` callbacks. Codegen (`_extractCallbackFn`) already worked — only type inference needed the fix. String array callbacks still have calling convention mismatch (macro passes `String *`, named fn takes `String` by value) — use arrow functions for string arrays.
- **Spec-suites gotchas (02-syntax).** Import engine as `@tsclang/test-engine` (NOT `@tslang` — dead name from early commits). Each folder needs `run.ts` entry + `printSummary()` — without it `expect` failures are swallowed (test() catches, exit 0). Engine `run()` normalizes CRLF → LF (Windows text-mode stdout). Console prints closure as `null`/`[Function]` (console.ts). Default init: pointer ctypes get `= NULL`, structs `{0}` (vardecl.ts `_visitVarDecl`).
- **Parser recovery debris (matters for `semantics.ts`).** `keyof T` in value position → `Ident('keyof')` + stray `ExprStmt(Ident)`: skip Ident `keyof`, skip bare ExprStmt of known type names. BigInt `n`-suffix literals are FULLY supported since #220 (lexer TK.BIGINT → ast `litType:'bigint'` → i64/u64 only; type-position/enum/match patterns rejected by parser; E124 elsewhere) — the old "number + stray Ident('n')" parse bug is gone. Destructuring patterns from parser are FLAT, not AST-typed: import `names` = plain strings, obj pattern = `{name, alias?, defaultVal?}[]`, arr pattern = `{name?, rest??}[]|null`, ForOf binding = `{kind:'Ident'|'ObjPattern'|'ArrayPattern', ...}` — use `declarePatternItems()` in semantics.ts, don't switch on AST kinds. Match patterns: `MatchObjLit {discriminators, fields: string[]}`, `MatchClass {className, fields}`, `MatchTuple {elements}` with `MatchIdent {name}`.
- **`declare function` returning `Promise<T>`** now emits the `Promise_T` typedef via `_emitPromiseTypedef` in `visitDeclareFunction` (dispatch.ts) — nothing else emits it for bodyless externs, and the extern line alone doesn't compile.

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
| Compile manually | `node packages/cli/dist/index.js build input.tsc --out-dir .tsclang-tmp/` |

---

## 11. CLI Architecture

`packages/cli/dist/index.js` (source: `src/index.ts`) — slim dispatcher (lives in `@tsclang/cli`, separate from the compiler library). Resolves `COMPILER_ROOT` via `require.resolve('@tsclang/compiler')` to locate `runtime/`+`profiles/` (those stay in the compiler package). Commands: build, debug, test, init, run, lint, format, explain, emit-dts, validate-config, install (i), update (u), remove (r), search, publish, lsp — 16 команд, pm-алиасы `i`/`u`/`r` канонизируются через `COMMAND_ALIASES` (args.ts) в index.ts ДО всех проверок: `args[0]` переписывается каноническим именем, иначе `getPositional` вернул бы сам алиас как позиционный аргумент (он пропускает токен, равный имени команды). `run` — именованные скрипты из `scripts` корневого манифеста, npm-семантика (#251; между #238 и #251 команда отсутствовала — была заменена на `build --emit binary --command`); `runDebugCommand` живёт в `cli/commands/debug.ts`; validate-config больше не отвергает library-манифесты (проверка была рудиментом run). pm-команды (#254, npm-семантика): `install <pkg>` дописывает constraint в `dependencies` (`manifestAddDependency` в pm/registry.ts, минимальный манифест при отсутствии файла; bare `install` = sync lock↔manifest c prune); `update` честно пересолвляет constraint из манифеста через mock-реестр (bare = все deps + prune, lock НИКОГДА не стирается); `remove` вычищает манифест+lock+`tsc_packages/<name>/` без Y/n (не установлен → exit 1). `resolveRange` понимает `*`/`latest` → последняя версия реестра; `semverParse` никогда не возвращает null (NaN→0) — валидность версии проверяют regex'ом `/^\d+\.\d+\.\d+$/` (lockEntrySatisfies).

Module map (all under `packages/cli/src/cli/`): `args.ts`, `help.ts`, `helpers.ts`, `registry.ts`, `config-validator.ts`, `profile-loader.ts`, `cmake.ts`, `semver.ts` (top-level `src/`), `formatter.ts` (top-level `src/`), `types/` (package-type, emit), `cli/commands/*.ts`, `lsp/server.ts`.

---

## 12. Test Engine (`packages/test-engine/`)

- **API:** describe, test, expect (matchers), hooks (beforeEach/afterEach), 4-phase pipeline. `test(name, fn, { xfail: '#NNN' })`, `test.only/skip`, filter via `run.ts <substring>` / `TSC_TEST_FILTER`, JSON report (`--json[=path]` / `TSC_TEST_JSON`) with toolchain env (#207 P0)
- **Value matrix (`src/matrix.ts`, #223):** the single source of truth for per-type literal cases — `TypeCases { type, min?, max?, valid[], outOfRange[], invalidValues[], altLiterals[] }`, ALL values as string pairs (d8 `0` → `"0.00"`, u64 max via `n`-literal are not JS numbers). i64/u64 bounds are honest n-literals (post-#220); usize max is a plain literal (n-suffix is E124 for anything but i64/u64); usize `-1`/isize overflow are E101 (post-#225/#229); multi-char strings into char/u8 are E102. Every entry verified against desktop gcc (170-case probe) before extraction; `matrix.test.ts` guards structure. `filterValidTypes` lives here too (printf-safe types per profile: i16 deliberately stays at bits:8 — avr-gcc int is 16-bit). engine.ts re-exports both.
- **`toMatchC(expectedC?)` (#207 P1.5):** normalizeC() both sides; no-arg = file snapshots (`__c-snapshots__/<file>.jsonl` next to the test file, key = full test name; missing entry created, `TSC_SNAPSHOT_UPDATE=1` rewrites). Under `CI=true` a missing snapshot **fails** instead of being created (fresh checkout must not pass on an empty store); explicit update works under CI too. Secondary mode for codegen details invisible to behavior. `not.toMatchC` — inline only.
- **Backends:** gcc (MSYS2 on Windows), clang, msvc, avr-gcc, wasm (pluggable). Pure arg-builders exported for toolchain-free unit tests: `buildAvrCompileArgs` / `buildSimavrArgs` / `normalizeSimavrOut` (avr-gcc.ts), `buildEmccArgs` (wasm.ts — always `-DTSC_WASM -sWASM=1 -sSTANDALONE_WASM=1`, CLI `--emit wasm` parity). `mcu`/`freq` flow RunOptions → CompileOpts+RunOpts (#207 P1.6). Every spawn has a wall-clock timeout (compile 30s, run `timeoutMs` default 5s).
- **run() = CLI parity for C defines:** the target profile's `capabilityDefines()` go to `backend.compile()` exactly like `tsclang build` (avr: `TSC_NO_POSIX`, `TSC_NO_STRTOLL`, `TSC_CONSOLE_UART`, `TSC_CONSOLE_BAUD=9600`). AVR e2e therefore needs BOTH `target: "avr"` and `compiler: "avr-gcc"` — without the profile the UART console never inits and simavr sees no output. avr-gcc backend adds only toolchain constants (`-mmcu=`, `-Os`, `-DTSC_EMBEDDED`).
- **Backend = success authority:** engine.run() throws RuntimeError only on `success: false`; it no longer second-guesses `exitCode !== 0` — simavr runs end with a timeout kill (normal) while the backend reports success when output was captured.
- **simavr output quirks (verified on WSL, minimal non-TSC firmware):** UART bytes arrive on **stderr**, ANSI-green-wrapped with trailing `..` (simavr's own decoration); load banners on stdout. Backend merges both channels + `normalizeSimavrOut()` strips decorations/banners. simavr flag forms: `-m <mcu>` `-f <freq>` `-uart0:stdio` (NOT `-mcu`).
- **`wsl bash -c <text>` goes through an EXTRA expand pass (corpus runner WSL branch):** `spawn('wsl', ['bash','-c', script])` relays the script through an intermediate shell — `$PWD`/`$(...)`/`$@` in the TEXT are substituted in the relay's context (cwd of the win32 node process) before the real bash parses the residue. Verified: `cd /tmp; echo $PWD` prints the OLD dir, `X=hello; echo $X` prints empty, `$(echo inner-$X)` RUNS in the relay — while `declare -p PWD` inside the same bash shows the CORRECT value (bash itself is fine, the text arrives pre-expanded). Breaks `PATH="$PWD/shims:$PATH"` in input.sh (mock toolchains). Fix in runner.ts: pass the script as `echo '<base64>' | base64 -d | bash` — nothing expandable survives into the relay. Related: a native win32 spawn executes only .exe, so shell-script shims resolve only in a real unix — hence the corpus `needs-unix` marker (file lists required commands; on win32 the whole input.sh reruns inside WSL via the base64 pipe, `command -v` probe skips the case when WSL or the tools are absent; node = WSL's own /usr/bin/node running the win32 CLI through /mnt, tsx unsupported there).
- **e2e self-tests (availability-gated, backends.test.ts):** wasm (`console.log(41+1)` → "42" via emcc+node) and avr (same via WSL avr-gcc+simavr, `target:"avr"`). Gate = `isAvailable()`: skip silently (pass) where the toolchain is absent.
- **emsdk on this machine:** installed at `C:\emsdk` (v5.0.6), `C:\emsdk` + `C:\emsdk\upstream\emscripten` appended to user PATH; shells started before that need `export PATH="/c/emsdk:/c/emsdk/upstream/emscripten:$PATH"`.
- **`platformMatrix.targetBackends`:** honest profile→backend model for all 12 compiler profiles; `backend: null` = no simulator/backend (NES, Genesis, PS2, Spectrum, DOS, ARM — C-fragment compare only). `targets` = runnable subset derived from it.
- **Registration ≠ execution:** tests run only at `printSummary()` / `runSuite()`; expect() inside a callback runs in the execution phase (`EngineState.currentTest` set by runTest — file-snapshot keying relies on it).
- **CLI:** `tsclang test` compiles `*.test.tsc` itself (compileTsc + gcc) — the dead standalone `tsclang-test` bin (packages/test-engine/src/index.ts) is deleted; it judged by exit code and was referenced by nothing
- **File testing:** `file` parameter + `compileTsc()` for recursive imports
- **Known divergence (minor):** corpus runner's avr branch omits `-DTSC_EMBEDDED` while the CLI adds it for hex/flash emit — corpus tests the profile defines only
- **Spec:** `packages/spec/spec/16-tooling/16-compiler.md` §Test Engine API, `packages/test-engine/README.md`
- **Parallelism (#207 P1.4):** deferred by design until the full run exceeds ~10 min (issue #207 порядок); `EngineState` swap (runSuite) already isolates results for workers

---

## 13. Throws on Methods

Methods declare `throws` like functions. `emitMethod` builds `throwsCtx`. `_methodNames` stores `_isThrowsFunc`. Bare-throws detection works for `obj.method()`. Spec: `09-errors/09-errors.md`.

---

## 14. Math.saturatingCast/checkedCast

`saturatingCast<T>(x)` — clamp to range. `checkedCast<T>(x)` — return `T | null`. Escape hatch for `no-lossy-cast`. Inline C in `builtin-helpers.ts`. Spec: `14-stdlib/14-stdlib.md` + `13-strict-mode.md`.

---

## 15. Decimal Fixed-Point Types (#180 — COMPLETE)

**All 11 phases implemented.** 128 tests pass. Issue #180 closed.

### Type table

| Type | C storage | Scale | Decimals | Range |
|------|-----------|-------|----------|-------|
| `d8`  | `int8_t`  | 100       | 2 | ±1.27 |
| `d16` | `int16_t` | 100       | 2 | ±327.67 |
| `d32` | `int32_t` | 10000     | 4 | ±214748.3647 |
| `d64` | `int64_t` | 100000000 | 8 | ±92233720368.5 |

### Implemented (all phases)

- **Type registration:** `d8`/`d16`/`d32`/`d64` in `NUMBER_TYPES`, `PRIMITIVE_MAP` (`d8_t`/`d16_t`/`d32_t`/`d64_t`), `_numericTypeInfo` with `kind:'decimal'`. `decimal.ts`: `isDecimal`, `decimalScale`, `decimalDecimals`, `resolveDecimalBase` (alias-aware), `scaleLiteral` (round-half-away-from-zero, hex/octal via `Number()`).
- **Literals:** `literalToCTyped` scales float/int literals (`1.5` → `15000`, `3` → `30000`, `0xFF` → `2550000`). `_checkLiteralFitsType` checks scaled value against raw int range (overflow detection). Negative literals via `Unary('-', Literal)`.
- **defaultNumber:** `"d32"` etc. makes `number` resolve to decimal ctype via `_effectiveType` in `infer.ts`.
- **FPU check:** `program.ts` skips float-literal rejection inside decimal-typed `VarDecl` init. Decimal types allowed when `fpu: false`.
- **Arithmetic:** `+`/`-` plain integer ops. `*` via `tsc_mul_dXX()` (wider intermediate, round-half-away-from-zero). `/` via `tsc_div_dXX()` + div-by-zero guard. `%` plain integer + div-by-zero guard. Mixed decimal+integer → compile error (explicit cast required). Numeric literals in compound assignment (`d32 += 1.5`) bypass widening check — `_expectedType` handles scaling.
- **Compound assignment:** `+=`/`-=` work directly. `*=`/`/=`/`%=` use runtime helpers + zero guard.
- **Casts (`as`):** Scale-aware. int→dec: `*scale`, dec→int: `/scale` (truncate toward zero), dec→dec widen: `*(dstScale/srcScale)`, dec→dec narrow: `/(srcScale/dstScale)`, dec↔float: `/scale.0` or `*scale.0`. `_isSafeWidening`: widening (d8→d16→d32→d64) safe, all else unsafe.
- **`no-lossy-cast` strict rule:** Decimal narrowing (d32→d16 etc.), decimal→integer, float→decimal all flagged as lossy. d32/d64→f32 flagged (9+ digits > f32's 7). d8/d16→f32 NOT lossy (matches i8/i16→f32 pattern). d*→f64 never lossy.
- **Formatting:** `console.log`, template literals, `.toString()`, `.toFixed()`, `.toPrecision()`, string concat, `JSON.stringify` all use `tsc_dec_dtoa(v, scale, dp)` / `tsc_dXX_to_string()`.
- **Math functions:** `abs`/`sign`/`min`/`max`/`clamp` preserve decimal (pure integer). Transcendentals (`sqrt`/`sin`/`cos`/etc.) use convert-compute-convert via `double` (FPU required). `floor`/`ceil`/`round`/`trunc` same. `pow`/`hypot`/`atan2` convert both args. `imul`/`clz32` rejected for decimal.
- **`Math.roundCast<T>(x)`:** Round-half-away-from-zero cast for ALL numeric pairs. Float→decimal uses `llround()`. Decimal→integer: `(val ± scale/2) / scale`. Decimal→narrower-decimal: `(val ± ratio/2) / ratio`.
- **`Math.saturatingCast<T>(x)` / `Math.checkedCast<T>(x)`:** All decimal types supported. Cross-scale range check adjusts bounds by scale ratio (`a < MIN*ratio || a > MAX*ratio` for narrowing).
- **`parse()` / `tryParse()`:** Pure integer parser in runtime.h (`_tsc_parse_decimal_raw`, `_tsc_valid_decimal`, `tsc_dXX_parse`, `tsc_dXX_try_parse`). No FPU required. Codegen: d-types in `primitiveMap` (`conversion.ts`) and `primitiveMap2` (`infer.ts`).
- **Runtime:** typedefs, `tsc_mul_dXX`/`tsc_div_dXX` (round-half-away-from-zero), portable 128-bit helpers (`tsc_mulu128`, `tsc_divu128by64`) for d64 without `__int128`. `tsc_dec_dtoa` (generic formatter with AVR/embedded branches). `tsc_dXX_to_string` (String-returning wrappers).
- Key files: `decimal.ts`, `helpers.ts`, `literals.ts`, `infer.ts`, `vardecl.ts`, `program.ts`, `operators.ts`, `assign.ts`, `dispatch.ts`, `console.ts`, `closures.ts`, `builtin-helpers.ts`, `conversion.ts`, `runtime.h`.
- Spec: `03-types/03-decimal-types.md` (227 lines), cross-refs in `03-numbers.md`, `03-null.md`, `13-platform-capabilities.md`, `13-strict-mode.md`.

---

## 16. Diagnostics System (#179 — W001-W011 COMPLETE)

**Registry:** `diagnostics.ts` — ~86 codes total (E0xx ownership, E1xx types, E2xx strict, E3xx platform, E4xx runtime+misc, W0xx warnings). `DiagnosticCode = keyof typeof DIAGNOSTICS` (type-safe). API: `ctx.errorCode(code, node?, params?, opts?)`, `ctx.warnCode(code, node?, params?)`, `ctx.panicTag(code, params?)`. `resolveDiagnostic(code, params?, locale?)` for tooling (LSP, CLI explain). i18n-ready (ICU MessageFormat-compatible templates).

**E121–E124 (#208):** emitted by the pre-codegen semantic pass (`semantics.ts`), NOT codegen — see §2. E121 unknown type, E122 undeclared identifier (incl. TDZ), E123 duplicate declaration, E124 literal/annotation kind mismatch. Boundary: fractional-value-in-int (E100), int range (E101), char string length (E102) stay in codegen.

**Runtime panics:** Static panics resolve template at compile time. Dynamic (E409/E411) use `tsc_panic(code, ...)` / `tsc_throw(code, ...)`.

### Warnings W001-W011

| Code | Detection location | Trigger |
|------|--------------------|---------|
| W001 | `dispatch.ts` `_truthyToC` | class/Array/Map/Set always truthy in boolean context |
| W002 | `dispatch.ts` `_truthyToC` | `!expr` where expr is always-truthy type (dead code) |
| W003 | `control-flow.ts` Switch handler | non-exhaustive enum switch (no default) |
| W004 | `control-flow.ts` Native handler | `native` block used |
| W005 | `control-flow.ts` Unsafe handler | `unsafe` block used |
| W006 | `async-emit.ts` `emitAsyncFunc` | direct self-call in async fn body (heap required) |
| W007 | `class.ts` struct field emission | `@struct` padding ≥4 bytes and >20% of struct (no `@packed`) |
| W008 | `assign.ts` + `vardecl.ts` + `call-dispatch.ts` | move from `const` in strict mode (non-strict → E003) |
| W009 | `decorators.ts` `emitMethod` | `mut` method on class where ALL fields are readonly |
| W010 | `concurrency.ts` Mutex.lock | `AsyncMutex.lock()` in async fn (deferred — async codegen loses type info) |
| W011 | `vardecl.ts` typed var decl | `i64`/`u64`/`f64`/`f32` on `bits < 32` platform |

**W010 note:** Async codegen promotes params to `self->m`, breaking `ctx.lookup()` type resolution. Test deferred — needs investigation of async member-call dispatch.