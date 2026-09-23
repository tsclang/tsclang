import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — цепочки методов', () => {
  test('короткая цепочка', () => {
    const result = run(`
      const arr = [1, 2, 3, 4, 5]
      const result = arr.filter(x => x > 0).map(x => x * 2)
      console.log(result[0] + result[1])
    `)
    expect(result).toBe('6')
  })

  test('длинная цепочка', () => {
    const result = run(`
      const arr = [1, 2, 3, 4, 5]
      const result = arr
          .filter(x => x > 0)
          .map(x => x * 2)
          .slice(0, 3)
      console.log(result[0] + result[1])
    `)
    expect(result).toBe('6')
  })
})
