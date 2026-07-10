import { describe, test, run, expect, platformMatrix } from "../engine.js"

const DECIMAL_DP: Record<string, number> = { d8: 2, d16: 2, d32: 4, d64: 8 }

describe("number operations across platforms", () => {
  for (const dn of platformMatrix.defaultNumber) {
    const dp = DECIMAL_DP[dn]

    if (dp !== undefined) {
      test(`a + b with defaultNumber=${dn}`, () => {
        const output = run(`let a: number = 0.1\nlet b: number = 0.2\nconsole.log(a + b)`, { defaultNumber: dn })
        expect(output).toBe((0.3).toFixed(dp))
      })
    } else {
      test(`a + b with defaultNumber=${dn}`, () => {
        const output = run(`let a: number = 1\nlet b: number = 2\nconsole.log(a + b)`, { defaultNumber: dn })
        expect(output).toBe("3")
      })
    }
  }
})
