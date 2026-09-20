import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — zero-values', () => {
  describe('2.1. Целые числа — zero-value = 0', () => {
    test('i32 без инициализатора → C: = 0;', () => {
      const c = run(`
        let x: i32
        x
      `)
      expect(c).toBe('0')
    })

    test('i64 без инициализатора → C: = 0;', () => {
      const c = run(`
        let x: i64
        x
      `)
      expect(c).toBe('0')
    })

    test('u32 без инициализатора → C: = 0;', () => {
      const c = run(`
        let x: u32
        x
      `)
      expect(c).toBe('0')
    })

    test('u64 без инициализатора → C: = 0;', () => {
      const c = run(`
        let x: u64
        x
      `)
      expect(c).toBe('0')
    })
  })

  describe('2.2. Дробные — zero-value = 0.0', () => {
    test('f64 без инициализатора → C: = 0.0;', () => {
      const c = run(`
        let x: f64
        x
      `)
      expect(c).toBe('0')
    })

    test('f32 без инициализатора → C: = 0.0;', () => {
      const c = run(`
        let x: f32
        x
      `)
      expect(c).toBe('0')
    })
  })

  describe('2.3. boolean — zero-value = false', () => {
    test('boolean без инициализатора → C: = false;', () => {
      const c = run(`
        let x: boolean
        x
      `)
      expect(c).toBe('false')
    })
  })

  describe('2.4. string — zero-value = ""', () => {
    test('string без инициализатора → C: = STR_LIT("");', () => {
      const c = run(`
        let x: string
        x
      `)
      expect(c).toBe('')
    })
  })

  describe('2.5. opt_T — zero-value = null', () => {
    test('opt_T без инициализатора → C: = {false, 0};', () => {
      const c = run(`
        let x: i32 | null
        x
      `)
      expect(c).toBe('null')
    })

    test('opt string без инициализатора → null', () => {
      const c = run(`
        let x: string | null
        x
      `)
      expect(c).toBe('null')
    })
  })

  describe('2.6. Smart pointers — zero-value = NULL', () => {
    test('Arc<T> без инициализатора → NULL', () => {
      const c = run(`
        class Foo {}
        let x: Arc<Foo>
        x
      `)
      expect(c).toBe('null')
    })

    test('Weak<T> без инициализатора → NULL', () => {
      const c = run(`
        class Foo {}
        let x: Weak<Foo>
        x
      `)
      expect(c).toBe('null')
    })
  })
})
