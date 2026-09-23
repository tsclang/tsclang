import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — фигурные скобки', () => {
  test('с фигурными скобками', () => {
    const result = run(`
      if (true) {
        console.log("ok")
      }
    `)
    expect(result).toBe('ok')
  })

  test('без фигурных скобок', () => {
    const result = run(`
      if (true) console.log("ok")
    `)
    expect(result).toBe('ok')
  })
})
