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

  // Math.saturatingCast — clamps to target range
  test("saturatingCast: i64 to i32 clamps to INT32_MAX", {
    input: `let big: i64 = 5000000000
let clamped = Math.saturatingCast<i32>(big)
console.log(clamped)`,
    options: { strict: ["no-lossy-cast"] },
    expect: eq(2147483647)
  })

  test("saturatingCast: i64 to i32 clamps to INT32_MIN", {
    input: `let big: i64 = -5000000000
let clamped = Math.saturatingCast<i32>(big)
console.log(clamped)`,
    options: { strict: ["no-lossy-cast"] },
    expect: eq(-2147483648)
  })

  test("saturatingCast: i64 to i32 fits unchanged", {
    input: `let x: i64 = 42
let y = Math.saturatingCast<i32>(x)
console.log(y)`,
    options: { strict: ["no-lossy-cast"] },
    expect: eq(42)
  })

  // Math.checkedCast — returns null on overflow
  test("checkedCast: i64 to i32 overflow returns null", {
    input: `let big: i64 = 5000000000
let result = Math.checkedCast<i32>(big)
if (result === null) {
  console.log("overflow")
} else {
  console.log(result)
}`,
    options: { strict: ["no-lossy-cast"] },
    expect: eq("overflow")
  })

  test("checkedCast: i64 to i32 fits returns value", {
    input: `let x: i64 = 42
let result = Math.checkedCast<i32>(x)
if (result === null) {
  console.log("overflow")
} else {
  console.log(result)
}`,
    options: { strict: ["no-lossy-cast"] },
    expect: eq(42)
  })
})