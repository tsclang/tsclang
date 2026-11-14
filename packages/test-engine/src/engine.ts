import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync } from "fs"
import { tmpdir, release } from "os"
import { join, resolve, dirname, basename } from "path"
import { fileURLToPath } from "url"
import { compileTsc, parsePlatformDecl, capabilityDefines } from "@tsclang/compiler"
import { RUNTIME_DIR, PROFILES_DIR } from "@tsclang/shared"
import { registerAll, getBackend, getDefaultCompiler, normalizeC, toWslPath, listAvailable, msys2Bash, toMsysPath, shQuote, bashLoginArgs, bashExec } from "./compilers/index.js"
import { matrix, filterValidTypes } from "./matrix.js"

registerAll()

export { normalizeC, toWslPath, getBackend, getDefaultCompiler, listAvailable, msys2Bash, toMsysPath, shQuote, bashLoginArgs, bashExec }
export { matrix, filterValidTypes }

/** Target profile → backend able to compile AND run code for that platform.
 *  backend: null means no backend/simulator is registered for the real
 *  hardware — the profile's capability caps are still testable on a desktop
 *  compiler (C-fragment compare), but that is NOT the target platform. */
export interface TargetBackendEntry {
  target: string
  backend: string | null
  note?: string
}

const TARGET_BACKENDS: TargetBackendEntry[] = [
  { target: "desktop", backend: "gcc" },
  { target: "avr", backend: "avr-gcc" },
  { target: "avr-coop", backend: "avr-gcc" },
  { target: "avr-heap", backend: "avr-gcc" },
  { target: "wasm", backend: "wasm" },
  { target: "wasm32", backend: "wasm" },
  { target: "arm", backend: null, note: "no arm-none-eabi backend registered" },
  // #283 phase 1: android cross-compiles via the ndk-clang bundle; the
  // compile+adb run backend lands in phase 2
  { target: "android", backend: null, note: "no adb device backend yet (#283 phase 2)" },
  // #283 phase 3: ios compiles through xcrun on macOS; the ios-sim backend
  // (host-run simulator macho) lands with the macOS CI job
  { target: "ios", backend: null, note: "no ios-sim backend yet (#283 phase 3)" },
  { target: "dos", backend: null, note: "no DOS compiler/simulator backend" },
  { target: "genesis", backend: null, note: "no Genesis simulator" },
  { target: "nes", backend: null, note: "no NES simulator (caps profile testable on desktop gcc only)" },
  { target: "ps2", backend: null, note: "no PS2 simulator" },
  { target: "spectrum", backend: null, note: "no ZX Spectrum simulator (caps profile testable on desktop gcc only)" },
]

export const platformMatrix = {
  defaultNumber: ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "d8", "d16", "d32", "d64"],
  /** Full honest model: every compiler profile (packages/compiler/src/profiles/*) appears here */
  targetBackends: TARGET_BACKENDS,
  /** Runnable subset (has a real backend) — kept as a flat list for iteration convenience */
  targets: TARGET_BACKENDS.filter(t => t.backend !== null).map(t => t.target),
  strict: [[], ["safe-math"], ["no-lossy-cast"], ["safe-math", "no-lossy-cast"]],
  // Capability parameters (direct, not via profiles)
  fpu: [true, false],
  bits: [8, 16, 32, 64],
  allocator: ["heap", "static", "none"],
  async: ["libuv", "state_machine", "none"],
  usize: ["u16", "u32", "u64"],
  // C compilers (all registered backends)
  compilers: ["gcc", "clang", "msvc", "avr-gcc", "wasm"],
}

// Per-type literal value matrix lives in matrix.ts (single source of truth
// for the 02-variables suites); re-exported here for import stability.

export interface CodegenOptions {
  defaultNumber?: string
  async?: string
  allocator?: string
  target?: string
  strict?: string[]
}

export interface TestResult {
  name: string
  passed: boolean
  actual?: string
  expected?: string
  error?: string
  /** Pipeline phase the failure came from: tsc | c-compile | run */
  phase?: string
  /** Known-bug marker ('#NNN'): a failing xfail test counts as xfailed,
   *  a passing one as xpass — neither paints the run red */
  xfail?: string
  /** Set when the test was not executed (skip mode, filter, non-only) */
  skipped?: boolean
}

/** Per-test options. */
export interface TestOpts {
  /** Issue reference for a known bug; the test keeps failing without going red */
  xfail?: string
}

interface DescribeContext {
  kind: "describe"
  /** Full name including ancestors ("outer > inner"); "" for the root */
  name: string
  parent: DescribeContext | null
  /** Tests and nested contexts in registration order (interleaving preserved) */
  entries: Array<TestEntry | DescribeContext>
  beforeAll?: () => unknown
  afterAll?: () => unknown
  beforeEach?: () => unknown
  afterEach?: () => unknown
  /** Lazily set when beforeAll has run (it fires before the first test only) */
  beforeAllRan?: boolean
  /** Set when beforeAll threw — every test in the subtree fails with this */
  beforeAllError?: string
  /** Set when at least one test of this context (or subtree) actually ran —
   *  gates afterAll, so a fully filtered-out context fires no teardown */
  ranAnyTest?: boolean
}

interface TestEntry {
  kind: "test"
  name: string
  callback: () => unknown
  opts?: TestOpts
  /** Selective-run mode: "only" suppresses every other test, "skip" skips this one */
  mode?: "only" | "skip"
}

/** All mutable execution state. Swapping the active state is what makes an
 *  isolated runSuite() possible — the prerequisite for worker parallelism. */
interface EngineState {
  root: DescribeContext
  currentContext: DescribeContext
  results: TestResult[]
  /** Full name of the test being executed — set by runTest, read by the
   *  file-snapshot mode of toMatchC() to key snapshots. */
  currentTest: string | null
}

function freshState(): EngineState {
  const root: DescribeContext = { kind: "describe", name: "", parent: null, entries: [] }
  return { root, currentContext: root, results: [], currentTest: null }
}

const globalState = freshState()
let state = globalState

// === Jest-like API ===

/** Pipeline phase an engine error originates from. */
export type ErrorPhase = "tsc" | "c-compile" | "run"

export class TscCompilationError extends Error {
  readonly phase: ErrorPhase = "tsc"
  constructor(message: string) { super(message); this.name = "TscCompilationError"; }
}

export class CompileError extends Error {
  readonly phase: ErrorPhase = "c-compile"
  constructor(message: string) { super(message); this.name = "CompileError"; }
}

export class RuntimeError extends Error {
  readonly phase: ErrorPhase = "run"
  constructor(message: string) { super(message); this.name = "RuntimeError"; }
}

export interface RunOptions {
  compiler?: string
  target?: string
  defaultNumber?: string
  strict?: string[]
  timeoutMs?: number
  // Capability parameters (direct override, merged on top of profile or desktop defaults)
  fpu?: boolean
  bits?: number
  allocator?: string
  async?: string
  usize?: string
  os?: boolean
  posix?: boolean
  strtoll?: boolean
  /** AVR backend: MCU model for -mmcu= and simavr (e.g. "atmega2560") */
  mcu?: string
  /** AVR backend: simavr clock frequency in Hz (compiled and run must match) */
  freq?: string | number
}

function buildDirectCapabilities(opts?: RunOptions): Record<string, unknown> | undefined {
  if (!opts) return undefined
  const caps: Record<string, unknown> = {}
  let has = false
  if (opts.fpu !== undefined) { caps.fpu = opts.fpu; has = true }
  if (opts.bits !== undefined) { caps.bits = opts.bits; has = true }
  if (opts.allocator !== undefined) { caps.allocator = opts.allocator; has = true }
  if (opts.async !== undefined) { caps.async = opts.async; has = true }
  if (opts.usize !== undefined) { caps.usize = opts.usize; has = true }
  if (opts.os !== undefined) { caps.os = opts.os; has = true }
  if (opts.posix !== undefined) { caps.posix = opts.posix; has = true }
  if (opts.strtoll !== undefined) { caps.strtoll = opts.strtoll; has = true }
  if (opts.defaultNumber !== undefined) { caps.defaultNumber = opts.defaultNumber; has = true }
  return has ? caps : undefined
}

export function run(code: string, opts?: RunOptions): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "tsclang-run-"))
  try {
    const codegenOpts: any = { ...opts }
    const directCaps = buildDirectCapabilities(opts)
    // Load platform profile for non-desktop targets, then merge direct overrides
    if (codegenOpts.target && codegenOpts.target !== "desktop") {
      const profilesDir = resolve(import.meta.dirname, "..", "..", "compiler", PROFILES_DIR)
      const profilePath = join(profilesDir, codegenOpts.target, "index.d.tsc")
      if (existsSync(profilePath)) {
        const profileCaps = parsePlatformDecl(readFileSync(profilePath, "utf8"), profilePath)
        codegenOpts.capabilities = { ...profileCaps, ...directCaps }
      } else if (directCaps) {
        codegenOpts.capabilities = directCaps
      }
    } else if (directCaps) {
      codegenOpts.capabilities = directCaps
    }
    let c: string
    try {
      // Unified semantics: always through compileTsc (temp file) — the full
      // compiler pipeline resolves imports/aliases the raw path would skip
      const tmpFile = join(tmpDir, "test.tsc")
      writeFileSync(tmpFile, code, "utf8")
      c = compileTsc(tmpFile, codegenOpts).c
    } catch (e: any) {
      if (e?.isTscErrorBag) {
        const msgs = e.errors.map((er: any) => er.code ? `[${er.code}] ${er.message || ''}` : (er.message || String(er)))
        throw new TscCompilationError(msgs.join('; '))
      }
      const code = e?.code ? `[${e.code}] ` : ''
      throw new TscCompilationError(code + (e instanceof Error ? e.message : String(e)))
    }

    const compilerName = opts?.compiler ?? getDefaultCompiler()
    const backend = getBackend(compilerName)
    if (!backend || !backend.isAvailable()) throw new CompileError(`compiler "${compilerName}" not available`)

    const runtimeDir = resolve(import.meta.dirname, "..", "..", "compiler", RUNTIME_DIR)
    // CLI parity: the profile's capabilities decide the C defines exactly like
    // `tsclang build` does (capabilityDefines) — e.g. avr gets TSC_CONSOLE_UART
    // from its profile, so simavr's -uart0:stdio actually sees printf output
    const profileDefines = capabilityDefines(codegenOpts.capabilities)
    const compileResult = backend.compile(c, tmpDir, { includes: [runtimeDir], mcu: opts?.mcu, freq: opts?.freq, defines: profileDefines })
    if (!compileResult.success) {
      const stderr = compileResult.stderr.trim()
      throw new CompileError(`${compilerName} exited ${compileResult.exitCode}${stderr ? "\n" + stderr : " (stderr empty)"}`)
    }

    if (backend.run) {
      const runResult = backend.run(compileResult.binaryPath!, { timeoutMs: opts?.timeoutMs ?? 5000, mcu: opts?.mcu, freq: opts?.freq })
      // The backend is the authority on "ran OK": a simulator may be ended by
      // a timeout kill even after a correct firmware run (simavr), which it
      // reports as success with the captured stdout
      if (!runResult.success) {
        const stderr = runResult.stderr.trim()
        throw new RuntimeError(`exit code ${runResult.exitCode}${stderr ? "\n" + stderr : " (stderr empty)"}`)
      }
      // Normalize CRLF (Windows text-mode stdout) so expectations are platform-independent
      return runResult.stdout.replace(/\r\n/g, "\n").trim()
    }
    return ""
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

export function compile(codeOrPath: string, opts?: RunOptions): string {
  // Same target/capability resolution as run(): opts spread into codegen opts,
  // then the platform profile caps merged with direct overrides — so
  // compile(code, { target: "avr" }) produces real AVR-shaped C, not desktop.
  const codegenOpts: any = { ...opts }
  const directCaps = buildDirectCapabilities(opts)
  if (codegenOpts.target && codegenOpts.target !== "desktop") {
    const profilesDir = resolve(import.meta.dirname, "..", "..", "compiler", PROFILES_DIR)
    const profilePath = join(profilesDir, codegenOpts.target, "index.d.tsc")
    if (existsSync(profilePath)) {
      const profileCaps = parsePlatformDecl(readFileSync(profilePath, "utf8"), profilePath)
      codegenOpts.capabilities = { ...profileCaps, ...directCaps }
    } else if (directCaps) {
      codegenOpts.capabilities = directCaps
    }
  } else if (directCaps) {
    codegenOpts.capabilities = directCaps
  }
  // Explicit .tsc path (resolved from the calling test file). Only the suffix
  // identifies a path — '/'/'\\' checks false-positive on division and
  // escapes inside code strings.
  if (codeOrPath.endsWith(".tsc")) {
    return compileTsc(resolve(callerDir(), codeOrPath), codegenOpts).c
  }
  // Inline code: always through compileTsc — same pipeline as run(), so
  // imports/aliases resolve regardless of what the code text contains
  const tmpDir = mkdtempSync(join(tmpdir(), "tsclang-compile-"))
  try {
    const tmpFile = join(tmpDir, "test.tsc")
    writeFileSync(tmpFile, codeOrPath, "utf8")
    return compileTsc(tmpFile, codegenOpts).c
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

const ENGINE_PATH = fileURLToPath(import.meta.url)

/** Extract an absolute .ts path from a stack frame location, or null.
 *  Handles both ESM frames (file:///C:/...) and CJS/tsx frames (C:\...). */
function framePath(loc: string): string | null {
  let s = loc
  if (s.startsWith("file://")) {
    try {
      s = fileURLToPath(s)
    } catch {
      return null
    }
  }
  s = s.replace(/:\d+(:\d+)?$/, "")
  if (!/\.ts$/.test(s)) return null
  // must be absolute: Windows drive, UNC, or POSIX root
  if (!/^([A-Za-z]:[\\/]|\/|\\\\)/.test(s)) return null
  return s
}

/** Directory of the first stack frame outside this module — i.e. the file
 *  that called file()/compile(). Paths resolve against it, so process.cwd()
 *  (and pnpm --filter package-dir cwd) never matters. Falls back to cwd when
 *  no source frame is found (exotic transpiled callers). */
function callerDir(): string {
  const stack = new Error().stack ?? ""
  for (const rawLine of stack.split("\n")) {
    const line = rawLine.trim()
    if (!line.startsWith("at ")) continue
    // frames: "at fn (loc)" | "at fn loc" | "at loc" — loc may or may not be parenthesized
    const paren = line.match(/\(([^)]+)\)/)
    const inner = paren ? paren[1] : line.slice(3).trim()
    const p = framePath(inner)
    if (!p || p === ENGINE_PATH) continue
    return dirname(p)
  }
  return process.cwd()
}

export function file(path: string): string {
  return readFileSync(resolve(callerDir(), path), "utf8")
}

/** Matchers available when actual is a function (assert on throwing). */
export interface FunctionMatchers {
  toThrow(ErrorClass?: any, codeOrSubstring?: string): void
  not: { toThrow(): void }
}

/** Matchers available for value assertions, inverted polarity. */
export interface ValueNotMatchers {
  toBe(expected: any): void
  toBeGreaterThan(n: number): void
  toBeLessThan(n: number): void
  toContain(sub: string): void
  toMatch(regex: string): void
  /** Inline C compare only — inverted file snapshots are meaningless
   *  (a first run "creates and passes", which would read as a failure). */
  toMatchC(expected: string): void
  toBeTruthy(): void
  toBeFalsy(): void
  toBeNull(): void
  toBeCloseTo(expected: number, precision?: number): void
  toBeNaN(): void
}

/** Matchers available for value assertions. */
export interface ValueMatchers {
  toBe(expected: any): void
  toBeGreaterThan(n: number): void
  toBeLessThan(n: number): void
  toContain(sub: string): void
  toMatch(regex: string): void
  /** Compare generated C against expected C (normalizeC() on both sides).
   *  Without an argument: file-snapshot mode — the normalized C is stored
   *  under the test's full name in `__c-snapshots__/<file>.jsonl` next to
   *  the calling test file; a missing entry is created, an existing one is
   *  compared (rewrite with TSC_SNAPSHOT_UPDATE=1). */
  toMatchC(expected?: string): void
  toBeTruthy(): void
  toBeFalsy(): void
  toBeNull(): void
  toBeCloseTo(expected: number, precision?: number): void
  toBeNaN(): void
  not: ValueNotMatchers
}

/** NaN as printed by C printf: "nan", "NaN", "-nan", "nan(ind)" (MSVC). */
const NAN_OUTPUT = /^-?nan(\([a-z0-9]+\))?$/i
/** A full numeric literal (no trailing junk) — stricter than parseFloat. */
const NUMERIC_OUTPUT = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/

/** Parse stdout as a number or fail with a readable message. */
function numberOutput(s: string): number {
  const v = s.trim()
  if (!NUMERIC_OUTPUT.test(v)) throw new Error(`expected a number but got "${s}"`)
  return Number(v)
}

/** Language truthiness applied to captured stdout (spec 03-types/03-truthy-falsy.md):
 *  falsy = null, "", any numeric zero, false, NaN. Everything else is truthy. */
function isFalsyOutput(s: string): boolean {
  const v = s.trim()
  if (v === "" || v === "null" || v === "false") return true
  if (NAN_OUTPUT.test(v)) return true
  if (NUMERIC_OUTPUT.test(v)) return Number(v) === 0
  return false
}

// === toMatchC: C-snapshot matcher (#207 P1.5) ===

/** First differing line of two normalized C strings, with line number. */
function cDiff(expected: string, actual: string): string {
  const exp = expected.split("\n")
  const act = actual.split("\n")
  for (let i = 0; i < Math.max(exp.length, act.length); i++) {
    if (exp[i] !== act[i]) {
      const e = exp[i] === undefined ? "<end of C>" : `"${exp[i]}"`
      const a = act[i] === undefined ? "<end of C>" : `"${act[i]}"`
      return `C mismatch at line ${i + 1}: expected ${e} but got ${a}`
    }
  }
  return "C mismatch" // unreachable: equal strings are rejected by the caller
}

/** Inline compare: normalizeC() both sides, throw on any difference. */
function matchCInline(actual: string, expected: string): void {
  if (typeof actual !== "string" || typeof expected !== "string")
    throw new Error("toMatchC expects C code strings (compile() output vs expected C)")
  const a = normalizeC(actual)
  const e = normalizeC(expected)
  if (a !== e) throw new Error(cDiff(e, a))
}

/** Absolute path of the first stack frame outside this module — the calling
 *  test file. File-snapshot mode keys entries by test name inside a JSONL
 *  next to that file, so each test file owns its own snapshot store. */
function callerFile(): string {
  const stack = new Error().stack ?? ""
  for (const rawLine of stack.split("\n")) {
    const line = rawLine.trim()
    if (!line.startsWith("at ")) continue
    const paren = line.match(/\(([^)]+)\)/)
    const inner = paren ? paren[1] : line.slice(3).trim()
    const p = framePath(inner)
    if (!p || p === ENGINE_PATH) continue
    return p
  }
  throw new Error("toMatchC() could not locate the calling test file")
}

interface SnapshotEntry { key: string; c: string }

function readSnapshotStore(path: string): SnapshotEntry[] {
  if (!existsSync(path)) return []
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(l => l.trim() !== "")
    .map(l => JSON.parse(l) as SnapshotEntry)
}

function writeSnapshotStore(path: string, entries: SnapshotEntry[]): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, entries.map(e => JSON.stringify(e)).join("\n") + "\n", "utf8")
}

/** File-snapshot compare: key = full test name, store = JSONL next to the
 *  calling test file. Missing entry → create + pass — except under CI, where
 *  a missing snapshot fails (a fresh checkout must not silently pass on an
 *  empty store; create them locally first). TSC_SNAPSHOT_UPDATE=1 → always
 *  rewrite, even under CI. Existing entry → normalized compare. */
function matchCSnapshot(actual: string): void {
  if (typeof actual !== "string")
    throw new Error("toMatchC expects C code strings (compile() output)")
  const key = state.currentTest
  if (!key) throw new Error("toMatchC() file mode requires a running test (called outside test()?)")
  const testFile = callerFile()
  const storePath = join(dirname(testFile), "__c-snapshots__", basename(testFile).replace(/\.ts$/, "") + ".jsonl")
  const normalized = normalizeC(actual)
  const entries = readSnapshotStore(storePath)
  const stored = entries.find(e => e.key === key)
  if (!stored && !process.env.TSC_SNAPSHOT_UPDATE && process.env.CI) {
    throw new Error(
      `no snapshot stored for "${key}" and CI is set — run the suite locally once (or with TSC_SNAPSHOT_UPDATE=1) to record it`)
  }
  if (!stored || process.env.TSC_SNAPSHOT_UPDATE) {
    writeSnapshotStore(storePath, [...entries.filter(e => e.key !== key), { key, c: normalized }])
    return
  }
  if (normalizeC(stored.c) !== normalized) throw new Error(cDiff(normalizeC(stored.c), normalized))
}

export function expect(actual: (...args: any[]) => unknown): FunctionMatchers
export function expect(actual: any): ValueMatchers
export function expect(actual: any): FunctionMatchers | ValueMatchers {
  if (typeof actual === "function") {
    return {
      toThrow(ErrorClass?: any, codeOrSubstring?: string) {
        try { actual(); } catch (e) {
          const got = e instanceof Error ? e.constructor.name : typeof e
          if (ErrorClass && !(e instanceof ErrorClass)) throw new Error(`expected ${ErrorClass.name} but got ${got}`)
          if (codeOrSubstring) {
            const msg = e instanceof Error ? e.message : String(e)
            if (!msg.includes(codeOrSubstring)) throw new Error(`expected error message to contain "${codeOrSubstring}" but got "${msg}"`)
          }
          return
        }
        throw new Error("expected function to throw")
      },
      get not() {
        return {
          toThrow() {
            try { actual(); } catch { throw new Error("expected function not to throw") }
          }
        }
      }
    }
  }
  const s = String(actual)
  return {
    toBe(expected: any) { if (s !== String(expected)) throw new Error(`expected "${String(expected)}" but got "${s}"`) },
    toBeGreaterThan(n: number) { if (numberOutput(s) <= n) throw new Error(`expected ${s} > ${n}`) },
    toBeLessThan(n: number) { if (numberOutput(s) >= n) throw new Error(`expected ${s} < ${n}`) },
    toContain(sub: string) { if (!s.includes(sub)) throw new Error(`expected "${s}" to contain "${sub}"`) },
    toMatch(regex: string) { if (!new RegExp(regex).test(s)) throw new Error(`expected "${s}" to match ${regex}`) },
    toBeTruthy() { if (isFalsyOutput(s)) throw new Error(`expected truthy but got "${s}"`) },
    toBeFalsy() { if (!isFalsyOutput(s)) throw new Error(`expected falsy but got "${s}"`) },
    toBeNull() { if (s !== "null") throw new Error(`expected null but got "${s}"`) },
    toBeNaN() { if (!NAN_OUTPUT.test(s.trim())) throw new Error(`expected NaN but got "${s}"`) },
    toMatchC(expected?: string) {
      if (expected === undefined) matchCSnapshot(actual)
      else matchCInline(actual, expected)
    },
    toBeCloseTo(expected: number, precision = 2) {
      const actualNum = numberOutput(s)
      if (Math.abs(actualNum - expected) >= Math.pow(10, -precision) / 2)
        throw new Error(`expected "${s}" to be close to ${expected} (precision ${precision})`)
    },
    get not() {
      return {
        toBe(expected: any) { if (s === String(expected)) throw new Error(`expected "${s}" not to be "${String(expected)}"`) },
        toBeGreaterThan(n: number) { if (numberOutput(s) > n) throw new Error(`expected ${s} not to be greater than ${n}`) },
        toBeLessThan(n: number) { if (numberOutput(s) < n) throw new Error(`expected ${s} not to be less than ${n}`) },
        toContain(sub: string) { if (s.includes(sub)) throw new Error(`expected "${s}" not to contain "${sub}"`) },
        toMatch(regex: string) { if (new RegExp(regex).test(s)) throw new Error(`expected "${s}" not to match ${regex}`) },
        toBeTruthy() { if (!isFalsyOutput(s)) throw new Error(`expected falsy but got "${s}"`) },
        toBeFalsy() { if (isFalsyOutput(s)) throw new Error(`expected truthy but got "${s}"`) },
        toBeNull() { if (s === "null") throw new Error(`expected "${s}" not to be "null"`) },
        toBeNaN() { if (NAN_OUTPUT.test(s.trim())) throw new Error(`expected "${s}" not to be NaN`) },
        toMatchC(expected?: string) {
          if (expected === undefined)
            throw new Error("not.toMatchC requires an inline C argument (inverted file snapshots are meaningless)")
          const a = normalizeC(String(actual))
          const e = normalizeC(expected)
          if (a === e) throw new Error("expected C to differ from the given snapshot but both are identical")
        },
        toBeCloseTo(expected: number, precision = 2) {
          const actualNum = numberOutput(s)
          if (Math.abs(actualNum - expected) < Math.pow(10, -precision) / 2)
            throw new Error(`expected "${s}" not to be close to ${expected} (precision ${precision})`)
        }
      }
    }
  }
}

/** Registration only — nothing executes until printSummary()/runSuite() runs the tree. */
export function describe(name: string, fn: () => void): void {
  const ctx: DescribeContext = {
    kind: "describe",
    name: state.currentContext.name ? `${state.currentContext.name} > ${name}` : name,
    parent: state.currentContext,
    entries: [],
  }
  state.currentContext.entries.push(ctx)
  const prev = state.currentContext
  state.currentContext = ctx
  try {
    fn()
  } finally {
    state.currentContext = prev
  }
}

export function before(fn: () => unknown): void {
  if (state.currentContext !== state.root) state.currentContext.beforeAll = fn
}

export function after(fn: () => unknown): void {
  if (state.currentContext !== state.root) state.currentContext.afterAll = fn
}

export function beforeEach(fn: () => unknown): void {
  if (state.currentContext !== state.root) state.currentContext.beforeEach = fn
}

export function afterEach(fn: () => unknown): void {
  if (state.currentContext !== state.root) state.currentContext.afterEach = fn
}

/** test() with the selective-run modifiers attached (test.only / test.skip). */
export interface TestFn {
  (name: string, callback: () => unknown, opts?: TestOpts): void
  /** Run only the tests marked .only — everything else counts as skipped */
  only(name: string, callback: () => unknown, opts?: TestOpts): void
  /** Register without running: the test counts as skipped */
  skip(name: string, callback: () => unknown, opts?: TestOpts): void
}

export const test: TestFn = ((name: string, callback: () => unknown, opts?: TestOpts) => {
  state.currentContext.entries.push({ kind: "test", name, callback, opts })
}) as TestFn

test.only = (name: string, callback: () => unknown, opts?: TestOpts) => {
  state.currentContext.entries.push({ kind: "test", name, callback, opts, mode: "only" })
}

test.skip = (name: string, callback: () => unknown, opts?: TestOpts) => {
  state.currentContext.entries.push({ kind: "test", name, callback, opts, mode: "skip" })
}

/** Does the tree contain at least one test.only? (Enables only-mode globally.) */
function hasOnly(ctx: DescribeContext): boolean {
  for (const e of ctx.entries) {
    if (e.kind === "test" && e.mode === "only") return true
    if (e.kind === "describe" && hasOnly(e)) return true
  }
  return false
}

/** Context chain root→ctx; the root is excluded (it carries no hooks). */
function chainOf(st: EngineState, ctx: DescribeContext): DescribeContext[] {
  const chain: DescribeContext[] = []
  for (let c = ctx; c !== st.root; c = c.parent!) chain.unshift(c)
  return chain
}

/** Synthetic hook-failure results inherit the test's xfail marker — the
 *  marker covers the test's whole lifecycle, cleanup included. */
async function runAfterEach(st: EngineState, chain: DescribeContext[], fullName: string, xfail?: string): Promise<void> {
  for (const c of chain) {
    try {
      await c.afterEach?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      st.results.push({ name: `${fullName} > afterEach`, passed: false, error: `afterEach failed: ${msg}`, xfail })
    }
  }
}

async function runTest(st: EngineState, entry: TestEntry, ctx: DescribeContext): Promise<void> {
  const fullName = ctx === st.root ? entry.name : `${ctx.name} > ${entry.name}`
  const xfail = entry.opts?.xfail
  const chain = chainOf(st, ctx)

  // Lazy beforeAll: fire once per context, right before its first test
  for (const c of chain) {
    if (c.beforeAll && !c.beforeAllRan) {
      c.beforeAllRan = true
      try {
        await c.beforeAll()
      } catch (e) {
        c.beforeAllError = e instanceof Error ? e.message : String(e)
      }
    }
  }
  // A failed beforeAll poisons the subtree: tests fail with the setup error,
  // callbacks and per-test hooks are skipped
  const brokenSetup = chain.find(c => c.beforeAllError !== undefined)
  if (brokenSetup) {
    st.results.push({ name: fullName, passed: false, error: `beforeAll failed: ${brokenSetup.beforeAllError}`, xfail })
    return
  }

  for (const c of chain) {
    try {
      await c.beforeEach?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      st.results.push({ name: fullName, passed: false, error: `beforeEach failed: ${msg}`, xfail })
      await runAfterEach(st, chain, fullName, xfail)
      return
    }
  }

  try {
    state.currentTest = fullName
    await entry.callback()
    st.results.push({ name: fullName, passed: true, xfail })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    const phase = err instanceof TscCompilationError || err instanceof CompileError || err instanceof RuntimeError
      ? err.phase
      : undefined
    st.results.push({ name: fullName, passed: false, error: err.message, phase, xfail })
  } finally {
    state.currentTest = null
    await runAfterEach(st, chain, fullName, xfail)
  }
}

/** Does the subtree contain at least one registered test entry? */
function subtreeHasTests(ctx: DescribeContext): boolean {
  for (const e of ctx.entries) {
    if (e.kind === "test" || (e.kind === "describe" && subtreeHasTests(e))) return true
  }
  return false
}

/** Execute one context: entries in registration order, afterAll at exit.
 *  Tests eliminated by skip/only/filter stay in the results as skipped —
 *  no hooks fire for them. afterAll fires unless the subtree HAD tests but
 *  none of them ran (jest parity: an empty describe still fires afterAll). */
async function runContext(st: EngineState, ctx: DescribeContext, filter: string | undefined, onlyMode: boolean): Promise<void> {
  for (const entry of ctx.entries) {
    if (entry.kind === "describe") {
      await runContext(st, entry, filter, onlyMode)
      if (entry.ranAnyTest) ctx.ranAnyTest = true
      continue
    }
    const fullName = ctx === st.root ? entry.name : `${ctx.name} > ${entry.name}`
    const matches = filter === undefined || fullName.includes(filter)
    const runnable = entry.mode !== "skip" && matches && (!onlyMode || entry.mode === "only")
    if (!runnable) {
      st.results.push({ name: fullName, passed: false, skipped: true })
      continue
    }
    ctx.ranAnyTest = true
    await runTest(st, entry, ctx)
  }
  // afterAll fires at context exit — for an empty describe too (jest parity),
  // but not when the subtree had tests and every one of them was skipped
  if (ctx !== st.root && ctx.afterAll && (ctx.ranAnyTest || !subtreeHasTests(ctx))) {
    try {
      await ctx.afterAll()
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      st.results.push({ name: `${ctx.name} > afterAll`, passed: false, error: err.message })
    }
  }
}

export function getResults(): TestResult[] {
  return globalState.results
}

export function reset(): void {
  const fresh = freshState()
  globalState.root = fresh.root
  globalState.currentContext = fresh.root
  globalState.results = fresh.results
  if (state === globalState) state.currentContext = fresh.root
}

/** Toolchain/environment block of a report — reproducibility and CI trends. */
export interface SummaryEnvironment {
  os: string
  node: string
  /** Name of the default compiler backend ("gcc", ...) */
  backend: string
  /** First line of the toolchain's --version, "" when not reportable */
  toolchain: string
}

/** Machine-readable run outcome. */
export interface Summary {
  total: number
  passed: number
  failed: number
  xfailed: number
  xpassed: number
  skipped: number
  durationMs: number
  /** Active name filter, when one was applied */
  filter?: string
  environment: SummaryEnvironment
  results: TestResult[]
}

function environmentInfo(): SummaryEnvironment {
  let toolchain = ""
  try {
    const backend = getBackend(getDefaultCompiler())
    toolchain = backend?.version?.() ?? ""
  } catch {
    // A version probe must never break a test run
  }
  return {
    os: `${process.platform} ${release()}`,
    node: process.version,
    backend: getDefaultCompiler(),
    toolchain,
  }
}

export interface ExecuteOpts {
  /** Substring of the test's full name; non-matching tests count as skipped */
  filter?: string
}

/** Execute a state's tree and build the Summary (no printing, no exit). */
async function execute(st: EngineState, opts?: ExecuteOpts): Promise<Summary> {
  const started = Date.now()
  const onlyMode = hasOnly(st.root)
  await runContext(st, st.root, opts?.filter, onlyMode)
  const plain = st.results.filter(r => !r.xfail && !r.skipped)
  return {
    total: st.results.length,
    passed: plain.filter(r => r.passed).length,
    failed: plain.filter(r => !r.passed).length,
    xfailed: st.results.filter(r => r.xfail && !r.passed && !r.skipped).length,
    xpassed: st.results.filter(r => r.xfail && r.passed).length,
    skipped: st.results.filter(r => r.skipped).length,
    durationMs: Date.now() - started,
    filter: opts?.filter,
    environment: environmentInfo(),
    results: st.results,
  }
}

export interface RunSuiteOpts extends ExecuteOpts {}

/** Register and execute an isolated suite: the global tree/results stay
 *  untouched (this is also what makes worker-based parallelism possible).
 *  Returns the Summary instead of printing or exiting. */
export async function runSuite(register: () => void, opts?: RunSuiteOpts): Promise<Summary> {
  const prev = state
  state = freshState()
  try {
    register()
    return await execute(state, opts)
  } finally {
    state = prev
  }
}

/** Write the machine-readable JSON report. */
export function writeReport(summary: Summary, path: string): void {
  writeFileSync(path, JSON.stringify(summary, null, 2) + "\n", "utf8")
}

export interface CliOptions {
  filter?: string
  jsonPath?: string
}

/** Parse runner CLI args: a bare word is a name filter,
 *  --json[=path] requests a JSON report (default test-report.json). */
export function resolveCliArgs(argv: string[]): CliOptions {
  const out: CliOptions = {}
  for (const arg of argv) {
    if (arg === "--json") out.jsonPath = "test-report.json"
    else if (arg.startsWith("--json=")) out.jsonPath = arg.slice("--json=".length)
    else if (!arg.startsWith("--") && out.filter === undefined) out.filter = arg
  }
  return out
}

/** Format one failure block for the summary. Every failure must show a reason:
 *  empty messages surface as "(no message)", engine phases as "[phase]" prefix,
 *  multi-line stderr stays indented instead of gluing into the first line. */
export function formatFailure(r: TestResult): string {
  const phase = r.phase ? `[${r.phase}] ` : ""
  const msg = r.error && r.error.trim().length > 0 ? r.error : "(no message)"
  const indented = msg.split("\n").map((l, i) => i === 0 ? l : "    " + l).join("\n")
  return `  ✗ ${r.name}\n    error:    ${phase}${indented}`
}

export interface SummaryOpts {
  filter?: string
  jsonPath?: string
}

/** Execute all registered tests (awaiting async callbacks), then print totals.
 *  Fire-and-forget calls keep the process alive until the run completes.
 *  xfail-marked tests are excluded from passed/failed: they count as xfailed
 *  (still broken, expected) or xpass (bug apparently fixed — remove marker).
 *  Selective run and JSON report are controlled by options, CLI args
 *  (`run.ts <name-substring> [--json[=path]]`) or env (TSC_TEST_FILTER /
 *  TSC_TEST_JSON) — options win, then CLI, then env. */
export async function printSummary(opts?: SummaryOpts): Promise<void> {
  const cli = resolveCliArgs(process.argv.slice(2))
  const filter = opts?.filter ?? cli.filter ?? process.env.TSC_TEST_FILTER
  const jsonPath = opts?.jsonPath ?? cli.jsonPath ?? (process.env.TSC_TEST_JSON || undefined)

  const s = await execute(globalState, { filter })
  if (jsonPath) writeReport(s, jsonPath)

  const parts = [`${s.passed} passed`, `${s.failed} failed`]
  if (s.xfailed > 0) parts.push(`${s.xfailed} xfailed`)
  if (s.xpassed > 0) parts.push(`${s.xpassed} xpassed`)
  if (s.skipped > 0) parts.push(`${s.skipped} skipped`)
  const filterNote = filter ? ` (filter: ${filter})` : ""
  console.log(`\n${parts.join(", ")}, ${s.total} total${filterNote}`)
  if (jsonPath) console.log(`JSON report: ${jsonPath}`)

  const plain = s.results.filter(r => !r.xfail && !r.skipped)
  if (s.failed > 0) {
    console.log("\nFailures:")
    for (const r of plain.filter(x => !x.passed)) console.log(formatFailure(r))
  }
  if (s.xpassed > 0) {
    console.log("\nXPASS (xfail no longer reproducible — bug fixed? remove the marker):")
    for (const r of s.results.filter(x => x.xfail && x.passed)) {
      console.log(`  ✓ ${r.name} (xfail: ${r.xfail})`)
    }
  }
  process.exit(s.failed > 0 ? 1 : 0)
}
