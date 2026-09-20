import { describe, test, run, expect } from "@tslang/test-engine"

describe('02-syntax/02-formatting — длина строки', () => {
  test('короткая строка', () => {
    const result = run(`
      const x = 1
      console.log(x)
    `)
    expect(result).toBe('1')
  })

  test('длинная строка (>120 символов)', () => {
    const result = run(`
      const veryLongVariableNameThatExceedsRecommendedLineLength = 123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890
      console.log(veryLongVariableNameThatExceedsRecommendedLineLength)
    `)
    expect(result).toBe('123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890')
  })
})
