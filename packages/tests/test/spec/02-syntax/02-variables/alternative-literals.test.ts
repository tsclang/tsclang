import { describe, test, run, expect } from "../../../../../test-engine/src/engine.ts"

describe('02-syntax/02-variables — alternative-literals', () => {
  describe('9.1. Hexadecimal literals', () => {
    test('let x: i8 = 0x0F; → 15, OK', () => {
      const c = run(`
        let x: i8 = 0x0F
        console.log(x)
      `)
      expect(c).toBe('15')
    })

    test('let x: i8 = 0x7F; → 127 (max), OK', () => {
      const c = run(`
        let x: i8 = 0x7F
        console.log(x)
      `)
      expect(c).toBe('127')
    })

    test('let x: i32 = 0x7FFFFFFF; → max, OK', () => {
      const c = run(`
        let x: i32 = 0x7FFFFFFF
        console.log(x)
      `)
      expect(c).toBe('2147483647')
    })

    test('let x: u32 = 0xFFFFFFFF; → max, OK', () => {
      const c = run(`
        let x: u32 = 0xFFFFFFFF
        console.log(x)
      `)
      expect(c).toBe('4294967295')
    })

    test('let x: u64 = 0xFFFFFFFFFFFFF; → OK', () => {
      const c = run(`
        let x: u64 = 0xFFFFFFFFFFFFF
        console.log(x)
      `)
      expect(c).toBe('4503599627370495')
    })

    test('let x: u8 = 0xFF; → 255 (max), OK', () => {
      const c = run(`
        let x: u8 = 0xFF
        console.log(x)
      `)
      expect(c).toBe('255')
    })
  })

  describe('9.2. Binary literals', () => {
    test('let x: i8 = 0b1001; → 9, OK', () => {
      const c = run(`
        let x: i8 = 0b1001
        console.log(x)
      `)
      expect(c).toBe('9')
    })

    test('let x: u8 = 0b11111111; → 255 (max), OK', () => {
      const c = run(`
        let x: u8 = 0b11111111
        console.log(x)
      `)
      expect(c).toBe('255')
    })

    test('let x: u16 = 0b1000000000000000; → 32768, OK', () => {
      const c = run(`
        let x: u16 = 0b1000000000000000
        console.log(x)
      `)
      expect(c).toBe('32768')
    })
  })

  describe('9.3. Octal literals', () => {
    test('let x: i8 = 0o17; → 15, OK', () => {
      const c = run(`
        let x: i8 = 0o17
        console.log(x)
      `)
      expect(c).toBe('15')
    })

    test('let x: u8 = 0o377; → 255 (max), OK', () => {
      const c = run(`
        let x: u8 = 0o377
        console.log(x)
      `)
      expect(c).toBe('255')
    })

    test('let x: u16 = 0o177777; → 65535 (max), OK', () => {
      const c = run(`
        let x: u16 = 0o177777
        console.log(x)
      `)
      expect(c).toBe('65535')
    })
  })
})
