import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — enum-init', () => {
  describe('3.1. Enum требует явной инициализации', () => {
    test('let x: Enum; → compile error', () => {
      expect(() => run(`
        enum Color { Red, Green, Blue }
        let x: Color
      `)).toThrow()
    })

    test('let x: Enum = Enum.Value; → OK', () => {
      const c = run(`
        enum Color { Red, Green, Blue }
        let x: Color = Color.Red
        console.log(x)
      `)
      expect(c).toBe('0')
    })

    test('let x?: Enum; → OK (sugar for Color | null, zero-value = null)', () => {
      const c = run(`
        enum Color { Red, Green, Blue }
        let x?: Color
        console.log(x)
      `)
      expect(c).toBe('0')
    })

    test('Enum с дырками (A=5, B=10) → compile error без инициализатора', () => {
      expect(() => run(`
        enum E { A = 5, B = 10 }
        let x: E
      `)).toThrow()
    })

    test('Enum с дырками — явная инициализация OK', () => {
      const c = run(`
        enum E { A = 5, B = 10 }
        let x: E = E.A
        console.log(x)
      `)
      expect(c).toBe('5')
    })
  })
})
