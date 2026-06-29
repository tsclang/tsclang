import { writeFileSync, mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"
import { lex } from "../../compiler/src/compiler/lexer.js"
import { parse } from "../../compiler/src/compiler/parser.js"
import { codegen } from "../../compiler/src/compiler/codegen.js"
import { compileTsc } from "../../compiler/src/compiler/compile.js"
import { registerAll, getBackend, getDefaultCompiler, normalizeC } from "./compilers/index.js"

registerAll()

export { normalizeC, getBackend, getDefaultCompiler }

export const platformMatrix = {
  defaultNumber: ["i8", "i16", "i32", "f64", "u8", "u16"],
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

export interface Expectation {
  toBe?: string | number
  toBeGreaterThan?: number
  toBeLessThan?: number
  toBeGreaterThanOrEqual?: number
  toBeLessThanOrEqual?: number
  toBeTruthy?: boolean
  toBeFalsy?: boolean
  toBeNull?: boolean
  toContain?: string | number
  toMatch?: string
}

export function checkExpect(actual: string, expect: Expectation): { passed: boolean, error?: string } {
  if (expect.toBe !== undefined) {
    const expected = String(expect.toBe)
    if (actual !== expected) return { passed: false, error: `expected "${expected}" but got "${actual}"` }
  }
  if (expect.toBeGreaterThan !== undefined) {
    const num = parseFloat(actual)
    if (isNaN(num) || num <= expect.toBeGreaterThan) return { passed: false, error: `expected ${actual} > ${expect.toBeGreaterThan}` }
  }
  if (expect.toBeLessThan !== undefined) {
    const num = parseFloat(actual)
    if (isNaN(num) || num >= expect.toBeLessThan) return { passed: false, error: `expected ${actual} < ${expect.toBeLessThan}` }
  }
  if (expect.toBeGreaterThanOrEqual !== undefined) {
    const num = parseFloat(actual)
    if (isNaN(num) || num < expect.toBeGreaterThanOrEqual) return { passed: false, error: `expected ${actual} >= ${expect.toBeGreaterThanOrEqual}` }
  }
  if (expect.toBeLessThanOrEqual !== undefined) {
    const num = parseFloat(actual)
    if (isNaN(num) || num > expect.toBeLessThanOrEqual) return { passed: false, error: `expected ${actual} <= ${expect.toBeLessThanOrEqual}` }
  }
  if (expect.toBeTruthy !== undefined) {
    const truthy = actual !== "" && actual !== "0" && actual !== "false"
    if (expect.toBeTruthy && !truthy) return { passed: false, error: `expected truthy but got "${actual}"` }
  }
  if (expect.toBeFalsy !== undefined) {
    const falsy = actual === "" || actual === "0" || actual === "false"
    if (expect.toBeFalsy && !falsy) return { passed: false, error: `expected falsy but got "${actual}"` }
  }
  if (expect.toBeNull !== undefined) {
    if (expect.toBeNull && actual !== "null") return { passed: false, error: `expected null but got "${actual}"` }
  }
  if (expect.toContain !== undefined) {
    const expected = String(expect.toContain)
    if (!actual.includes(expected)) return { passed: false, error: `expected "${actual}" to contain "${expected}"` }
  }
  if (expect.toMatch !== undefined) {
    const regex = new RegExp(expect.toMatch)
    if (!regex.test(actual)) return { passed: false, error: `expected "${actual}" to match ${expect.toMatch}` }
  }
  return { passed: true }
}

export interface CodegenOptions {
  defaultNumber?: string
  async?: string
  allocator?: string
  target?: string
  strict?: string[]
}

export interface TestOptions {
  input?: string
  file?: string
  expect?: Expectation
  expectError?: boolean
  expectTscError?: boolean | string
  expectCompileError?: boolean | string
  expectRuntimeError?: boolean | string
  expectC?: string
  expectCContains?: string | string[]
  expectCNotContains?: string | string[]
  options?: CodegenOptions
  compiler?: string
  timeoutMs?: number
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

export function test(name: string, options: TestOptions): void {
  const fullName = currentDescribe ? `${currentDescribe} > ${name}` : name

  // Вызвать beforeEach для всех describe в стеке
  for (const ctx of describeStack) {
    ctx.beforeEach?.()
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "tsclang-test-engine-"))
  const runtimeDir = resolve(import.meta.dirname, "../../compiler/src/runtime")

  try {
    // === Валидация input/file ===
    if (options.input && options.file) {
      results.push({ name: fullName, passed: false, error: "Cannot specify both 'input' and 'file'" })
      return
    }
    if (!options.input && !options.file) {
      results.push({ name: fullName, passed: false, error: "Must specify either 'input' or 'file'" })
      return
    }

    // === Фаза 1: TSC → C ===
    let c: string
    try {
      const codegenOpts: any = { ...options.options }
      if (codegenOpts.target === "avr") {
        codegenOpts.capabilities = { allocator: "static", async: "none", fpu: false, bits: 8, usize: "u16", defaultNumber: "i16", unaligned_access: false, os: false }
      }

      if (options.file) {
        const filePath = resolve(options.file)
        c = compileTsc(filePath, codegenOpts).c
      } else {
        const tokens = lex(options.input!, "<test>")
        const { ast, errors: parseErrors } = parse(tokens, "<test>", options.input!)
        if (parseErrors.length > 0) {
          throw { isTscErrorBag: true, errors: parseErrors }
        }
        c = codegen(ast, "<test>", options.input!, codegenOpts).c
      }
    } catch (e) {
      if (options.expectTscError) {
        const msg = e instanceof Error ? e.message : String(e)
        if (typeof options.expectTscError === "string" && !msg.includes(options.expectTscError)) {
          results.push({ name: fullName, passed: false, error: `TSC error message mismatch: expected "${options.expectTscError}" in "${msg}"` })
        } else {
          results.push({ name: fullName, passed: true })
        }
        return
      }
      if (options.expectError) {
        results.push({ name: fullName, passed: true, error: "compile error as expected" })
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ name: fullName, passed: false, error: `unexpected TSC error: ${msg}` })
      return
    }

    if (options.expectTscError) {
      results.push({ name: fullName, passed: false, error: "expected TSC error, got success" })
      return
    }
    if (options.expectError) {
      results.push({ name: fullName, passed: false, error: "expected compile error, got success" })
      return
    }

    // === Фаза 1.5: C-check ===
    if (options.expectC) {
      const normalized = normalizeC(c)
      const expected = normalizeC(options.expectC)
      if (normalized !== expected) {
        results.push({ name: fullName, passed: false, error: `C output mismatch:\nexpected:\n${expected}\nactual:\n${normalized}` })
        return
      }
    }
    if (options.expectCContains) {
      const substrings = Array.isArray(options.expectCContains) ? options.expectCContains : [options.expectCContains]
      for (const sub of substrings) {
        if (!c.includes(sub)) {
          results.push({ name: fullName, passed: false, error: `C output missing "${sub}"` })
          return
        }
      }
    }
    if (options.expectCNotContains) {
      const substrings = Array.isArray(options.expectCNotContains) ? options.expectCNotContains : [options.expectCNotContains]
      for (const sub of substrings) {
        if (c.includes(sub)) {
          results.push({ name: fullName, passed: false, error: `C output unexpectedly contains "${sub}"` })
          return
        }
      }
    }

    // === Фаза 2: C → binary ===
    const compilerName = options.compiler ?? getDefaultCompiler()
    const backend = getBackend(compilerName)
    if (!backend || !backend.isAvailable()) {
      results.push({ name: fullName, passed: false, error: `compiler "${compilerName}" not available` })
      return
    }

    const compileResult = backend.compile(c, tmpDir, { includes: [runtimeDir] })
    if (!compileResult.success) {
      if (options.expectCompileError) {
        if (typeof options.expectCompileError === "string" && !compileResult.stderr.includes(options.expectCompileError)) {
          results.push({ name: fullName, passed: false, error: `compile error message mismatch: expected "${options.expectCompileError}" in "${compileResult.stderr}"` })
        } else {
          results.push({ name: fullName, passed: true })
        }
        return
      }
      results.push({ name: fullName, passed: false, error: `unexpected compile error: ${compileResult.stderr}` })
      return
    }
    if (options.expectCompileError) {
      results.push({ name: fullName, passed: false, error: "expected compile error, got success" })
      return
    }

    // === Фаза 3: Runtime ===
    if (backend.run) {
      const timeoutMs = options.timeoutMs ?? 5000
      const runResult = backend.run(compileResult.binaryPath!, { timeoutMs })
      if (!runResult.success || runResult.exitCode !== 0) {
        if (options.expectRuntimeError) {
          if (typeof options.expectRuntimeError === "string" && !runResult.stderr.includes(options.expectRuntimeError)) {
            results.push({ name: fullName, passed: false, error: `runtime error message mismatch: expected "${options.expectRuntimeError}" in "${runResult.stderr}"` })
          } else {
            results.push({ name: fullName, passed: true })
          }
          return
        }
        results.push({ name: fullName, passed: false, error: `unexpected runtime error: exit=${runResult.exitCode} stderr=${runResult.stderr}` })
        return
      }
      if (options.expectRuntimeError) {
        results.push({ name: fullName, passed: false, error: "expected runtime error, got success" })
        return
      }

      // === Позитивная проверка stdout ===
      if (options.expect) {
        const actual = runResult.stdout.trim()
        const result = checkExpect(actual, options.expect)
        if (result.passed) {
          results.push({ name: fullName, passed: true, actual })
        } else {
          results.push({ name: fullName, passed: false, actual, error: result.error })
        }
      } else {
        results.push({ name: fullName, passed: true })
      }
    } else {
      results.push({ name: fullName, passed: true })
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    // Вызвать afterEach для всех describe в стеке
    for (const ctx of describeStack) {
      ctx.afterEach?.()
    }
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
