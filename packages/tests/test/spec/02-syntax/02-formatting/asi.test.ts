import { describe, test, run, expect } from "@tslang/test-engine"

describe('02-syntax/02-formatting — ASI', () => {
  describe('2.1. Символы, которые интерпретируются как продолжение выражения', () => {
    test('[ на новой строке — индекс (ошибка)', () => {
      let threw = false
      try { run(`
        const a = 1
        [1, 2].forEach(x => console.log(x))
      `) } catch { threw = true }
      expect(threw).toBe(true)
    })

    test('[ на новой строке — с ; разделяет', () => {
      const result = run(`
        const a = 1;
        [1, 2].forEach(x => console.log(x))
      `)
      expect(result).toBe('1')
    })

    test('( на новой строке — вызов (ошибка)', () => {
      let threw = false
      try { run(`
        const a = 1
        (2 + 3)
      `) } catch { threw = true }
      expect(threw).toBe(true)
    })

    test('( на новой строке — с ; разделяет', () => {
      const result = run(`
        const a = 1;
        (2 + 3)
      `)
      expect(result).toBe('1')
    })

    test('Template literal на новой строке (ошибка)', () => {
      let threw = false
      try { run(`
        const a = 1
        \`hello\`
      `) } catch { threw = true }
      expect(threw).toBe(true)
    })

    test('Template literal на новой строке — с ; разделяет', () => {
      const result = run(`
        const a = 1;
        \`hello\`
      `)
      expect(result).toBe('1')
    })

    test('+ на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 2
        + 3
        console.log(a)
      `)
      expect(result).toBe('5')
    })

    test('- на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 10
        - 3
        console.log(a)
      `)
      expect(result).toBe('7')
    })

    test('* на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 5
        * 2
        console.log(a)
      `)
      expect(result).toBe('10')
    })

    test('/ на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 10
        / 2
        console.log(a)
      `)
      expect(result).toBe('5')
    })

    test('% на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 10
        % 3
        console.log(a)
      `)
      expect(result).toBe('1')
    })

    test('. на новой строке — chain access', () => {
      const result = run(`
        const obj = {a: 1, b: 2, c: 3}
        const x = obj
        .c
        console.log(x)
      `)
      expect(result).toBe('3')
    })

    test('++ на новой строке', () => {
      const result = run(`
        let a = 5
        ++
        console.log(a)
      `)
      expect(result).toBe('6')
    })

    test('-- на новой строке', () => {
      const result = run(`
        let a = 5
        --
        console.log(a)
      `)
      expect(result).toBe('4')
    })
  })

  test('Унарные операторы требуют ;', () => {
    const result = run(`
      const a = 2;
      +3
      console.log(a)
    `)
    expect(result).toBe('2')
  })
})
