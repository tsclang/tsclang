import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting — перенос строки', () => {
  test('массив с переносами', () => {
    const result = run(`
      const arr = [
        1,
        2,
        3,
      ]
      console.log(arr[0] + arr[1] + arr[2])
    `)
    expect(result).toBe('6')
  })

  test('объект с переносами значений', () => {
    const result = run(`
      const obj = {
        a: 1,
        b: 2,
        c: 3,
      }
      console.log(obj.a + obj.b + obj.c)
    `)
    expect(result).toBe('6')
  })

  test('объект с переносами ключей и значений', () => {
    const result = run(`
      const obj = {
        a
        : 1,
        b
        : 2,
        c
        : 3,
      }
      console.log(obj.a + obj.b + obj.c)
    `)
    expect(result).toBe('6')
  })

  test('объект с хаотичными переносами', () => {
    const result = run(`
      const obj = {a
      :1
      ,
      b
        :
          2
      ,c:3

        }
      console.log(obj.a + obj.b + obj.c)
    `)
    expect(result).toBe('6')
  })

  test('функция с переносами аргументов', () => {
    const result = run(`
      function foo(
          x: i32,
          y: i32,
          z: i32,
      ) {
        return x + y + z
      }
      console.log(foo(1, 2, 3))
    `)
    expect(result).toBe('6')
  })

  test('вызов функции с переносами', () => {
    const result = run(`
      console.log(
        1,
        2,
        3
      )
    `)
    expect(result).toBe('1 2 3')
  })

  test('вложенные скобки с переносами', () => {
    // KNOWN BUG (codegen): поле анонимного объекта-литерала с типом массив —
    // typedef Array_f64 не эмитится (_ensureArray не вызывается для полей
    // анонимных структур) → gcc: unknown type name 'Array_f64'.
    const result = run(`
      const obj = {
        arr: [
          1,
          2,
        ],
      }
      console.log(obj.arr[0] + obj.arr[1])
    `)
    expect(result).toBe('3')
  })

  test('перенос внутри выражения', () => {
    const result = run(`
      const result = (
          1
          + 2
          * 3
      )
      console.log(result)
    `)
    expect(result).toBe('7')
  })

  test('перенос после бинарного оператора', () => {
    const result = run(`
      const a = 1, b = 2, c = 3
      const val = a
          + b
          + c
      console.log(val)
    `)
    expect(result).toBe('6')
  })
})
