import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — invalid-values', () => {
  describe('10.1. Boolean как значение для числовых типов', () => {
    test('let x: i32 = true; → compile error', () => {
      expect(() => run(`
        let x: i32 = true
      `)).toThrow()
    })

    test('let x: i32 = false; → compile error', () => {
      expect(() => run(`
        let x: i32 = false
      `)).toThrow()
    })

    test('let x: u8 = true; → compile error', () => {
      expect(() => run(`
        let x: u8 = true
      `)).toThrow()
    })

    test('let x: f64 = true; → compile error', () => {
      expect(() => run(`
        let x: f64 = true
      `)).toThrow()
    })
  })

  describe('10.2. String как значение для числовых типов', () => {
    test('let x: i32 = "hello"; → compile error', () => {
      expect(() => run(`
        let x: i32 = "hello"
      `)).toThrow()
    })

    test('let x: u8 = "hello"; → compile error', () => {
      expect(() => run(`
        let x: u8 = "hello"
      `)).toThrow()
    })

    test('let x: f64 = "hello"; → compile error', () => {
      expect(() => run(`
        let x: f64 = "hello"
      `)).toThrow()
    })
  })

  describe('10.3. Числа/строки как значение для boolean', () => {
    test('let x: boolean = 42; → compile error', () => {
      expect(() => run(`
        let x: boolean = 42
      `)).toThrow()
    })

    test('let x: boolean = 0; → compile error', () => {
      expect(() => run(`
        let x: boolean = 0
      `)).toThrow()
    })

    test('let x: boolean = "hello"; → compile error', () => {
      expect(() => run(`
        let x: boolean = "hello"
      `)).toThrow()
    })

    test('let x: boolean = ""; → compile error', () => {
      expect(() => run(`
        let x: boolean = ""
      `)).toThrow()
    })
  })

  describe('10.4. Числа/boolean как значение для string', () => {
    test('let x: string = 42; → compile error', () => {
      expect(() => run(`
        let x: string = 42
      `)).toThrow()
    })

    test('let x: string = true; → compile error', () => {
      expect(() => run(`
        let x: string = true
      `)).toThrow()
    })

    test('let x: string = false; → compile error', () => {
      expect(() => run(`
        let x: string = false
      `)).toThrow()
    })
  })
})
