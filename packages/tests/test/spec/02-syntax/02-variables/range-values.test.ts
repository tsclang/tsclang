import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — range-values', () => {
  describe('8.1. i8 — min=-128, max=127', () => {
    test('i8: = -128 (min) → OK', () => {
      const c = run(`
        let x: i8 = -128
        x
      `)
      expect(c).toBe('-128')
    })

    test('i8: = 127 (max) → OK', () => {
      const c = run(`
        let x: i8 = 127
        x
      `)
      expect(c).toBe('127')
    })

    test('i8: = -129 (out of range) → compile error', () => {
      expect(() => run(`
        let x: i8 = -129
      `)).toThrow()
    })

    test('i8: = 128 (out of range) → compile error', () => {
      expect(() => run(`
        let x: i8 = 128
      `)).toThrow()
    })

    test('i8: = 0 → OK', () => {
      const c = run(`
        let x: i8 = 0
        x
      `)
      expect(c).toBe('0')
    })

    test('i8: = 1 → OK', () => {
      const c = run(`
        let x: i8 = 1
        x
      `)
      expect(c).toBe('1')
    })
  })

  describe('8.2. i16 — min=-32768, max=32767', () => {
    test('i16: = -32768 (min) → OK', () => {
      const c = run(`
        let x: i16 = -32768
        x
      `)
      expect(c).toBe('-32768')
    })

    test('i16: = 32767 (max) → OK', () => {
      const c = run(`
        let x: i16 = 32767
        x
      `)
      expect(c).toBe('32767')
    })

    test('i16: = -32769 (out of range) → compile error', () => {
      expect(() => run(`
        let x: i16 = -32769
      `)).toThrow()
    })

    test('i16: = 32768 (out of range) → compile error', () => {
      expect(() => run(`
        let x: i16 = 32768
      `)).toThrow()
    })
  })

  describe('8.3. i32 — min=-2147483648, max=2147483647', () => {
    test('i32: = -2147483648 (min) → OK', () => {
      const c = run(`
        let x: i32 = -2147483648
        x
      `)
      expect(c).toBe('-2147483648')
    })

    test('i32: = 2147483647 (max) → OK', () => {
      const c = run(`
        let x: i32 = 2147483647
        x
      `)
      expect(c).toBe('2147483647')
    })

    test('i32: = -2147483649 (out of range) → compile error', () => {
      expect(() => run(`
        let x: i32 = -2147483649
      `)).toThrow()
    })

    test('i32: = 2147483648 (out of range) → compile error', () => {
      expect(() => run(`
        let x: i32 = 2147483648
      `)).toThrow()
    })
  })

  describe('8.4. i64 — min=MIN_SAFE_INTEGER, max=MAX_SAFE_INTEGER', () => {
    test('i64: = Number.MIN_SAFE_INTEGER (min) → OK', () => {
      const c = run(`
        let x: i64 = Number.MIN_SAFE_INTEGER
        x
      `)
      expect(c).toBe('-9007199254740991')
    })

    test('i64: = Number.MAX_SAFE_INTEGER (max) → OK', () => {
      const c = run(`
        let x: i64 = Number.MAX_SAFE_INTEGER
        x
      `)
      expect(c).toBe('9007199254740991')
    })
  })

  describe('8.5. u8 — min=0, max=255', () => {
    test('u8: = 0 (min) → OK', () => {
      const c = run(`
        let x: u8 = 0
        x
      `)
      expect(c).toBe('0')
    })

    test('u8: = 255 (max) → OK', () => {
      const c = run(`
        let x: u8 = 255
        x
      `)
      expect(c).toBe('255')
    })

    test('u8: = 256 (out of range) → compile error', () => {
      expect(() => run(`
        let x: u8 = 256
      `)).toThrow()
    })

    test('u8: = -1 (negative unsigned) → compile error', () => {
      expect(() => run(`
        let x: u8 = -1
      `)).toThrow()
    })
  })

  describe('8.6. u16 — min=0, max=65535', () => {
    test('u16: = 0 (min) → OK', () => {
      const c = run(`
        let x: u16 = 0
        x
      `)
      expect(c).toBe('0')
    })

    test('u16: = 65535 (max) → OK', () => {
      const c = run(`
        let x: u16 = 65535
        x
      `)
      expect(c).toBe('65535')
    })

    test('u16: = 65536 (out of range) → compile error', () => {
      expect(() => run(`
        let x: u16 = 65536
      `)).toThrow()
    })

    test('u16: = -1 (negative unsigned) → compile error', () => {
      expect(() => run(`
        let x: u16 = -1
      `)).toThrow()
    })
  })

  describe('8.7. u32 — min=0, max=4294967295', () => {
    test('u32: = 0 (min) → OK', () => {
      const c = run(`
        let x: u32 = 0
        x
      `)
      expect(c).toBe('0')
    })

    test('u32: = 4294967295 (max) → OK', () => {
      const c = run(`
        let x: u32 = 4294967295
        x
      `)
      expect(c).toBe('4294967295')
    })

    test('u32: = 4294967296 (out of range) → compile error', () => {
      expect(() => run(`
        let x: u32 = 4294967296
      `)).toThrow()
    })

    test('u32: = -1 (negative unsigned) → compile error', () => {
      expect(() => run(`
        let x: u32 = -1
      `)).toThrow()
    })
  })

  describe('8.8. u64 — min=0, max=MAX_SAFE_INTEGER', () => {
    test('u64: = 0 (min) → OK', () => {
      const c = run(`
        let x: u64 = 0
        x
      `)
      expect(c).toBe('0')
    })

    test('u64: = Number.MAX_SAFE_INTEGER (max) → OK', () => {
      const c = run(`
        let x: u64 = Number.MAX_SAFE_INTEGER
        x
      `)
      expect(c).toBe('9007199254740991')
    })
  })

  describe('8.9. d8 — min=-1.27, max=1.27', () => {
    test('d8: = 0 → OK', () => {
      const c = run(`
        let x: d8 = 0
        x
      `)
      expect(c).toBe('0')
    })

    test('d8: = 1.27 (max) → OK', () => {
      const c = run(`
        let x: d8 = 1.27
        x
      `)
      expect(c).toBe('1.27')
    })

    test('d8: = -1.27 (min) → OK', () => {
      const c = run(`
        let x: d8 = -1.27
        x
      `)
      expect(c).toBe('-1.27')
    })

    test('d8: = 1.28 (out of range) → compile error', () => {
      expect(() => run(`
        let x: d8 = 1.28
      `)).toThrow()
    })

    test('d8: = -1.29 (out of range) → compile error', () => {
      expect(() => run(`
        let x: d8 = -1.29
      `)).toThrow()
    })
  })

  describe('8.10. d16 — min=-327.67, max=327.67', () => {
    test('d16: = 327.67 (max) → OK', () => {
      const c = run(`
        let x: d16 = 327.67
        x
      `)
      expect(c).toBe('327.67')
    })

    test('d16: = -327.67 (min) → OK', () => {
      const c = run(`
        let x: d16 = -327.67
        x
      `)
      expect(c).toBe('-327.67')
    })

    test('d16: = 327.68 (out of range) → compile error', () => {
      expect(() => run(`
        let x: d16 = 327.68
      `)).toThrow()
    })

    test('d16: = -327.69 (out of range) → compile error', () => {
      expect(() => run(`
        let x: d16 = -327.69
      `)).toThrow()
    })
  })

  describe('8.11. d32 — min=-214748.3647, max=214748.3647', () => {
    test('d32: = 214748.3647 (max) → OK', () => {
      const c = run(`
        let x: d32 = 214748.3647
        x
      `)
      expect(c).toBe('214748.3647')
    })

    test('d32: = -214748.3647 (min) → OK', () => {
      const c = run(`
        let x: d32 = -214748.3647
        x
      `)
      expect(c).toBe('-214748.3647')
    })

    test('d32: = 214748.3648 (out of range) → compile error', () => {
      expect(() => run(`
        let x: d32 = 214748.3648
      `)).toThrow()
    })
  })

  describe('8.12. d64 — min=-92233720368.54775808, max=92233720368.54775807', () => {
    test('d64: = 0 → OK', () => {
      const c = run(`
        let x: d64 = 0
        x
      `)
      expect(c).toBe('0')
    })

    test('d64: = 1.5 → OK', () => {
      const c = run(`
        let x: d64 = 1.5
        x
      `)
      expect(c).toBe('1.5')
    })
  })

  describe('8.13. f32 — Infinity, -Infinity, NaN', () => {
    test('f32: = Infinity → OK', () => {
      const c = run(`
        let x: f32 = Infinity
        x
      `)
      expect(c).toBe('Infinity')
    })

    test('f32: = -Infinity → OK', () => {
      const c = run(`
        let x: f32 = -Infinity
        x
      `)
      expect(c).toBe('-Infinity')
    })

    test('f32: = NaN → OK', () => {
      const c = run(`
        let x: f32 = NaN
        x
      `)
      expect(c).toBe('NaN')
    })
  })

  describe('8.14. f64 — Infinity, -Infinity, NaN', () => {
    test('f64: = Infinity → OK', () => {
      const c = run(`
        let x: f64 = Infinity
        x
      `)
      expect(c).toBe('Infinity')
    })

    test('f64: = -Infinity → OK', () => {
      const c = run(`
        let x: f64 = -Infinity
        x
      `)
      expect(c).toBe('-Infinity')
    })

    test('f64: = NaN → OK', () => {
      const c = run(`
        let x: f64 = NaN
        x
      `)
      expect(c).toBe('NaN')
    })
  })
})
