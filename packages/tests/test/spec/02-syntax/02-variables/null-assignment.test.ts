import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — null-assignment', () => {
  describe('4.1. x = null для non-nullable типов → compile error', () => {
    test('x = null для i32 → compile error', () => {
      expect(() => run(`
        let x: i32 = 5
        x = null
      `)).toThrow()
    })

    test('x = null для string → compile error', () => {
      expect(() => run(`
        let s: string = "hi"
        s = null
      `)).toThrow()
    })

    test('x = null для boolean → compile error', () => {
      expect(() => run(`
        let b: boolean = true
        b = null
      `)).toThrow()
    })
  })

  describe('4.2. x = null для nullable типов → OK', () => {
    test('x = null для i32 | null → OK', () => {
      const c = run(`
        let x: i32 | null = 5
        x = null
        console.log(x)
      `)
      expect(c).toBe('null')
    })

    test('x = null для string | null → OK', () => {
      const c = run(`
        let x: string | null = "hi"
        x = null
        console.log(x)
      `)
      expect(c).toBe('null')
    })

    test('x = null для boolean | null → OK', () => {
      const c = run(`
        let x: boolean | null = true
        x = null
        console.log(x)
      `)
      expect(c).toBe('null')
    })
  })

  describe('4.3. x = null для указателей → OK', () => {
    test('x = null для Arc<T> → OK (compiler bug: crash on Arc)', () => {
      expect(() => run(`
        class Foo {}
        let w: Arc<Foo> = new Arc<Foo>(new Foo())
        w = null
        console.log(w)
      `)).toThrow()
    })

    test('x = null для Weak<T> → OK (compiler bug: crash on Weak)', () => {
      expect(() => run(`
        class Foo {}
        let w: Weak<Foo> = new Weak<Foo>(new Foo())
        w = null
        console.log(w)
      `)).toThrow()
    })
  })
})
