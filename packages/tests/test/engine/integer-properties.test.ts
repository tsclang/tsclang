import { describe, test, run, expect, matrix } from "@tsclang/test-engine"

const SIGNED = ["i8", "i16", "i32"] as const
const UNSIGNED = ["u8", "u16", "u32"] as const
const ALL = [...SIGNED, ...UNSIGNED] as const

function boundaryValues(t: string): number[] {
  const { min, max } = matrix[t]
  return [0, 1, min, max]
}

describe("algebraic identities — a + 0 == a", () => {
  for (const t of ALL) {
    for (const a of boundaryValues(t)) {
      test(`${t}: ${a} + 0 = ${a}`, () => {
        expect(run(`let a: ${t} = ${a}\nconsole.log(a + 0)`)).toBe(String(a))
      })
    }
  }
})

describe("algebraic identities — a - 0 == a", () => {
  for (const t of ALL) {
    for (const a of boundaryValues(t)) {
      test(`${t}: ${a} - 0 = ${a}`, () => {
        expect(run(`let a: ${t} = ${a}\nconsole.log(a - 0)`)).toBe(String(a))
      })
    }
  }
})

describe("algebraic identities — a * 1 == a", () => {
  for (const t of ALL) {
    for (const a of boundaryValues(t)) {
      test(`${t}: ${a} * 1 = ${a}`, () => {
        expect(run(`let a: ${t} = ${a}\nconsole.log(a * 1)`)).toBe(String(a))
      })
    }
  }
})

describe("algebraic identities — a / 1 == a", () => {
  for (const t of ALL) {
    for (const a of boundaryValues(t)) {
      test(`${t}: ${a} / 1 = ${a}`, () => {
        expect(run(`let a: ${t} = ${a}\nconsole.log(a / 1)`)).toBe(String(a))
      })
    }
  }
})

describe("round-trip: (a * 2) / 2 == a", () => {
  for (const t of ALL) {
    for (const a of [0, 1]) {
      test(`${t}: (${a} * 2) / 2 = ${a}`, () => {
        expect(run(`let a: ${t} = ${a}\nconsole.log((a * 2) / 2)`)).toBe(String(a))
      })
    }
  }
})

describe("echo boundary values", () => {
  for (const t of ALL) {
    for (const a of boundaryValues(t)) {
      test(`${t}: echo ${a}`, () => {
        expect(run(`let a: ${t} = ${a}\nconsole.log(a)`)).toBe(String(a))
      })
    }
  }
})

describe("float echo", () => {
  const floatCases: [string, number, string][] = [
    ["f32", -1.0, "-1"],
    ["f32", 0.5, "0.5"],
    ["f64", -1.0, "-1"],
    ["f64", 3.14, "3.14"],
    ["f64", 1.5, "1.5"],
    ["f64", -0.5, "-0.5"],
  ]
  for (const [t, val, expected] of floatCases) {
    test(`${t}: echo ${val}`, () => {
      expect(run(`let a: ${t} = ${val}\nconsole.log(a)`)).toBe(expected)
    })
  }
})
