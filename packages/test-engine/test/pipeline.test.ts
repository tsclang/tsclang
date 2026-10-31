// Self-test: run() vertical slice (TSC → C → binary → stdout)
// Ref: #206 step 1 — gcc on Windows must go through MSYS2 bash
import { describe, test, expect, run } from "../src/engine.ts"

describe("run() vertical slice", () => {
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
