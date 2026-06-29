import { describe, test, run, expect, matrix } from "../engine.js"

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
        const expected = typeof val === "number" && !Number.isInteger(val) ? String(val) : val
        test(`let x: ${typeName} = ${val}`, () => {
          expect(run(code)).toBe(String(expected))
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
