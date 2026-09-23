import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — отступы', () => {
  test('разные отступы', () => {
    const result = run(`
      function foo(): void {
      const x = 1
          const y = 2
              const z = 3
      console.log(x + y + z)
      }
      foo()
    `)
    expect(result).toBe('6')
  })
})
