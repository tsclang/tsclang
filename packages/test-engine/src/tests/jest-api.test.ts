import { describe, test, run, compile, expect } from "../engine"

describe("Jest-like API", () => {
  // === run() ===
  test("run() returns stdout", () => {
    const output = run('console.log(42)')
    expect(output).toBe("42")
  })

  test("run() with codegen options", () => {
    const output = run('console.log(42)', { compiler: "gcc" })
    expect(output).toBe("42")
  })

  // === compile() ===
  test("compile() returns C code", () => {
    const c = compile('let x: i32 = 42')
    expect(c).toContain("int32_t")
  })

  // === expect() matchers ===
  test("expect().toBe()", () => {
    const output = run('console.log(42)')
    expect(output).toBe("42")
  })

  test("expect().toContain()", () => {
    const output = run('console.log("hello world")')
    expect(output).toContain("world")
  })

  test("expect().not.toContain()", () => {
    const output = run('console.log("hello")')
    expect(output).not.toContain("world")
  })

  test("expect().toMatch()", () => {
    const output = run('console.log("abc123")')
    expect(output).toMatch("^[a-z]+[0-9]+$")
  })

  // === expect().toThrow() ===
  test("expect().toThrow() catches TSC error", () => {
    expect(() => {
      run('let x: i32 = "hello"')
    }).toThrow()
  })

  test("expect().not.toThrow() passes for valid code", () => {
    expect(() => {
      run('let x: i32 = 42')
    }).not.toThrow()
  })
})