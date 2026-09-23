import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — комментарии', () => {
  test('однострочный комментарий', () => {
    const result = run(`
      // это комментарий
      const x = 1
      console.log(x)
    `)
    expect(result).toBe('1')
  })

  test('многострочный комментарий', () => {
    const result = run(`
      /* это
         многострочный
         комментарий */
      const x = 1
      console.log(x)
    `)
    expect(result).toBe('1')
  })
})
