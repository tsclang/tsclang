import { describe, test, run, expect, platformMatrix, filterValidTypes, matrix, TscCompilationError } from "../engine.js"

// === fpu ===

describe("fpu: false", () => {
  test("rejects f32 type declaration", () => {
    expect(() => run(`let x: f32 = 1.0`, { fpu: false })).toThrow(TscCompilationError, "E302")
  })

  test("rejects f64 type declaration", () => {
    expect(() => run(`let x: f64 = 1.0`, { fpu: false })).toThrow(TscCompilationError, "E302")
  })

  test("rejects float literal (number = 1.5)", () => {
    expect(() => run(`let x = 1.5`, { fpu: false })).toThrow(TscCompilationError, "E302")
  })

  test("accepts integer literal (number = 42)", () => {
    expect(run(`let x = 42; console.log(x)`)).toBe("42")
  })

  test("i32 echo works", () => {
    expect(run(`let x: i32 = 42; console.log(x)`, { fpu: false })).toBe("42")
  })

  test("u8 echo works", () => {
    expect(run(`let x: u8 = 200; console.log(x)`, { fpu: false })).toBe("200")
  })

  test("d8 echo works (decimal uses skipFloatLiterals)", () => {
    expect(run(`let x: d8 = 0.50; console.log(x)`, { fpu: false })).toBe("0.50")
  })

  test("d32 echo works", () => {
    expect(run(`let x: d32 = 3.14; console.log(x)`, { fpu: false })).toBe("3.1400")
  })

  test("hex literal is allowed", () => {
    expect(run(`let x: i32 = 0xFF; console.log(x)`, { fpu: false })).toBe("255")
  })
})

describe("fpu: false — all valid types echo", () => {
  const validTypes = filterValidTypes({ fpu: false })
  for (const t of validTypes) {
    const typeDef = matrix[t]
    if (!typeDef) continue
    const val = typeDef.validValues[0]
    const DECIMAL_DP: Record<string, number> = { d8: 2, d16: 2, d32: 4, d64: 8 }
    const dp = DECIMAL_DP[t]
    const expected = dp !== undefined && typeof val === "number" ? val.toFixed(dp) : String(val)
    test(`${t} = ${val} compiles and echoes`, () => {
      expect(run(`let x: ${t} = ${val}; console.log(x)`, { fpu: false })).toBe(expected)
    })
  }
})

// === bits ===

describe("bits variation — i32 echo", () => {
  for (const bits of platformMatrix.bits) {
    test(`i32 echo with bits=${bits}`, () => {
      expect(run(`let x: i32 = 42; console.log(x)`, { bits })).toBe("42")
    })
  }
})

describe("bits variation — u32 echo", () => {
  for (const bits of platformMatrix.bits) {
    test(`u32 echo with bits=${bits}`, () => {
      expect(run(`let x: u32 = 100000; console.log(x)`, { bits })).toBe("100000")
    })
  }
})

describe("bits variation — i8 echo", () => {
  for (const bits of platformMatrix.bits) {
    test(`i8 echo with bits=${bits}`, () => {
      expect(run(`let x: i8 = -5; console.log(x)`, { bits })).toBe("-5")
    })
  }
})

// === allocator ===

describe("allocator: static", () => {
  test("integer echo works", () => {
    expect(run(`let x: i32 = 42; console.log(x)`, { allocator: "static" })).toBe("42")
  })

  test("string echo works", () => {
    expect(run(`console.log("hello")`, { allocator: "static" })).toBe("hello")
  })
})

describe("allocator: none", () => {
  test("integer echo works", () => {
    expect(run(`let x: i32 = 42; console.log(x)`, { allocator: "none" })).toBe("42")
  })
})

// === async ===

describe("async: none", () => {
  test("regular function works", () => {
    expect(run(`function add(a: i32, b: i32): i32 { return a + b }\nconsole.log(add(3, 4))`, { async: "none" })).toBe("7")
  })

  test("async function rejected with E303", () => {
    expect(() => run(`async function foo() {}`, { async: "none" })).toThrow(TscCompilationError, "E303")
  })
})

// === usize ===

describe("usize variation", () => {
  for (const us of platformMatrix.usize) {
    test(`usize echo with usize=${us}`, () => {
      expect(run(`let x: usize = 42; console.log(x)`, { usize: us })).toBe("42")
    })
  }
})
