// Self-test: toThrow — bare form, error-class matching for all three engine
// phases, message substring, wrong-class diagnostics, not.toThrow
// Ref: #206 step 10
import { describe, test, expect, TscCompilationError, CompileError, RuntimeError } from "../src/engine.ts"

describe("toThrow — bare form", () => {
  test("any throw passes", () => {
    expect(() => { throw new Error("boom") }).toThrow()
  })

  test("no throw fails with a readable message", () => {
    // meta-level: the failing assertion itself must throw
    expect(() => expect(() => 1).toThrow()).toThrow(Error, "expected function to throw")
  })

  test("throwing non-Error values still matches bare form", () => {
    expect(() => { throw "string error" }).toThrow()
  })
})

describe("toThrow — error classes of all three phases", () => {
  test("TscCompilationError", () => {
    expect(() => { throw new TscCompilationError("[E001] bad syntax") }).toThrow(TscCompilationError, "bad syntax")
  })

  test("CompileError", () => {
    expect(() => { throw new CompileError("gcc exited 1\nstderr text") }).toThrow(CompileError, "gcc exited 1")
  })

  test("RuntimeError", () => {
    expect(() => { throw new RuntimeError("exit code 7") }).toThrow(RuntimeError, "exit code 7")
  })

  test("wrong class fails naming both classes", () => {
    expect(() =>
      expect(() => { throw new Error("plain") }).toThrow(TscCompilationError)
    ).toThrow(Error, "expected TscCompilationError but got Error")
  })

  test("subclass matches the base class", () => {
    class SpecificError extends CompileError {}
    expect(() => { throw new SpecificError("child") }).toThrow(CompileError)
  })
})

describe("toThrow — message substring", () => {
  test("substring must be present", () => {
    expect(() => {
      throw Object.assign(new Error("required"), { code: "E0301" })
    }).toThrow(Error, "required")
  })

  test("missing substring fails with expected/got", () => {
    expect(() =>
      expect(() => { throw new Error("actual text") }).toThrow(Error, "other text")
    ).toThrow(Error, 'to contain "other text"')
  })
})

describe("not.toThrow", () => {
  test("non-throwing function passes", () => {
    expect(() => 42).not.toThrow()
  })

  test("throwing function fails", () => {
    expect(() =>
      expect(() => { throw new Error("x") }).not.toThrow()
    ).toThrow(Error, "expected function not to throw")
  })
})
