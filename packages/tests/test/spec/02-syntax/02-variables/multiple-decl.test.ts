import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — multiple-decl', () => {
  describe('5.1. let — несколько переменных', () => {
    test('let a = 1, b = 2, c = 3; — три переменные без типа', () => {
      const c = run(`
        let a = 1, b = 2, c = 3
        a + b + c
      `)
      expect(c).toBe('6')
    })

    test('let x: i32 = 1, y: string = "hi"; — разные типы', () => {
      const result = run(`
        let x: i32 = 1, y: string = "hi"
        y
      `)
      expect(result).toBe('hi')
    })

    test('let p = 1, q: f64, r = "three"; — смешанный', () => {
      const c = run(`
        let p = 1, q: f64, r = "three"
        p
      `)
      expect(c).toBe('1')
    })

    test('let p = 1, q: f64, r = "three"; — q = 0.0', () => {
      const c = run(`
        let p = 1, q: f64, r = "three"
        q
      `)
      expect(c).toBe('0')
    })
  })

  describe('5.2. const — несколько переменных', () => {
    test('const PI = 3.14, E = 2.71; — const group', () => {
      const c = run(`
        const PI = 3.14, E = 2.71
        PI
      `)
      expect(c).toBe('3.14')
    })

    test('const — переприсвоение запрещено для всех', () => {
      expect(() => run(`
        const PI = 3.14, E = 2.71
        PI = 1
      `)).toThrow()
    })
  })

  describe('5.3. Destructuring + comma', () => {
    test('let {a, b} = obj, c = 5; — destructuring + comma', () => {
      const c = run(`
        let obj = { a: 10, b: 20 }
        let {a, b} = obj, c = 5
        a + b + c
      `)
      expect(c).toBe('35')
    })

    test('let {a, b} = obj, [x, y] = arr; — несколько destructuring', () => {
      const c = run(`
        let obj = { a: 10, b: 20 }
        let arr = [30, 40]
        let {a, b} = obj, [x, y] = arr
        a + b + x + y
      `)
      expect(c).toBe('100')
    })
  })
})
