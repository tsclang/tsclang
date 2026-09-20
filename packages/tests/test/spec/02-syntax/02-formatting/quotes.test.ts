import { describe, test, run, expect } from "@tslang/test-engine"

describe('02-syntax/02-formatting — кавычки', () => {
  test('одинарные кавычки', () => {
    const result = run(`
      const a = 'hello'
      console.log(a)
    `)
    expect(result).toBe('hello')
  })

  test('двойные кавычки', () => {
    const result = run(`
      const a = "hello"
      console.log(a)
    `)
    expect(result).toBe('hello')
  })

  test('template literals', () => {
    const result = run(`
      const name = "world"
      const d = \`Hello, \${name}!\`
      console.log(d)
    `)
    expect(result).toBe('Hello, world!')
  })

  test('char literal', () => {
    const result = run(`
      const ch: u8 = 'A'
      console.log(ch)
    `)
    expect(result).toBe('65')
  })
})
