import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — пробелы вокруг операторов', () => {
  test('с пробелами', () => {
    const result = run(`
      const a = 1, b = 2, c = 3
      const x = a + b * c
      console.log(x)
    `)
    expect(result).toBe('7')
  })

  test('без пробелов', () => {
    const result = run(`
      const a = 1, b = 2, c = 3
      const x = a+b*c
      console.log(x)
    `)
    expect(result).toBe('7')
  })
})
