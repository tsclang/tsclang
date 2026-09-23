import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — union типы', () => {
  test('с пробелами', () => {
    const result = run(`
      let x: i32 | null = null
      if (x == null) x = 42
      console.log(x)
    `)
    expect(result).toBe('42')
  })

  test('без пробелов', () => {
    const result = run(`
      let x: i32|null = null
      if (x == null) x = 42
      console.log(x)
    `)
    expect(result).toBe('42')
  })
})
