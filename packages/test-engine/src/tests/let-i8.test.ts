import { describe, test, run, expect, matrix } from '../engine.js'

describe('let x: i8 = value', () => {
  for (const val of matrix.i8.values) {
    const code = `let x: i8 = ${val}\nconsole.log(x)`
    const expectError = val < matrix.i8.min || val > matrix.i8.max

    if (expectError) {
      test(`let x: i8 = ${val} (overflow)`, () => {
        expect(() => run(code)).toThrow()
      })
    } else {
      test(`let x: i8 = ${val}`, () => {
        const output = run(code)
        expect(output).toBe(String(val))
      })
    }
  }
})
