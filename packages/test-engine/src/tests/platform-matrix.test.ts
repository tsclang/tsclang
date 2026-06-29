import { describe, test, run, expect, platformMatrix } from "../engine.js"

describe("number operations across platforms", () => {
  for (const dn of platformMatrix.defaultNumber) {
    test(`a + b with defaultNumber=${dn}`, () => {
      const output = run(`let a: number = 1
let b: number = 2
console.log(a + b)`, { defaultNumber: dn })
      expect(output).toBe("3")
    })
  }
})
