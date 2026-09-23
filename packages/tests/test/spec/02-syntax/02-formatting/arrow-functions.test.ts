import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — стрелочные функции', () => {
  test('с аннотациями (скобки обязательны)', () => {
    const result = run(`
      const f = (x: i32): i32 => x + 1
      console.log(f(5))
    `)
    expect(result).toBe('6')
  })

  test('без аннотаций (скобки опциональны)', () => {
    // KNOWN BUG (codegen): нетипизированный параметр лямбды получает
    // сигнатуру (double (*)(void *)) — тело пишет return x + 1 по void*.
    const result = run(`
      const f = x => x + 1
      console.log(f(5))
    `)
    expect(result).toBe('6')
  })

  test('скобки всегда ok', () => {
    // KNOWN BUG (codegen): аналогично — нетипизированный параметр лямбды.
    const result = run(`
      const f = (x) => x + 1
      console.log(f(5))
    `)
    expect(result).toBe('6')
  })
})
