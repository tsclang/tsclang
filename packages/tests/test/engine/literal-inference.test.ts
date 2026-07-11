import { describe, test, run, expect } from "@tsclang/test-engine"

describe("literal type inference across platforms", () => {
  // On desktop (defaultNumber=f64): 1 is f64, so 1 + 0.8 works
  test("let a = 1; a += 0.8 on desktop", () => {
    const output = run(`let a = 1
a += 0.8
console.log(a)`, { target: "desktop" })
    expect(output).toBe("1.8")
  })

  // On AVR (defaultNumber=i16): 1 is i16, so 1 + 0.8 is error
  test("let a = 1; a += 0.8 on AVR", () => {
    expect(() => run(`let a = 1
a += 0.8
console.log(a)`, { target: "avr" })).toThrow()
  })

  // Explicit f64 works on all platforms
  test("let a: f64 = 1; a += 0.8 on desktop", () => {
    const output = run(`let a: f64 = 1
a += 0.8
console.log(a)`, { target: "desktop" })
    expect(output).toBe("1.8")
  })
})
