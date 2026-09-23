import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — generics', () => {
  test('без пробелов', () => {
    const result = run(`
      const arr: Array<i32> = [1, 2, 3]
      console.log(arr[0] + arr[1])
    `)
    expect(result).toBe('3')
  })

  test('с пробелами', () => {
    const result = run(`
      const arr: Array< i32 > = [1, 2, 3]
      console.log(arr[0] + arr[1])
    `)
    expect(result).toBe('3')
  })
})
