import { describe, test, matrix } from '../engine.js'

describe('let x: i8 = value', () => {
  for (const val of matrix.i8.values) {
    const input = `let x: i8 = ${val}
console.log(x)`
    const expectError = val < matrix.i8.min || val > matrix.i8.max

    if (expectError) {
      test(`let x: i8 = ${val} (overflow)`, { input, expectError: true })
    } else {
      test(`let x: i8 = ${val}`, { input, expect: { toBe: val } })
    }
  }
})