import { describe, test, run, expect, platformMatrix } from "@tsclang/test-engine"

describe("platform-specific: float on AVR", () => {
  // On desktop (fpu=true), float operations work
  test("float on desktop", () => {
    expect(run("let a: f64 = 3.14\nconsole.log(a)", { target: "desktop" })).toBe("3.14")
  })

  // On AVR (fpu=false), float literals are forbidden
  test("float on AVR", () => {
    expect(() => run("let a: f64 = 3.14\nconsole.log(a)", { target: "avr" })).toThrow()
  })
})
