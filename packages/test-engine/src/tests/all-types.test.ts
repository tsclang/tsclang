import { describe, test, run, expect, matrix } from "../engine.js"

const DECIMAL_DP: Record<string, number> = { d8: 2, d16: 2, d32: 4, d64: 8 }

function formatExpected(typeName: string, val: any): string {
  if (typeof val !== "number") return String(val)
  const dp = DECIMAL_DP[typeName]
  if (dp !== undefined) return val.toFixed(dp)
  return String(val)
}

function runTypeTests(typeName: string, typeDef: any) {
  describe(`${typeName} = value`, () => {
    for (const val of typeDef.values) {
      const isInvalidRange = typeDef.invalidRange && typeDef.invalidRange.includes(val)
      const isInvalidValue = typeDef.invalidValues && typeDef.invalidValues.includes(val)
      
      const literal = typeName === "string" ? `"${val}"` : String(val)
      const code = `let x: ${typeName} = ${literal}\nconsole.log(x)`

      if (isInvalidRange) {
        test(`let x: ${typeName} = ${val} (overflow)`, () => {
          expect(() => run(code)).toThrow()
        })
      } else if (isInvalidValue) {
        test(`let x: ${typeName} = ${val} (wrong type)`, () => {
          expect(() => run(code)).toThrow()
        })
      } else {
        test(`let x: ${typeName} = ${val}`, () => {
          expect(run(code)).toBe(formatExpected(typeName, val))
        })
      }
    }
  })
}

for (const [typeName, typeDef] of Object.entries(matrix)) {
  if (typeName === "char") continue
  if (typeName === "f32" || typeName === "f64") continue
  runTypeTests(typeName, typeDef)
}

describe("alternative numeric literals (hex/bin/oct)", () => {
  for (const [typeName, typeDef] of Object.entries(matrix)) {
    if (!typeDef.altLiterals) continue
    for (const [lit, expected] of typeDef.altLiterals) {
      test(`let x: ${typeName} = ${lit} → ${expected}`, () => {
        expect(run(`let x: ${typeName} = ${lit}\nconsole.log(x)`)).toBe(expected)
      })
    }
  }
})

describe("char = value", () => {
  test("char = 65 (A)", () => {
    expect(run("let x: char = 65\nconsole.log(x)")).toBe("A")
  })
})

describe("float values", () => {
  test("f32 = 0.0", () => {
    expect(run("let x: f32 = 0.0\nconsole.log(x)")).toBe("0")
  })
  test("f32 = 1.0", () => {
    expect(run("let x: f32 = 1.0\nconsole.log(x)")).toBe("1")
  })
  test("f64 = 0.0", () => {
    expect(run("let x: f64 = 0.0\nconsole.log(x)")).toBe("0")
  })
  test("f64 = 1.0", () => {
    expect(run("let x: f64 = 1.0\nconsole.log(x)")).toBe("1")
  })
  test("f64 = 3.14", () => {
    expect(run("let x: f64 = 3.14\nconsole.log(x)")).toBe("3.14")
  })
})
