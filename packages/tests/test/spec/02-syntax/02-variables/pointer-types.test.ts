import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — pointer-types', () => {
  describe('12.1. Arc<T> — zero-value = NULL', () => {
    test('let x: Arc<Foo>; → zero-value = NULL (compiler bug: crash)', () => {
      expect(() => run(`
        class Foo {}
        let x: Arc<Foo>
        console.log(x)
      `)).toThrow()
    })

    test('let x: Arc<Foo> = new Arc<Foo>(foo); → OK', () => {
      const c = run(`
        class Foo {}
        let x: Arc<Foo> = new Arc<Foo>(new Foo())
        console.log(x)
      `)
      expect(c).toBe('1')
    })
  })

  describe('12.2. Weak<T> — zero-value = NULL', () => {
    test('let x: Weak<Foo>; → zero-value = NULL (compiler bug: crash)', () => {
      expect(() => run(`
        class Foo {}
        let x: Weak<Foo>
        console.log(x)
      `)).toThrow()
    })

    test('let x: Weak<Foo> = new Weak<Foo>(foo); → OK (compiler bug: deref error)', () => {
      expect(() => run(`
        class Foo {}
        let x: Weak<Foo> = new Weak<Foo>(new Foo())
        console.log(x)
      `)).toThrow()
    })
  })

  describe('12.3. Closure — zero-value = NULL', () => {
    test('let x: () => void; → zero-value = NULL (compiler bug: garbage)', () => {
      expect(() => run(`
        let x: () => void
        console.log(x)
      `)).toThrow()
    })
  })
})
