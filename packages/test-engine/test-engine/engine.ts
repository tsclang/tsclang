import { writeFileSync, mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { spawnSync } from "child_process"
import { lex } from "../../compiler/src/compiler/lexer.js"
import { parse } from "../../compiler/src/compiler/parser.js"
import { codegen } from "../../compiler/src/compiler/codegen.js"

export const platformMatrix = {
  defaultNumber: ["i8", "i16", "i32", "f64", "u8", "u16"]
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

export interface EqExpectation {
  kind: "eq"
  value: string | number
}

export function eq(value: string | number): EqExpectation {
  return { kind: "eq", value }
}

export interface CodegenOptions {
  defaultNumber?: string
  async?: string
  allocator?: string
}

export interface TestOptions {
  input: string
  expect?: EqExpectation
  expectError?: boolean
  options?: CodegenOptions
}

export interface TestResult {
  name: string
  passed: boolean
  actual?: string
  expected?: string
  error?: string
}

let results: TestResult[] = []
let currentDescribe = ""

export function describe(name: string, fn: () => void): void {
  const prev = currentDescribe
  currentDescribe = prev ? `${prev} > ${name}` : name
  fn()
  currentDescribe = prev
}

export function test(name: string, options: TestOptions): void {
  const fullName = currentDescribe ? `${currentDescribe} > ${name}` : name

  const tmpDir = mkdtempSync(join(tmpdir(), "tsclang-test-engine-"))
  const cPath = join(tmpDir, "input.c")
  const binPath = join(tmpDir, "input")

  try {
    let c: string
    try {
      const codegenOpts: any = options.options || {}
    const tokens = lex(options.input, "<test>")
      const { ast, errors: parseErrors } = parse(tokens, "<test>", options.input)
      if (parseErrors.length > 0) {
        throw { isTscErrorBag: true, errors: parseErrors }
      }
      c = codegen(ast, "<test>", options.input, codegenOpts).c
    } catch (e) {
      if (options.expectError) {
        results.push({ name: fullName, passed: true, error: "compile error as expected" })
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ name: fullName, passed: false, error: `compile error: ${msg}` })
      return
    }

    if (options.expectError) {
      results.push({ name: fullName, passed: false, error: "expected compile error, got success" })
      return
    }

    writeFileSync(cPath, c, "utf8")
    const runtimeDir = join(process.cwd(), "packages", "compiler", "src", "runtime")
    const gcc = spawnSync("gcc", [cPath, "-o", binPath, `-I${runtimeDir}`, "-lpthread", "-std=c11"], { stdio: "pipe" })
    if (gcc.status !== 0) {
      results.push({ name: fullName, passed: false, error: `gcc failed: ${gcc.stderr?.toString()}` })
      return
    }

    const run = spawnSync(binPath, [], { encoding: "utf8" })
    const actual = run.stdout?.trim() ?? ""

    if (options.expect) {
      const expected = String(options.expect.value)
      if (actual === expected) {
        results.push({ name: fullName, passed: true, actual, expected })
      } else {
        results.push({ name: fullName, passed: false, actual, expected })
      }
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
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
      console.log(`  РІСљвЂ” ${r.name}`)
      if (r.expected !== undefined) console.log(`    expected: ${r.expected}`)
      if (r.actual !== undefined) console.log(`    actual:   ${r.actual}`)
      if (r.error) console.log(`    error:    ${r.error}`)
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}