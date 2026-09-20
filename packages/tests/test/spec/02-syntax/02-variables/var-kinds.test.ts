import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — var-kinds', () => {
  describe('1.1. let — мутабельная переменная', () => {
    test('let — переприсвоение разрешено', () => {
      const result = run(`
        let x: i32 = 5
        x = 10
        console.log(x)
      `)
      expect(result).toBe('10')
    })

    test('let — можно вызывать mut методы', () => {
      const result = run(`
        class Foo {
          mut bar(): i32 { return 42 }
        }
        let f = new Foo()
        console.log(f.bar())
      `)
      expect(result).toBe('42')
    })

    test('let — можно передавать как Mut<T>', () => {
      const result = run(`
        fn takeMut(_m: Mut<i32>): i32 { return 0 }
        let x: i32 = 5
        console.log(takeMut(x))
      `)
      expect(result).toBe('0')
    })
  })

  describe('1.2. const — иммутабельная переменная', () => {
    test('const — переприсвоение запрещено (compile error)', () => {
      expect(() => run(`
        const x: i32 = 5
        x = 10
      `)).toThrow()
    })

    test('const — нельзя вызывать mut методы (compile error)', () => {
      expect(() => run(`
        class Foo {
          mut bar(): i32 { return 42 }
        }
        const f = new Foo()
        f.bar()
      `)).toThrow()
    })

    test('const — нельзя передать как Mut<T> (compile error)', () => {
      expect(() => run(`
        fn takeMut(_m: Mut<i32>): i32 { return 0 }
        const x: i32 = 5
        takeMut(x)
      `)).toThrow()
    })
  })

  describe('1.3. var — синоним let', () => {
    test('var — работает как let (переприсвоение разрешено)', () => {
      const result = run(`
        var x: i32 = 5
        x = 10
        console.log(x)
      `)
      expect(result).toBe('10')
    })

    test('var — можно вызывать mut методы', () => {
      const result = run(`
        class Foo {
          mut bar(): i32 { return 42 }
        }
        var f = new Foo()
        console.log(f.bar())
      `)
      expect(result).toBe('42')
    })
  })
})
