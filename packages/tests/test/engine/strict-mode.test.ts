import { describe, test, run, expect } from "@tsclang/test-engine"

describe("strict mode behavior", () => {
  // safe-math: overflow in try/catch
  test("safe-math: overflow caught by MathError", () => {
    const output = run(`try {
  let a: i8 = 127
  let b: i8 = a + (1 as i8)
  console.log(b)
} catch (e: MathError) {
  console.log("overflow")
}`, { strict: ["safe-math"] })
    expect(output).toBe("overflow")
  })

  // safe-math: no overflow
  test("safe-math: no overflow", () => {
    const output = run(`try {
  let a: i8 = 100
  let b: i8 = a + (1 as i8)
  console.log(b)
} catch (e: MathError) {
  console.log("overflow")
}`, { strict: ["safe-math"] })
    expect(output).toBe("101")
  })

  // safe-math: without try/catch should error
  test("safe-math: unguarded arithmetic error", () => {
    expect(() => run(`let a: i8 = 127
let b: i8 = a + (1 as i8)
console.log(b)`, { strict: ["safe-math"] })).toThrow()
  })

  // no-lossy-cast: lossy as should error
  test("no-lossy-cast: i64 to i32 error", () => {
    expect(() => run(`let x: i64 = 42
let y = x as i32`, { strict: ["no-lossy-cast"] })).toThrow()
  })

  // no-lossy-cast: safe widening ok
  test("no-lossy-cast: i32 to i64 ok", () => {
    const output = run(`let x: i32 = 42
let y = x as i64
console.log(y)`, { strict: ["no-lossy-cast"] })
    expect(output).toBe("42")
  })

  // Math.saturatingCast — clamps to target range
  test("saturatingCast: i64 to i32 clamps to INT32_MAX", () => {
    const output = run(`let big: i64 = 5000000000
let clamped = Math.saturatingCast<i32>(big)
console.log(clamped)`, { strict: ["no-lossy-cast"] })
    expect(output).toBe("2147483647")
  })

  test("saturatingCast: i64 to i32 clamps to INT32_MIN", () => {
    const output = run(`let big: i64 = -5000000000
let clamped = Math.saturatingCast<i32>(big)
console.log(clamped)`, { strict: ["no-lossy-cast"] })
    expect(output).toBe("-2147483648")
  })

  test("saturatingCast: i64 to i32 fits unchanged", () => {
    const output = run(`let x: i64 = 42
let y = Math.saturatingCast<i32>(x)
console.log(y)`, { strict: ["no-lossy-cast"] })
    expect(output).toBe("42")
  })

  // Math.checkedCast — returns null on overflow
  test("checkedCast: i64 to i32 overflow returns null", () => {
    const output = run(`let big: i64 = 5000000000
let result = Math.checkedCast<i32>(big)
if (result === null) {
  console.log("overflow")
} else {
  console.log(result)
}`, { strict: ["no-lossy-cast"] })
    expect(output).toBe("overflow")
  })

  test("checkedCast: i64 to i32 fits returns value", () => {
    const output = run(`let x: i64 = 42
let result = Math.checkedCast<i32>(x)
if (result === null) {
  console.log("overflow")
} else {
  console.log(result)
}`, { strict: ["no-lossy-cast"] })
    expect(output).toBe("42")
  })
})
