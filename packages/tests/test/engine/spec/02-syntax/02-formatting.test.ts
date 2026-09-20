import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting', () => {
  describe('ASI (automatic semicolon insertion)', () => {
    test('ASI: + on new line is binary operator', () => {
      const result = run(`
        const a = 1
        + 2
        console.log(a)
      `)
      expect(result).toBe('3')
    })

    test('ASI: * on new line is binary operator', () => {
      const result = run(`
        const a = 5
        * 2
        console.log(a)
      `)
      expect(result).toBe('10')
    })

    test('ASI: / on new line is binary operator', () => {
      const result = run(`
        const a = 10
        / 2
        console.log(a)
      `)
      expect(result).toBe('5')
    })

    test('ASI: . on new line is chain access', () => {
      const result = run(`
        const obj = {a: 1, b: 2, c: 3}
        const x = obj
        .c
        console.log(x)
      `)
      expect(result).toBe('3')
    })

    test('ASI: [ on new line is index (error)', () => {
      // [ on new line should NOT insert semicolon — it's index
      // This should fail compilation
      expect(() => run(`
        const a = 1
        [1, 2].forEach(x => console.log(x))
      `)).toThrow()
    })

    test('ASI: ( on new line is call (error)', () => {
      // ( on new line should NOT insert semicolon
      expect(() => run(`
        const a = 1
        (2 + 3)
      `)).toThrow()
    })
  })

  describe('semicolon-optional', () => {
    test('no semicolons', () => {
      const result = run(`
        const x = 42
        console.log(x)
      `)
      expect(result).toBe('42')
    })

    test('with semicolons', () => {
      const result = run(`
        const x = 42;
        console.log(x);
      `)
      expect(result).toBe('42')
    })

    test('mixed semicolons', () => {
      const result = run(`
        const x = 1;
        const y = 2
        console.log(x + y)
      `)
      expect(result).toBe('3')
    })
  })

  describe('trailing comma', () => {
    test('trailing comma in object', () => {
      const result = run(`
        const obj = { a: 1, b: 2, }
        console.log(obj.a + obj.b)
      `)
      expect(result).toBe('3')
    })

    test('trailing comma in array', () => {
      const result = run(`
        const arr = [1, 2, 3,]
        console.log(arr[0] + arr[1])
      `)
      expect(result).toBe('3')
    })

    test('trailing comma in function params', () => {
      const result = run(`
        function foo(a: i32, b: i32,) {
          return a + b
        }
        console.log(foo(1, 2,))
      `)
      expect(result).toBe('3')
    })
  })
})
