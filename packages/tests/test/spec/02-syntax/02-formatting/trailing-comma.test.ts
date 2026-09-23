import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — trailing comma', () => {
  test('в объекте', () => {
    const result = run(`
      const obj = { a: 1, b: 2, }
      console.log(obj.a + obj.b)
    `)
    expect(result).toBe('3')
  })

  test('в массиве', () => {
    const result = run(`
      const arr = [1, 2, 3,]
      console.log(arr[0] + arr[1])
    `)
    expect(result).toBe('3')
  })

  test('в параметрах функции', () => {
    const result = run(`
      function foo(x: i32, y: i32,) {
        return x + y
      }
      console.log(foo(1, 2,))
    `)
    expect(result).toBe('3')
  })
})
