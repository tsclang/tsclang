import { describe, test, eq, matrix } from "../engine"

function runTypeTests(typeName: string, typeDef: any) {
  describe(`${typeName} = value`, () => {
    for (const val of typeDef.values) {
      const isInvalidRange = typeDef.invalidRange && typeDef.invalidRange.includes(val)
      const isInvalidValue = typeDef.invalidValues && typeDef.invalidValues.includes(val)
      
      const literal = typeName === "string" ? `"${val}"` : String(val)
      const input = `let x: ${typeName} = ${literal}
console.log(x)`

      if (isInvalidRange) {
        test(`let x: ${typeName} = ${val} (overflow)`, { input, expectError: true })
      } else if (isInvalidValue) {
        test(`let x: ${typeName} = ${val} (wrong type)`, { input, expectError: true })
      } else {
        const expected = typeof val === "number" && !Number.isInteger(val) ? String(val) : val
        test(`let x: ${typeName} = ${val}`, { input, expect: eq(expected) })
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
  test("char = 65 (A)", { input: "let x: char = 65\nconsole.log(x)", expect: eq("A") })
})

describe("float values", () => {
  test("f32 = 0.0", { input: "let x: f32 = 0.0\nconsole.log(x)", expect: eq("0") })
  test("f32 = 1.0", { input: "let x: f32 = 1.0\nconsole.log(x)", expect: eq("1") })
  test("f64 = 0.0", { input: "let x: f64 = 0.0\nconsole.log(x)", expect: eq("0") })
  test("f64 = 1.0", { input: "let x: f64 = 1.0\nconsole.log(x)", expect: eq("1") })
  test("f64 = 3.14", { input: "let x: f64 = 3.14\nconsole.log(x)", expect: eq("3.14") })
})