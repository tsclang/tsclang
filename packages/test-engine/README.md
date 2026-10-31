# TSClang Test Engine

Jest-like test engine for the TSClang compiler. Language tests compile `.tsc`
→ C → binary → run → stdout, all in one `run()` call; assertions are plain
`expect()`. The engine is the **primary testing mechanism** of the project —
language/spec suites live in `packages/tests/test/spec/`, the engine's own
self-tests live here in `test/`.

## Quick start

```bash
pnpm test:engine                                    # self-tests (any cwd)
pnpm tsx packages/test-engine/test/run.ts           # same, explicit
pnpm tsx packages/tests/test/spec/02-syntax/02-variables/run.ts   # a spec suite
pnpm tsx …/02-variables/run.ts "zero-value"         # selective: name substring
pnpm tsx …/02-variables/run.ts --json=report.json   # + machine-readable report
```

## Test API

```typescript
import { describe, test, expect, run, compile, file } from "@tsclang/test-engine"

describe("02-syntax/02-variables — var-kinds", () => {
  test("let x: i32 = 42 → prints 42", () => {
    expect(run("let x: i32 = 42\nconsole.log(x)")).toBe("42")
  })

  test("known compiler bug — red until fixed, then xpass", () => {
    expect(run("let x: i8 = 300\nconsole.log(x)")).toBe("-56")
  }, { xfail: "#208" })

  test("async callbacks work too", async () => {
    expect(run("console.log(7)")).toBe("7")
  })
})
```

- **Execution model**: `describe`/`test` only *register*; `printSummary()`
  executes everything sequentially (awaiting async callbacks) and prints
  totals. Nothing runs at import time.
- **Hooks**: `before`/`after` (per context) and `beforeEach`/`afterEach` (per
  test). `before` is lazy — fires before the context's first test; a context
  without tests never runs it. `after` fires at context exit even for empty
  contexts. A failed `before` poisons the subtree: every test in it fails with
  `beforeAll failed: <msg>`. Hooks may be async.
- **xfail** (`test(name, fn, { xfail: "#NNN" })`): known-bug marker. Totals
  split into `passed / failed / xfailed / xpassed`; a failing xfail test is not
  red, a passing one is reported as XPASS ("bug fixed? remove the marker").
  Exit code is driven by `failed` only.
- **Selective run**: `test.only(...)` runs only the `.only`-marked tests,
  `test.skip(...)` registers without running; both count as `skipped`, and no
  hooks fire for them. A name filter is a substring of the full name
  (`outer > inner > test`), taken from the CLI arg, `TSC_TEST_FILTER` env, or
  `printSummary({ filter })`. Debugging one invariant ≠ running the whole suite.

## JSON report

`--json[=path]` (or `TSC_TEST_JSON`, or `printSummary({ jsonPath })`) writes a
machine-readable report: counters (`total/passed/failed/xfailed/xpassed/
skipped`), `durationMs`, the active `filter`, per-test results and an
`environment` block (`os`, `node`, `backend`, `toolchain` — the first line of
the backend's `--version`) for reproducibility and CI trends. `runSuite(
register, opts?)` runs an isolated suite in-process and returns the `Summary`
without printing or exiting — the same primitive worker parallelism builds on
(`writeReport(summary, path)` serializes it).

## expect()

Value matchers (actual is a captured string, usually stdout):

`toBe`, `toBeGreaterThan`, `toBeLessThan` (strict numeric — non-numeric input
fails loudly), `toContain`, `toMatch(regex)`, `toBeNull`, `toBeNaN` (accepts
C printf spellings: `NaN`, `nan`, `-nan`, `nan(ind)`), `toBeCloseTo(expected,
precision = 2)` (for f32/f64 where exact printing differs), `toBeTruthy` /
`toBeFalsy` (**language** truthiness: `null`, `""`, any numeric zero, `false`,
`NaN` are falsy — everything else truthy), `toMatchC(expectedC?)` (C compare:
both sides through `normalizeC()`; without an argument — file-snapshot mode,
keyed by the test's full name in `__c-snapshots__/<file>.jsonl` next to the
calling test file; a missing entry is created, `TSC_SNAPSHOT_UPDATE=1`
rewrites — except under `CI=true`, where a missing snapshot **fails** instead
of being created: a fresh checkout must not silently pass on an empty store).
Full `not.*` for every matcher (`not.toMatchC` — inline only;
inverted file snapshots are meaningless because a first run "creates and
passes").

Function matchers: `toThrow()` (any throw), `toThrow(ErrorClass)`,
`toThrow(ErrorClass, "substring")`, `not.toThrow()`.

## run() / compile() / file()

- `run(code, opts?)` — vertical slice: `.tsc` → `compileTsc` → C via the
  backend → binary → stdout (CRLF-normalized, trimmed). `opts`: `compiler`,
  `target`, `defaultNumber`, `strict`, `timeoutMs` (binary run, default 5s),
  capability overrides (`fpu`, `bits`, `allocator`, `async`, …), and AVR knobs
  `mcu` / `freq` (model for `-mmcu=` and simavr clock in Hz — passed to both
  compile and run, they must match). The target profile also decides the C
  compile defines — `capabilityDefines()` of the profile, exactly like the CLI
  (`tsclang build`): for `target: "avr"` that means `TSC_CONSOLE_UART` etc., so
  set both `target: "avr"` and `compiler: "avr-gcc"` — without the profile the
  UART console never initializes and simavr sees no output.
- `compile(codeOrPath)` — C output only. A path is detected by the `.tsc`
  suffix and resolved **relative to the calling test file** (works under
  `pnpm --filter` cwd quirks). Inline code always goes through `compileTsc`
  (temp file) — same pipeline as `run()`.
- `file(path)` — read a fixture relative to the calling test file.

### Three-phase error model

| Class | `phase` | Origin |
|---|---|---|
| `TscCompilationError` | `tsc` | `.tsc` compilation |
| `CompileError` | `c-compile` | C compiler (backend missing/failed) |
| `RuntimeError` | `run` | binary exited non-zero / killed by timeout |

Every failure carries context: backend name, exit code, full stderr (or an
explicit `(stderr empty)` marker). Timeouts: compile 30s
(`CompileOpts.timeoutMs`), binary run 5s — a kill surfaces as `ETIMEDOUT` in
stderr, never as a silent hang or an empty message.

## Backends

`CompilerBackend` registry: `register()`, `getBackend(name)`,
`getDefaultCompiler()`, `listAvailable()`. Shipped: `gcc` and `clang`
(`gcc-like.ts`), `msvc` (real env capture via `vcvarsall.bat x64`), `avr-gcc`,
`wasm`. `isAvailable()` is honest — probing actually runs the toolchain.

**Windows note**: MSYS2/mingw gcc cannot run under a plain `spawnSync` (cc1.exe
needs the MSYS2 runtime). All gcc/clang invocations go through
`msys2Bash()` + `bash --login -c` with MSYS path conversion (`msys2.ts`).
Override the bash location with `TSC_MSYS2_BASH`.

## Layout

```
packages/test-engine/
  src/
    engine.ts          # describe/test/expect/hooks/xfail, run/compile/file,
                       #   error classes, printSummary, matrix helpers
    compilers/
      interface.ts     # CompilerBackend, CompileOpts (timeoutMs), RunOpts
      registry.ts      # backend registry
      gcc-like.ts      # gcc + clang (bash-wrapped on Windows)
      msvc.ts          # cl.exe via captured vcvarsall env
      msys2.ts         # bash wrapper: msys2Bash, toMsysPath, shQuote, bashExec
      avr-gcc.ts       # avr-gcc + simavr (via WSL on Windows)
      wasm.ts          # emcc + node
      utils.ts         # getDefaultCompiler, findMsVC, DEFAULT_COMPILE_TIMEOUT_MS
  test/                # self-tests (run.ts entry)
    run-pipeline.test.ts   # run() positive/negative, all three error phases
    engine-api.test.ts     # nesting, full names, execution order
    to-throw.test.ts       # toThrow class/substring matching
    diagnostics.test.ts    # formatFailure, no invisible failures
    file-param.test.ts     # caller-relative file()/compile(), cwd-independence
    hooks.test.ts          # beforeAll/afterAll lifecycle, poison semantics
    expect-matchers.test.ts# every matcher: positive + not + edges
    backends.test.ts       # availability, registry, msvc env parsing
    hygiene.test.ts        # no path/code confusion, compile timeouts
    async.test.ts          # collect-then-run, async hooks, hook failures
    xfail.test.ts          # xfail/xpass model
    selective-report.test.ts # filter/only/skip, runSuite, JSON report, CLI args
```

Self-test sandbox tests that deliberately fail carry `{ xfail: "#206" }` — a
green run normally shows a few `xfailed`/`xpassed`.

## Related

- Spec suites: `packages/tests/test/spec/` (the language test corpus in engine form)
- Old static corpus `packages/tests/test/cases/` — frozen, kept as a source of
  expected outputs for the spec migration (#205)
