import { writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"
import { lex, parse, codegen, compileTsc, parsePlatformDecl } from "@tsclang/compiler"
import { RUNTIME_DIR, PROFILES_DIR } from "@tsclang/shared"
import { registerAll, getBackend, getDefaultCompiler, normalizeC, toWslPath } from "./compilers/index.js"

registerAll()

export { normalizeC, toWslPath, getBackend, getDefaultCompiler }

export const platformMatrix = {
  defaultNumber: ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "d8", "d16", "d32", "d64"],
  targets: ["desktop", "avr", "nes", "spectrum"],
  strict: [[], ["safe-math"], ["no-lossy-cast"], ["safe-math", "no-lossy-cast"]]
}

export const matrix = {
  i8: {
    type: "i8",
    min: -128,
    max: 127,
    values: [0, 1, -128, 127, -129, 128],
    validValues: [0, 1, -128, 127],
    invalidRange: [-129, 128], invalidValues: [true, "hello"]
  },
  i16: {
    type: "i16",
    min: -32768,
    max: 32767,
    values: [0, 1, -32768, 32767, -32769, 32768],
    validValues: [0, 1, -32768, 32767],
    invalidRange: [-32769, 32768], invalidValues: [true, "hello"]
  },
  i32: {
    type: "i32",
    min: -2147483648,
    max: 2147483647,
    values: [0, 1, -2147483648, 2147483647, -2147483649, 2147483648],
    validValues: [0, 1, -2147483648, 2147483647],
    invalidRange: [-2147483649, 2147483648], invalidValues: [true, "hello"]
  },
  i64: {
    type: "i64",
    min: Number.MIN_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
    values: [0, 1, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    validValues: [0, 1, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    invalidValues: [true, "hello"]
  },
  u8: {
    type: "u8",
    min: 0,
    max: 255,
    values: [0, 1, 255, 256, -1],
    validValues: [0, 1, 255],
    invalidRange: [256, -1], invalidValues: [true, "hello"]
  },
  u16: {
    type: "u16",
    min: 0,
    max: 65535,
    values: [0, 1, 65535, 65536, -1],
    validValues: [0, 1, 65535],
    invalidRange: [65536, -1], invalidValues: [true, "hello"]
  },
  u32: {
    type: "u32",
    min: 0,
    max: 4294967295,
    values: [0, 1, 4294967295, 4294967296, -1],
    validValues: [0, 1, 4294967295],
    invalidRange: [4294967296, -1], invalidValues: [true, "hello"]
  },
  u64: {
    type: "u64",
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    values: [0, 1, Number.MAX_SAFE_INTEGER],
    validValues: [0, 1, Number.MAX_SAFE_INTEGER],
    invalidValues: [true, "hello"]
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
}

interface DescribeContext {
  name: string
  beforeAll?: () => void
  afterAll?: () => void
  beforeEach?: () => void
  afterEach?: () => void
}

let results: TestResult[] = []
let currentDescribe = ""

// === Jest-like API ===

export class TscCompilationError extends Error {
  constructor(message: string) { super(message); this.name = "TscCompilationError"; }
}

export class CompileError extends Error {
  constructor(message: string) { super(message); this.name = "CompileError"; }
}

export class RuntimeError extends Error {
  constructor(message: string) { super(message); this.name = "RuntimeError"; }
}

export interface RunOptions {
  compiler?: string
  target?: string
  defaultNumber?: string
  strict?: string[]
  timeoutMs?: number
}

export function run(code: string, opts?: RunOptions): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "tsclang-run-"))
  try {
    const codegenOpts: any = { ...opts }
    // Load platform profile for non-desktop targets
    if (codegenOpts.target && codegenOpts.target !== "desktop") {
      const profilesDir = resolve(import.meta.dirname, "..", "..", "compiler", PROFILES_DIR)
      const profilePath = join(profilesDir, codegenOpts.target, "index.d.tsc")
      if (existsSync(profilePath)) {
        codegenOpts.capabilities = parsePlatformDecl(readFileSync(profilePath, "utf8"), profilePath)
      }
    }
    let c: string
    try {
      if (code.includes("import ")) {
        const tmpFile = join(tmpDir, "test.tsc")
        writeFileSync(tmpFile, code, "utf8")
        c = compileTsc(tmpFile, codegenOpts).c
      } else {
        const tokens = lex(code, "<run>")
        const { ast, errors } = parse(tokens, "<run>", code)
        if (errors.length > 0) throw { isTscErrorBag: true, errors }
        c = codegen(ast, "<run>", code, codegenOpts).c
      }
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
    if (!compileResult.success) throw new CompileError(compileResult.stderr)

    if (backend.run) {
      const runResult = backend.run(compileResult.binaryPath!, { timeoutMs: opts?.timeoutMs ?? 5000 })
      if (!runResult.success || runResult.exitCode !== 0) throw new RuntimeError(runResult.stderr || `exit code ${runResult.exitCode}`)
      return runResult.stdout.trim()
    }
    return ""
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

export function compile(codeOrPath: string): string {
  const codegenOpts: any = {}
  // Check if input is a file path
  const isFilePath = codeOrPath.endsWith('.tsc') || codeOrPath.includes('/') || codeOrPath.includes('\\')
  if (isFilePath) {
    const filePath = resolve(codeOrPath)
    return compileTsc(filePath, codegenOpts).c
  }
  // Otherwise treat as inline code
  if (codeOrPath.includes("import ")) {
    const tmpDir = mkdtempSync(join(tmpdir(), "tsclang-compile-"))
    try {
      const tmpFile = join(tmpDir, "test.tsc")
      writeFileSync(tmpFile, codeOrPath, "utf8")
      return compileTsc(tmpFile, codegenOpts).c
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  }
  const tokens = lex(codeOrPath, "<compile>")
  const { ast, errors } = parse(tokens, "<compile>", codeOrPath)
  if (errors.length > 0) throw new TscCompilationError(errors[0].message)
  return codegen(ast, "<compile>", codeOrPath, codegenOpts).c
}

export function file(path: string): string {
  return require("fs").readFileSync(resolve(path), "utf8")
}

export function expect(actual: any) {
  if (typeof actual === "function") {
    return {
      toThrow(ErrorClass?: any, codeOrSubstring?: string) {
        try { actual(); } catch (e) {
          if (ErrorClass && !(e instanceof ErrorClass)) throw new Error(`expected ${ErrorClass.name} but got ${e.constructor.name}`)
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
    toBeGreaterThan(n: number) { if (parseFloat(s) <= n) throw new Error(`expected ${s} > ${n}`) },
    toBeLessThan(n: number) { if (parseFloat(s) >= n) throw new Error(`expected ${s} < ${n}`) },
    toContain(sub: string) { if (!s.includes(sub)) throw new Error(`expected "${s}" to contain "${sub}"`) },
    toMatch(regex: string) { if (!new RegExp(regex).test(s)) throw new Error(`expected "${s}" to match ${regex}`) },
    toBeTruthy() { if (!s || s === "0" || s === "false") throw new Error(`expected truthy but got "${s}"`) },
    toBeFalsy() { if (s && s !== "0" && s !== "false") throw new Error(`expected falsy but got "${s}"`) },
    toBeNull() { if (s !== "null") throw new Error(`expected null but got "${s}"`) },
    get not() {
      const self = this
      return {
        toContain(sub: string) { if (s.includes(sub)) throw new Error(`expected "${s}" not to contain "${sub}"`) },
        toThrow() { /* handled above */ }
      }
    }
  }
}

let describeStack: DescribeContext[] = []

export function describe(name: string, fn: () => void): void {
  const prev = currentDescribe
  currentDescribe = prev ? `${prev} > ${name}` : name
  const ctx: DescribeContext = { name }
  describeStack.push(ctx)
  fn()
  describeStack.pop()
  currentDescribe = prev
}

export function before(fn: () => void): void {
  const ctx = describeStack[describeStack.length - 1]
  if (ctx) ctx.beforeAll = fn
}

export function after(fn: () => void): void {
  const ctx = describeStack[describeStack.length - 1]
  if (ctx) ctx.afterAll = fn
}

export function beforeEach(fn: () => void): void {
  const ctx = describeStack[describeStack.length - 1]
  if (ctx) ctx.beforeEach = fn
}

export function afterEach(fn: () => void): void {
  const ctx = describeStack[describeStack.length - 1]
  if (ctx) ctx.afterEach = fn
}

export function test(name: string, callback: () => void): void {
  const fullName = currentDescribe ? `${currentDescribe} > ${name}` : name

  // Вызвать beforeEach для всех describe в стеке
  for (const ctx of describeStack) { ctx.beforeEach?.() }

  try {
    callback()
    results.push({ name: fullName, passed: true })
  } catch (e) {
    results.push({ name: fullName, passed: false, error: e instanceof Error ? e.message : String(e) })
  } finally {
    for (const ctx of describeStack) { ctx.afterEach?.() }
  }
}

export function getResults(): TestResult[] {
  return results
}

export function reset(): void {
  results = []
}

export function printSummary(): void {
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`\n${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log("\nFailures:")
    for (const r of results.filter(x => !x.passed)) {
      console.log(`  ✗ ${r.name}`)
      if (r.expected !== undefined) console.log(`    expected: ${r.expected}`)
      if (r.actual !== undefined) console.log(`    actual:   ${r.actual}`)
      if (r.error) console.log(`    error:    ${r.error}`)
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}
