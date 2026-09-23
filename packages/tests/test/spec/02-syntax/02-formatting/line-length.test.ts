import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — длина строки', () => {
  test('короткая строка', () => {
    const result = run(`
      const x = 1
      console.log(x)
    `)
    expect(result).toBe('1')
  })

  test('длинная строка (>120 символов)', () => {
    // JS: литерал → double, вывод в shortest round-trip виде.
    // KNOWN BUG (runtime): tsc_dtoa печатает 16 значащих цифр
    // вместо 17 (shortest round-trip как в JS).
    const result = run(`
      const veryLongVariableNameThatExceedsRecommendedLineLength = 123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890
      console.log(veryLongVariableNameThatExceedsRecommendedLineLength)
    `)
    expect(result).toBe('1.2345678901234568e+89')
  })
})
