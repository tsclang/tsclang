import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — string-values', () => {
  describe('11.1. Строковые литералы', () => {
    test('let x: string = ""; → OK (empty string)', () => {
      const c = run(`
        let x: string = ""
        console.log(x)
      `)
      expect(c).toBe('')
    })

    test('let x: string = "hello"; → OK', () => {
      const c = run(`
        let x: string = "hello"
        console.log(x)
      `)
      expect(c).toBe('hello')
    })

    test('let x: string = "hello\\nworld"; → OK (escape sequences)', () => {
      const c = run(`let x: string = "hello\\nworld"
console.log(x)`)
      expect(c).toContain('hello')
      expect(c).toContain('world')
    })
  })

  describe('11.2. Template literal', () => {
    test('let x: string = `template`; → OK', () => {
      const c = run(`
        let x: string = ` + '`template`' + `
        console.log(x)
      `)
      expect(c).toBe('template')
    })

    test('let x: string = `expr: ${42}`; → OK (interpolation)', () => {
      const c = run(`
        let x: string = ` + '`expr: ${42}`' + `
        console.log(x)
      `)
      expect(c).toBe('expr: 42')
    })
  })

  describe('11.3. Char literals', () => {
    test("let x: char = 'a'; → OK", () => {
      const c = run(`
        let x: char = 'a'
        console.log(x)
      `)
      expect(c).toBe('a')
    })

    test("let x: char = '\\n'; → OK (escape char)", () => {
      const c = run(`
        let x: char = '\\n'
        console.log(x)
      `)
      expect(c).toBe('')
    })

    test("let x: char = 0; → OK (null char)", () => {
      const c = run(`let x: char = 0
console.log(x)`)
      expect(c).toBe('\u0000')
    })

    test("let x: char = 65; → OK ('A')", () => {
      const c = run(`
        let x: char = 65
        console.log(x)
      `)
      expect(c).toBe('A')
    })

    test("let x: char = 255; → OK (max char)", () => {
      const c = run(`let x: char = 255
console.log(x)`)
      expect(c).toBe('�')
    })

    test("let x: char = 256; → compile error (out of range)", () => {
      expect(() => run(`
        let x: char = 256
      `)).toThrow()
    })

    test("let x: char = 'ab'; → compile error (multi-char)", () => {
      expect(() => run(`
        let x: char = 'ab'
      `)).toThrow()
    })
  })
})
