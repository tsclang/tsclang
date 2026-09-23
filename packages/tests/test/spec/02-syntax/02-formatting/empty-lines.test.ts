import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — пустые строки', () => {
  test('одна пустая строка между функциями', () => {
    const result = run(`
      function foo(): void {
        console.log("foo")
      }

      function bar(): void {
        console.log("bar")
      }

      foo()
      bar()
    `)
    expect(result).toBe('foo\nbar')
  })

  test('две пустые строки', () => {
    const result = run(`
      function foo(): void {
        console.log("foo")
      }


      function bar(): void {
        console.log("bar")
      }

      foo()
      bar()
    `)
    expect(result).toBe('foo\nbar')
  })
})
