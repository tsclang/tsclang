import { describe, test, eq } from "../engine"

describe("literal overflow", () => {
  // defaultNumber=i8: 256 overflows i8
  test("let a = 256 with defaultNumber=i8", {
    input: `let a = 256
console.log(a)`,
    options: { defaultNumber: "i8" },
    expectError: true
  })

  // defaultNumber=i8: 127 fits i8
  test("let a = 127 with defaultNumber=i8", {
    input: `let a = 127
console.log(a)`,
    options: { defaultNumber: "i8" },
    expect: eq(127)
  })

  // defaultNumber=i8: -129 underflows i8
  test("let a = -129 with defaultNumber=i8", {
    input: `let a = -129
console.log(a)`,
    options: { defaultNumber: "i8" },
    expectError: true
  })

  // defaultNumber=f64: 256 is fine (no overflow)
  test("let a = 256 with defaultNumber=f64", {
    input: `let a = 256
console.log(a)`,
    options: { defaultNumber: "f64" },
    expect: eq(256)
  })

  // Explicit type annotation
  test("let a: i8 = 256", {
    input: `let a: i8 = 256
console.log(a)`,
    expectError: true
  })
})