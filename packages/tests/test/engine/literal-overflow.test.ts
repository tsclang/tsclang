import { describe, test, run, expect } from "@tsclang/test-engine"

describe("literal overflow", () => {
  // defaultNumber=i8: 256 overflows i8
  test("let a = 256 with defaultNumber=i8", () => {
    expect(() => run("let a = 256\nconsole.log(a)", { defaultNumber: "i8" })).toThrow()
  })

  // defaultNumber=i8: 127 fits i8
  test("let a = 127 with defaultNumber=i8", () => {
    expect(run("let a = 127\nconsole.log(a)", { defaultNumber: "i8" })).toBe("127")
  })

  // defaultNumber=i8: -129 underflows i8
  test("let a = -129 with defaultNumber=i8", () => {
    expect(() => run("let a = -129\nconsole.log(a)", { defaultNumber: "i8" })).toThrow()
  })

  // defaultNumber=f64: 256 is fine (no overflow)
  test("let a = 256 with defaultNumber=f64", () => {
    expect(run("let a = 256\nconsole.log(a)", { defaultNumber: "f64" })).toBe("256")
  })

  // Explicit type annotation
  test("let a: i8 = 256", () => {
    expect(() => run("let a: i8 = 256\nconsole.log(a)")).toThrow()
  })
})
