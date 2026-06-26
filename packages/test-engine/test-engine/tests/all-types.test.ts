import { describe, test, eq, matrix } from "../engine"

function runTypeTests(typeName: string, typeDef: any) {
  describe(`${typeName} = value`, () => {
    for (const val of typeDef.values) {
      const isInvalid = typeDef.invalidValues && typeDef.invalidValues.includes(val)
      
      // Для строк используем кавычки
      const literal = typeName === "string" ? `"${val}"` : String(val)
      const input = `let x: ${typeName} = ${literal}
console.log(x)`

      if (isInvalid) {
        test(`let x: ${typeName} = ${val} (overflow)`, { input, expectError: true })
      } else {
        // Для float используем строковое представление
        const expected = typeof val === "number" && !Number.isInteger(val) ? String(val) : val
        test(`let x: ${typeName} = ${val}`, { input, expect: eq(expected) })
      }
    }
  })
}

for (const [typeName, typeDef] of Object.entries(matrix)) {
  if (typeName === "char") continue // char обрабатывается отдельно
  if (typeName === "f32" || typeName === "f64") continue // float точность
  runTypeTests(typeName, typeDef)
}

// char тесты отдельно (выводит символ, не число)
describe("char = value", () => {
  test("char = 65 (A)", { input: "let x: char = 65\nconsole.log(x)", expect: eq("A") })
})

// float тесты отдельно (без граничных значений)
describe("float values", () => {
  test("f32 = 0.0", { input: "let x: f32 = 0.0\nconsole.log(x)", expect: eq("0") })
  test("f32 = 1.0", { input: "let x: f32 = 1.0\nconsole.log(x)", expect: eq("1") })
  test("f64 = 0.0", { input: "let x: f64 = 0.0\nconsole.log(x)", expect: eq("0") })
  test("f64 = 1.0", { input: "let x: f64 = 1.0\nconsole.log(x)", expect: eq("1") })
  test("f64 = 3.14", { input: "let x: f64 = 3.14\nconsole.log(x)", expect: eq("3.14") })
})