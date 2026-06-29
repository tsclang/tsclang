import { describe, test, platformMatrix } from "../engine"

describe("number operations across platforms", () => {
  for (const dn of platformMatrix.defaultNumber) {
    test(`a + b with defaultNumber=${dn}`, {
      input: `let a: number = 1
let b: number = 2
console.log(a + b)`,
      options: { defaultNumber: dn },
      expect: { toBe: 3 }
    })
  }
})