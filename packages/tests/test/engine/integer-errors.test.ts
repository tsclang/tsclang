import { describe, test, run, expect, matrix, RuntimeError } from "@tsclang/test-engine"

// Layer 2 — Error tests: deterministic, explicit type lists, per-behavior expectation.
// Two behaviors: E401 (division by zero) and E402 (MIN / -1 overflow).
// Plus control values (valid division, no panic).

const SIGNED_INT = ["i8", "i16", "i32", "i64"] as const
const UNSIGNED_INT = ["u8", "u16", "u32", "u64"] as const
const ALL_INT = [...SIGNED_INT, ...UNSIGNED_INT] as const

const I64_MIN = "-9223372036854775808"

function minLiteral(t: string): string {
  if (t === "i64") return I64_MIN
  return String(matrix[t].min)
}

describe("integer division by zero — E401", () => {
  for (const t of ALL_INT) {
    test(`${t}: a / 0 -> E401`, () => {
      expect(() => run(`let a: ${t} = 7\nlet b: ${t} = 0\nconsole.log(a / b)`))
        .toThrow(RuntimeError, "E401")
    })
    test(`${t}: a % 0 -> E401`, () => {
      expect(() => run(`let a: ${t} = 7\nlet b: ${t} = 0\nconsole.log(a % b)`))
        .toThrow(RuntimeError, "E401")
    })
  }
})

describe("integer overflow MIN / -1 — E402 (signed only)", () => {
  for (const t of SIGNED_INT) {
    test(`${t}: MIN / -1 -> E402`, () => {
      expect(() => run(`let a: ${t} = ${minLiteral(t)}\nlet b: ${t} = -1\nconsole.log(a / b)`))
        .toThrow(RuntimeError, "E402")
    })
    test(`${t}: MIN % -1 -> E402`, () => {
      expect(() => run(`let a: ${t} = ${minLiteral(t)}\nlet b: ${t} = -1\nconsole.log(a % b)`))
        .toThrow(RuntimeError, "E402")
    })
  }
})

describe("division control values (no panic)", () => {
  for (const t of ALL_INT) {
    test(`${t}: 7 / 2 = 3`, () => {
      expect(run(`let a: ${t} = 7\nlet b: ${t} = 2\nconsole.log(a / b)`)).toBe("3")
    })
    test(`${t}: 7 % 2 = 1`, () => {
      expect(run(`let a: ${t} = 7\nlet b: ${t} = 2\nconsole.log(a % b)`)).toBe("1")
    })
  }
})
