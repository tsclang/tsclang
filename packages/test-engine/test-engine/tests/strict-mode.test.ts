import { describe, test, eq } from "../engine"

describe("strict mode behavior", () => {
  // safe-math: overflow in try/catch
  test("safe-math: overflow caught by MathError", {
    input: `try {
  let a: i8 = 127
  let b: i8 = a + (1 as i8)
  console.log(b)
} catch (e: MathError) {
  console.log("overflow")
}`,
    options: { strict: ["safe-math"] },
    expect: eq("overflow")
  })

  // safe-math: no overflow
  test("safe-math: no overflow", {
    input: `try {
  let a: i8 = 100
  let b: i8 = a + (1 as i8)
  console.log(b)
} catch (e: MathError) {
  console.log("overflow")
}`,
    options: { strict: ["safe-math"] },
    expect: eq(101)
  })

  // safe-math: without try/catch should error
  test("safe-math: unguarded arithmetic error", {
    input: `let a: i8 = 127
let b: i8 = a + (1 as i8)
console.log(b)`,
    options: { strict: ["safe-math"] },
    expectError: true
  })

  // no-lossy-cast: lossy as should error
  test("no-lossy-cast: i64 to i32 error", {
    input: `let x: i64 = 42
let y = x as i32`,
    options: { strict: ["no-lossy-cast"] },
    expectError: true
  })

  // no-lossy-cast: safe widening ok
  test("no-lossy-cast: i32 to i64 ok", {
    input: `let x: i32 = 42
let y = x as i64
console.log(y)`,
    options: { strict: ["no-lossy-cast"] },
    expect: eq(42)
  })
})