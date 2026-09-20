import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — точки с запятой', () => {
  test('без точек с запятой', () => {
    const result = run(`
      const x = 1
      const y = 2
      console.log(x + y)
    `)
    expect(result).toBe('3')
  })

  test('с точками с запятой', () => {
    const result = run(`
      const x = 1;
      const y = 2;
      console.log(x + y);
    `)
    expect(result).toBe('3')
  })

  test('смешанные', () => {
    const result = run(`
      const x = 1;
      const y = 2
      console.log(x + y)
    `)
    expect(result).toBe('3')
  })
})
