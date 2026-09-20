import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — pointer-types', () => {
  describe('12.1. Arc<T> — zero-value = NULL', () => {
    test('let x: Arc<Foo>; → zero-value = NULL', () => {
      const c = run(`
        class Foo {}
        let x: Arc<Foo>
        x
      `)
      expect(c).toBe('null')
    })

    test('let x: Arc<Foo> = new Arc<Foo>(foo); → OK', () => {
      const c = run(`
        class Foo {}
        let x: Arc<Foo> = new Arc<Foo>(new Foo())
        x
      `)
      expect(c).toBe('Arc<Foo>')
    })
  })

  describe('12.2. Weak<T> — zero-value = NULL', () => {
    test('let x: Weak<Foo>; → zero-value = NULL', () => {
      const c = run(`
        class Foo {}
        let x: Weak<Foo>
        x
      `)
      expect(c).toBe('null')
    })

    test('let x: Weak<Foo> = new Weak<Foo>(foo); → OK', () => {
      const c = run(`
        class Foo {}
        let x: Weak<Foo> = new Weak<Foo>(new Foo())
        x
      `)
      expect(c).toBe('Weak<Foo>')
    })
  })

  describe('12.3. Closure — zero-value = NULL', () => {
    test('let x: () => void; → zero-value = NULL', () => {
      const c = run(`
        let x: () => void
        x
      `)
      expect(c).toBe('null')
    })
  })
})
