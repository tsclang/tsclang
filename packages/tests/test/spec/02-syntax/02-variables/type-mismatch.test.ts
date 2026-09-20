import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — type-mismatch', () => {
  describe('7.1. Несовместимые типы при инициализации', () => {
    test('let x: i32 = "hello"; → compile error', () => {
      expect(() => run(`
        let x: i32 = "hello"
      `)).toThrow()
    })

    test('let x: string = 42; → compile error', () => {
      expect(() => run(`
        let x: string = 42
      `)).toThrow()
    })

    test('let x: boolean = 1; → compile error', () => {
      expect(() => run(`
        let x: boolean = 1
      `)).toThrow()
    })

    test('let x: boolean = "true"; → compile error', () => {
      expect(() => run(`
        let x: boolean = "true"
      `)).toThrow()
    })
  })

  describe('7.2. Float literal → integer type', () => {
    test('let x: i32 = 3.14; → compile error (fractional part)', () => {
      expect(() => run(`
        let x: i32 = 3.14
      `)).toThrow()
    })

    test('let x: i8 = 1.5; → compile error (fractional part)', () => {
      expect(() => run(`
        let x: i8 = 1.5
      `)).toThrow()
    })

    test('let x: u32 = 2.0; → compile error (float literal)', () => {
      expect(() => run(`
        let x: u32 = 2.0
      `)).toThrow()
    })

    test('let x: i64 = 2; → OK (integer literal)', () => {
      const c = run(`
        let x: i64 = 2
        x
      `)
      expect(c).toBe('2')
    })
  })

  describe('7.3. Out of range — целые типы', () => {
    test('let x: i8 = 256; → compile error (overflow)', () => {
      expect(() => run(`
        let x: i8 = 256
      `)).toThrow()
    })

    test('let x: i8 = -129; → compile error (underflow)', () => {
      expect(() => run(`
        let x: i8 = -129
      `)).toThrow()
    })

    test('let x: u8 = -1; → compile error (negative unsigned)', () => {
      expect(() => run(`
        let x: u8 = -1
      `)).toThrow()
    })

    test('let x: u8 = 256; → compile error (overflow)', () => {
      expect(() => run(`
        let x: u8 = 256
      `)).toThrow()
    })

    test('let x: i32 = 2147483648; → compile error (overflow)', () => {
      expect(() => run(`
        let x: i32 = 2147483648
      `)).toThrow()
    })

    test('let x: i32 = -2147483649; → compile error (underflow)', () => {
      expect(() => run(`
        let x: i32 = -2147483649
      `)).toThrow()
    })
  })

  describe('7.4. Out of range — decimal fixed-point', () => {
    test('let x: d8 = 1.28; → compile error (out of range)', () => {
      expect(() => run(`
        let x: d8 = 1.28
      `)).toThrow()
    })

    test('let x: d8 = -1.29; → compile error (out of range)', () => {
      expect(() => run(`
        let x: d8 = -1.29
      `)).toThrow()
    })

    test('let x: d16 = 327.68; → compile error (out of range)', () => {
      expect(() => run(`
        let x: d16 = 327.68
      `)).toThrow()
    })

    test('let x: d32 = 214748.3648; → compile error (out of range)', () => {
      expect(() => run(`
        let x: d32 = 214748.3648
      `)).toThrow()
    })
  })
})
