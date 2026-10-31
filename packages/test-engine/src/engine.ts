import { writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from "fs"
import { tmpdir, release } from "os"
import { join, resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { compileTsc, parsePlatformDecl } from "@tsclang/compiler"
import { RUNTIME_DIR, PROFILES_DIR } from "@tsclang/shared"
import { registerAll, getBackend, getDefaultCompiler, normalizeC, toWslPath, listAvailable, msys2Bash, toMsysPath, shQuote, bashLoginArgs, bashExec } from "./compilers/index.js"

registerAll()

export { normalizeC, toWslPath, getBackend, getDefaultCompiler, listAvailable, msys2Bash, toMsysPath, shQuote, bashLoginArgs, bashExec }

export const platformMatrix = {
  defaultNumber: ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "d8", "d16", "d32", "d64"],
  targets: ["desktop", "avr", "nes", "spectrum"],
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

const ALL_NUMERIC_TYPES = ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "d8", "d16", "d32", "d64"]

export function filterValidTypes(caps: { fpu?: boolean; bits?: number }): string[] {
  let types = [...ALL_NUMERIC_TYPES]
  if (caps.fpu === false) {
    types = types.filter(t => t !== "f32" && t !== "f64")
  }
  if (caps.bits !== undefined && caps.bits < 64) {
    types = types.filter(t => t !== "i64" && t !== "u64" && t !== "d64")
  }
  if (caps.bits !== undefined && caps.bits < 32) {
    types = types.filter(t => t !== "i32" && t !== "u32" && t !== "d32")
  }
  return types
}

export const matrix = {
  i8: {
    type: "i8",
    min: -128,
    max: 127,
    values: [0, 1, -128, 127, -129, 128],
    validValues: [0, 1, -128, 127],
    invalidRange: [-129, 128], invalidValues: [true, "hello"],
    altLiterals: [["0x0F", "15"], ["0b1001", "9"], ["0o17", "15"], ["0x7F", "127"]]
  },
  i16: {
    type: "i16",
    min: -32768,
    max: 32767,
    values: [0, 1, -32768, 32767, -32769, 32768],
    validValues: [0, 1, -32768, 32767],
    invalidRange: [-32769, 32768], invalidValues: [true, "hello"],
    altLiterals: [["0x0F", "15"], ["0b1001", "9"], ["0o17", "15"], ["0x7FFF", "32767"]]
  },
  i32: {
    type: "i32",
    min: -2147483648,
    max: 2147483647,
    values: [0, 1, -2147483648, 2147483647, -2147483649, 2147483648],
    validValues: [0, 1, -2147483648, 2147483647],
    invalidRange: [-2147483649, 2147483648], invalidValues: [true, "hello"],
    altLiterals: [["0x0F", "15"], ["0b1001", "9"], ["0o17", "15"], ["0x7FFFFFFF", "2147483647"]]
  },
  i64: {
    type: "i64",
    min: Number.MIN_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
    values: [0, 1, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    validValues: [0, 1, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    invalidValues: [true, "hello"],
    altLiterals: [["0x0F", "15"], ["0b1001", "9"], ["0o17", "15"], ["0xFFFFFFFFFFFFF", "4503599627370495"]]
  },
  u8: {
    type: "u8",
    min: 0,
    max: 255,
    values: [0, 1, 255, 256, -1],
    validValues: [0, 1, 255],
    invalidRange: [256, -1], invalidValues: [true, "hello"],
    altLiterals: [["0xFF", "255"], ["0b11111111", "255"], ["0o377", "255"], ["0x0A", "10"]]
  },
  u16: {
    type: "u16",
    min: 0,
    max: 65535,
    values: [0, 1, 65535, 65536, -1],
    validValues: [0, 1, 65535],
    invalidRange: [65536, -1], invalidValues: [true, "hello"],
    altLiterals: [["0xFFFF", "65535"], ["0b1000000000000000", "32768"], ["0o177777", "65535"], ["0x0A", "10"]]
  },
  u32: {
    type: "u32",
    min: 0,
    max: 4294967295,
    values: [0, 1, 4294967295, 4294967296, -1],
    validValues: [0, 1, 4294967295],
    invalidRange: [4294967296, -1], invalidValues: [true, "hello"],
    altLiterals: [["0xFFFFFFFF", "4294967295"], ["0b10000000000000000000000000000000", "2147483648"], ["0o37777777777", "4294967295"]]
  },
  u64: {
    type: "u64",
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    values: [0, 1, Number.MAX_SAFE_INTEGER],
    validValues: [0, 1, Number.MAX_SAFE_INTEGER],
    invalidValues: [true, "hello"],
    altLiterals: [["0xFFFFFFFFFFFFF", "4503599627370495"], ["0b1001", "9"], ["0o17", "15"]]
  },
  d8: {
    type: "d8",
    min: -1.27,
    max: 1.27,
    values: [0, 0.01, 0.5, 1.27, -1.27, 1.28, -1.29],
    validValues: [0, 0.01, 0.5, 1.27, -1.27],
    invalidRange: [1.28, -1.29], invalidValues: [true, "hello"]
  },
  d16: {
    type: "d16",
    min: -327.67,
    max: 327.67,
    values: [0, 0.01, 1.5, 327.67, -327.67, 327.68, -327.69],
    validValues: [0, 0.01, 1.5, 327.67, -327.67],
    invalidRange: [327.68, -327.69], invalidValues: [true, "hello"]
  },
  d32: {
    type: "d32",
    min: -214748.3647,
    max: 214748.3647,
    values: [0, 0.0001, 1.5, 3.14, 214748.3647, -214748.3647, 214748.3648],
    validValues: [0, 0.0001, 1.5, 3.14, 214748.3647, -214748.3647],
    invalidRange: [214748.3648], invalidValues: [true, "hello"]
  },
  d64: {
    type: "d64",
    min: -92233720368.54775808,
    max: 92233720368.54775807,
    values: [0, 0.1, 1.5, 3.14],
    validValues: [0, 0.1, 1.5, 3.14],
    invalidValues: [true, "hello"]
  },
  f32: {
    type: "f32",
    min: -3.4028235e+38,
    max: 3.4028235e+38,
    values: [0.0, 1.0, 3.4028235e+38, -3.4028235e+38, Infinity, -Infinity, NaN],
    validValues: [0.0, 1.0, 3.4028235e+38, -3.4028235e+38, Infinity, -Infinity, NaN],
    invalidValues: [true, "hello"]
  },
  f64: {
    type: "f64",
    min: -1.7976931348623157e+308,
    max: 1.7976931348623157e+308,
    values: [0.0, 1.0, 1.7976931348623157e+308, -1.7976931348623157e+308, Infinity, -Infinity, NaN],
    validValues: [0.0, 1.0, 1.7976931348623157e+308, -1.7976931348623157e+308, Infinity, -Infinity, NaN],
    invalidValues: [true, "hello"]
  },
  number: {
    type: "number",
    min: -1.7976931348623157e+308,
    max: 1.7976931348623157e+308,
    values: [0, 1, 3.14],
    validValues: [0, 1, 3.14],
    invalidValues: [true, "hello"]
  },
  boolean: {
    type: "boolean",
    values: [true, false],
    validValues: [true, false],
    invalidValues: [42, "hello"]
  },
  string: {
    type: "string",
    values: ["", "hello"],
    validValues: ["", "hello"],
    invalidValues: [42, true]
  },
  char: {
    type: "char",
    min: 0,
    max: 255,
    values: [0, 65, 255, 256],
    validValues: [0, 65, 255],
    invalidValues: [256, true, "hello"]
  },
  usize: {
    type: "usize",
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    values: [0, 1],
    validValues: [0, 1],
    invalidValues: [true, "hello"]
  },
  isize: {
    type: "isize",
    min: Number.MIN_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
    values: [0, 1],
    validValues: [0, 1],
    invalidValues: [true, "hello"]
  }
}

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
}

function freshState(): EngineState {
  const root: DescribeContext = { kind: "describe", name: "", parent: null, entries: [] }
  return { root, currentContext: root, results: [] }
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
    const compileResult = backend.compile(c, tmpDir, { includes: [runtimeDir] })
    if (!compileResult.success) {
      const stderr = compileResult.stderr.trim()
      throw new CompileError(`${compilerName} exited ${compileResult.exitCode}${stderr ? "\n" + stderr : " (stderr empty)"}`)
    }

    if (backend.run) {
      const runResult = backend.run(compileResult.binaryPath!, { timeoutMs: opts?.timeoutMs ?? 5000 })
      if (!runResult.success || runResult.exitCode !== 0) {
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

export function compile(codeOrPath: string): string {
  const codegenOpts: any = {}
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
    await entry.callback()
    st.results.push({ name: fullName, passed: true, xfail })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    const phase = err instanceof TscCompilationError || err instanceof CompileError || err instanceof RuntimeError
      ? err.phase
      : undefined
    st.results.push({ name: fullName, passed: false, error: err.message, phase, xfail })
  } finally {
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
