import { describe, test, run, expect } from "@tslang/test-engine"

describe('02-syntax/02-formatting — открывающая скобка', () => {
  test('K&R стиль', () => {
    const result = run(`
      function foo(): void {
        console.log("ok")
      }
      foo()
    `)
    expect(result).toBe('ok')
  })

  test('Скобка на новой строке', () => {
    const result = run(`
      function bar(): void
      {
        console.log("ok")
      }
      bar()
    `)
    expect(result).toBe('ok')
  })
})
