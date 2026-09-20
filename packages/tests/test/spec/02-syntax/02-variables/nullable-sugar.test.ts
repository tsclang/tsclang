import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — nullable-sugar', () => {
  describe('6.1. T? — sugar for T | null', () => {
    test('let x?: string; → sugar for string | null, zero-value = null', () => {
      const c = run(`
        let x?: string
        x
      `)
      expect(c).toBe('null')
    })

    test('let x?: i32; → sugar for i32 | null, zero-value = null', () => {
      const c = run(`
        let x?: i32
        x
      `)
      expect(c).toBe('null')
    })

    test('let x?: i32 = 5; → explicit init', () => {
      const c = run(`
        let x?: i32 = 5
        x
      `)
      expect(c).toBe('5')
    })

    test('let x?: boolean; → sugar for boolean | null, zero-value = null', () => {
      const c = run(`
        let x?: boolean
        x
      `)
      expect(c).toBe('null')
    })
  })

  describe('6.2. T | null — явный nullable', () => {
    test('let x: i32 | null; → nullable, zero-value = null', () => {
      const c = run(`
        let x: i32 | null
        x
      `)
      expect(c).toBe('null')
    })

    test('let x: i32 | null = 5; → explicit init', () => {
      const c = run(`
        let x: i32 | null = 5
        x
      `)
      expect(c).toBe('5')
    })
  })

  describe('6.3. Non-nullable по умолчанию', () => {
    test('let x: string; → non-nullable, zero-value = "" (NOT null)', () => {
      const c = run(`
        let x: string
        x
      `)
      expect(c).toBe('')
    })

    test('x = null для let x: string → compile error (string non-nullable)', () => {
      expect(() => run(`
        let x: string = "hello"
        x = null
      `)).toThrow()
    })

    test('x = null для let x: i32 → compile error (i32 non-nullable)', () => {
      expect(() => run(`
        let x: i32 = 5
        x = null
      `)).toThrow()
    })

    test('x = null для let x: boolean → compile error (boolean non-nullable)', () => {
      expect(() => run(`
        let x: boolean = true
        x = null
      `)).toThrow()
    })
  })
})
