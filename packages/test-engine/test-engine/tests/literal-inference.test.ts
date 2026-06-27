import { describe, test, eq } from "../engine"

describe("literal type inference across platforms", () => {
  // On desktop (defaultNumber=f64): 1 is f64, so 1 + 0.8 works
  test("let a = 1; a += 0.8 on desktop", {
    input: `let a = 1
a += 0.8
console.log(a)`,
    options: { target: "desktop" },
    expect: eq("1.8")
  })

  // On AVR (defaultNumber=i16): 1 is i16, so 1 + 0.8 is error
  test("let a = 1; a += 0.8 on AVR", {
    input: `let a = 1
a += 0.8
console.log(a)`,
    options: { target: "avr" },
    expectError: true
  })

  // Explicit f64 works on all platforms
  test("let a: f64 = 1; a += 0.8 on desktop", {
    input: `let a: f64 = 1
a += 0.8
console.log(a)`,
    options: { target: "desktop" },
    expect: eq("1.8")
  })
})