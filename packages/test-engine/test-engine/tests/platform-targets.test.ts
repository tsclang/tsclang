import { describe, test, platformMatrix } from "../engine"

describe("platform-specific: float on AVR", () => {
  // On desktop (fpu=true), float operations work
  test("float on desktop", {
    input: `let a: f64 = 3.14
console.log(a)`,
    options: { target: "desktop" },
    expect: { toBe: "3.14" }
  })

  // On AVR (fpu=false), float literals are forbidden
  test("float on AVR", {
    input: `let a: f64 = 3.14
console.log(a)`,
    options: { target: "avr" },
    expectError: true
  })
})