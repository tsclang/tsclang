import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — тернарный оператор', () => {
  test('инлайн', () => {
    const result = run(`
      const isOk = true
      const label = isOk ? "yes" : "no"
      console.log(label)
    `)
    expect(result).toBe('yes')
  })

  test('многострочный', () => {
    const result = run(`
      const isOk = true
      const message = isOk
          ? "operation succeeded"
          : "operation failed"
      console.log(message)
    `)
    expect(result).toBe('operation succeeded')
  })
})
