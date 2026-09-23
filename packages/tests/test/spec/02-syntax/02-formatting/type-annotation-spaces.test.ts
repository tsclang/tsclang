import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — пробелы в аннотациях типов', () => {
  test('правильно (пробел после :)', () => {
    const result = run(`
      const x: i32 = 5
      console.log(x)
    `)
    expect(result).toBe('5')
  })

  test('неправильно (пробел до :)', () => {
    const result = run(`
      const x :i32 = 5
      console.log(x)
    `)
    expect(result).toBe('5')
  })
})
