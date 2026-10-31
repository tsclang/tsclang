// Self-test: run() vertical slice (TSC → C → binary → stdout) — positive and
// negative paths through all three pipeline phases
// Ref: #206 steps 1-2, 8
import { describe, test, expect, run, TscCompilationError, CompileError, RuntimeError } from "../src/engine.ts"

describe("run() vertical slice — positive", () => {
  test("console.log(42) → \"42\"", () => {
    expect(run("console.log(42)")).toBe("42")
  })

  test("console.log(\"hello\") → \"hello\"", () => {
    expect(run('console.log("hello")')).toBe("hello")
  })

  test("multi-statement program: 6 * 7 = 42", () => {
    expect(run(`
      let x: i32 = 6
      let y: i32 = 7
      console.log(x * y)
    `)).toBe("42")
  })
})

describe("run() vertical slice — negative", () => {
  test("invalid .tsc → TscCompilationError from phase tsc", () => {
    expect(() => run("let x: i32 = @@@")).toThrow(TscCompilationError)
  })

  // NOTE: semantic errors (type mismatch, unknown type, undeclared variable)
  // currently surface as CompileError — the compiler does not type-check;
  // tracked separately, see the compiler issue referenced in #206 step 10

  test("unknown compiler name → CompileError naming it", () => {
    expect(() => run("console.log(1)", { compiler: "definitely-not-a-compiler" })).toThrow(CompileError, "definitely-not-a-compiler")
  })

  test("hung binary killed by timeout → RuntimeError", () => {
    expect(() => run("while (true) { }", { timeoutMs: 60 })).toThrow(RuntimeError)
  })
})
