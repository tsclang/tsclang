import { describe, test, run, expect } from "@tsclang/test-engine"

describe('02-syntax/02-formatting', () => {

  // =========================================================================
  // 1. Точки с запятой
  // =========================================================================

  describe('1. Точки с запятой', () => {
    test('1.1. Без точек с запятой', () => {
      const result = run(`
        const x = 1
        const y = 2
        console.log(x + y)
      `)
      expect(result).toBe('3')
    })

    test('1.2. С точками с запятой', () => {
      const result = run(`
        const x = 1;
        const y = 2;
        console.log(x + y);
      `)
      expect(result).toBe('3')
    })

    test('1.3. Смешанные', () => {
      const result = run(`
        const x = 1;
        const y = 2
        console.log(x + y)
      `)
      expect(result).toBe('3')
    })
  })

  // =========================================================================
  // 2. Автоматическая вставка точек с запятой (ASI)
  // =========================================================================

  describe('2. ASI', () => {
    test('2.1.1. [ на новой строке — индекс (ошибка)', () => {
      expect(() => run(`
        const a = 1
        [1, 2].forEach(x => console.log(x))
      `)).toThrow()
    })

    test('2.1.1. [ на новой строке — с ; разделяет', () => {
      const result = run(`
        const a = 1;
        [1, 2].forEach(x => console.log(x))
      `)
      expect(result).toBe('1')
    })

    test('2.1.2. ( на новой строке — вызов (ошибка)', () => {
      expect(() => run(`
        const a = 1
        (2 + 3)
      `)).toThrow()
    })

    test('2.1.2. ( на новой строке — с ; разделяет', () => {
      const result = run(`
        const a = 1;
        (2 + 3)
      `)
      expect(result).toBe('1')
    })

    test('2.1.3. Template literal на новой строке (ошибка)', () => {
      expect(() => run(`
        const a = 1
        \`hello\`
      `)).toThrow()
    })

    test('2.1.3. Template literal на новой строке — с ; разделяет', () => {
      const result = run(`
        const a = 1;
        \`hello\`
      `)
      expect(result).toBe('1')
    })

    test('2.1.4. + на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 2
        + 3
        console.log(a)
      `)
      expect(result).toBe('5')
    })

    test('2.1.5. - на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 10
        - 3
        console.log(a)
      `)
      expect(result).toBe('7')
    })

    test('2.1.6. * на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 5
        * 2
        console.log(a)
      `)
      expect(result).toBe('10')
    })

    test('2.1.7. / на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 10
        / 2
        console.log(a)
      `)
      expect(result).toBe('5')
    })

    test('2.1.8. % на новой строке — бинарный оператор', () => {
      const result = run(`
        const a = 10
        % 3
        console.log(a)
      `)
      expect(result).toBe('1')
    })

    test('2.1.9. . на новой строке — chain access', () => {
      const result = run(`
        const obj = {a: 1, b: 2, c: 3}
        const x = obj
        .c
        console.log(x)
      `)
      expect(result).toBe('3')
    })

    test('2.1.10. ++ на новой строке', () => {
      const result = run(`
        let a = 5
        ++
        console.log(a)
      `)
      expect(result).toBe('6')
    })

    test('2.1.11. -- на новой строке', () => {
      const result = run(`
        let a = 5
        --
        console.log(a)
      `)
      expect(result).toBe('4')
    })

    test('2.2. Унарные операторы требуют ;', () => {
      const result = run(`
        const a = 2;
        +3
        console.log(a)
      `)
      expect(result).toBe('2')
    })
  })

  // =========================================================================
  // 3. Фигурные скобки
  // =========================================================================

  describe('3. Фигурные скобки', () => {
    test('3.1. С фигурными скобками', () => {
      const result = run(`
        if (true) {
          console.log("ok")
        }
      `)
      expect(result).toBe('ok')
    })

    test('3.2. Без фигурных скобок', () => {
      const result = run(`
        if (true) console.log("ok")
      `)
      expect(result).toBe('ok')
    })
  })

  // =========================================================================
  // 4. Открывающая скобка
  // =========================================================================

  describe('4. Открывающая скобка', () => {
    test('4.1. K&R стиль', () => {
      const result = run(`
        function foo(): void {
          console.log("ok")
        }
        foo()
      `)
      expect(result).toBe('ok')
    })

    test('4.2. Скобка на новой строке', () => {
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

  // =========================================================================
  // 5. Отступы
  // =========================================================================

  describe('5. Отступы', () => {
    test('5.1. Разные отступы', () => {
      const result = run(`
        function foo(): void {
        const x = 1
            const y = 2
                const z = 3
        console.log(x + y + z)
        }
        foo()
      `)
      expect(result).toBe('6')
    })
  })

  // =========================================================================
  // 6. Кавычки
  // =========================================================================

  describe('6. Кавычки', () => {
    test('6.1. Одинарные кавычки', () => {
      const result = run(`
        const a = 'hello'
        console.log(a)
      `)
      expect(result).toBe('hello')
    })

    test('6.2. Двойные кавычки', () => {
      const result = run(`
        const a = "hello"
        console.log(a)
      `)
      expect(result).toBe('hello')
    })

    test('6.3. Template literals', () => {
      const result = run(`
        const name = "world"
        const d = \`Hello, \${name}!\`
        console.log(d)
      `)
      expect(result).toBe('Hello, world!')
    })

    test('6.4. Char literal', () => {
      const result = run(`
        const ch: u8 = 'A'
        console.log(ch)
      `)
      expect(result).toBe('65')
    })
  })

  // =========================================================================
  // 7. Trailing comma
  // =========================================================================

  describe('7. Trailing comma', () => {
    test('7.1. В объекте', () => {
      const result = run(`
        const obj = { a: 1, b: 2, }
        console.log(obj.a + obj.b)
      `)
      expect(result).toBe('3')
    })

    test('7.2. В массиве', () => {
      const result = run(`
        const arr = [1, 2, 3,]
        console.log(arr[0] + arr[1])
      `)
      expect(result).toBe('3')
    })

    test('7.3. В параметрах функции', () => {
      const result = run(`
        function foo(x: i32, y: i32,) {
          return x + y
        }
        console.log(foo(1, 2,))
      `)
      expect(result).toBe('3')
    })
  })

  // =========================================================================
  // 8. Перенос строки
  // =========================================================================

  describe('8. Перенос строки', () => {
    test('8.1. Массив с переносами', () => {
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

    test('8.2. Объект с переносами значений', () => {
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

    test('8.3. Объект с переносами ключей и значений', () => {
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

    test('8.4. Объект с хаотичными переносами', () => {
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

    test('8.5. Функция с переносами аргументов', () => {
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

    test('8.6. Вызов функции с переносами', () => {
      const result = run(`
        console.log(
          1,
          2,
          3
        )
      `)
      expect(result).toBe('1 2 3')
    })

    test('8.7. Вложенные скобки с переносами', () => {
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

    test('8.8. Перенос внутри выражения', () => {
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

    test('8.9. Перенос после бинарного оператора', () => {
      const result = run(`
        const val = a
            + b
            + c
        console.log(val)
      `)
      expect(result).toBe('6')
    })
  })

  // =========================================================================
  // 9. Комментарии
  // =========================================================================

  describe('9. Комментарии', () => {
    test('9.1. Однострочный комментарий', () => {
      const result = run(`
        // это комментарий
        const x = 1
        console.log(x)
      `)
      expect(result).toBe('1')
    })

    test('9.2. Многострочный комментарий', () => {
      const result = run(`
        /* это
           многострочный
           комментарий */
        const x = 1
        console.log(x)
      `)
      expect(result).toBe('1')
    })
  })

  // =========================================================================
  // 10. Пробелы вокруг операторов
  // =========================================================================

  describe('10. Пробелы вокруг операторов', () => {
    test('10.1. С пробелами', () => {
      const result = run(`
        const x = a + b * c
        console.log(x)
      `)
      // a=1, b=2, c=3 из контекста
      const result2 = run(`
        const a = 1, b = 2, c = 3
        const x = a + b * c
        console.log(x)
      `)
      expect(result2).toBe('7')
    })

    test('10.2. Без пробелов', () => {
      const result = run(`
        const a = 1, b = 2, c = 3
        const x = a+b*c
        console.log(x)
      `)
      expect(result).toBe('7')
    })
  })

  // =========================================================================
  // 11. Пробелы в аннотациях типов
  // =========================================================================

  describe('11. Пробелы в аннотациях типов', () => {
    test('11.1. Правильно (пробел после :)', () => {
      const result = run(`
        const x: i32 = 5
        console.log(x)
      `)
      expect(result).toBe('5')
    })

    test('11.2. Неправильно (пробел до :)', () => {
      const result = run(`
        const x :i32 = 5
        console.log(x)
      `)
      expect(result).toBe('5')
    })
  })

  // =========================================================================
  // 12. Generics
  // =========================================================================

  describe('12. Generics', () => {
    test('12.1. Без пробелов', () => {
      const result = run(`
        const arr: Array<i32> = [1, 2, 3]
        console.log(arr[0] + arr[1])
      `)
      expect(result).toBe('3')
    })

    test('12.2. С пробелами', () => {
      const result = run(`
        const arr: Array< i32 > = [1, 2, 3]
        console.log(arr[0] + arr[1])
      `)
      expect(result).toBe('3')
    })
  })

  // =========================================================================
  // 13. Union типы
  // =========================================================================

  describe('13. Union типы', () => {
    test('13.1. С пробелами', () => {
      const result = run(`
        let x: i32 | null = null
        if (x == null) x = 42
        console.log(x)
      `)
      expect(result).toBe('42')
    })

    test('13.2. Без пробелов', () => {
      const result = run(`
        let x: i32|null = null
        if (x == null) x = 42
        console.log(x)
      `)
      expect(result).toBe('42')
    })
  })

  // =========================================================================
  // 14. Стрелочные функции
  // =========================================================================

  describe('14. Стрелочные функции', () => {
    test('14.1. С аннотациями (скобки обязательны)', () => {
      const result = run(`
        const f = (x: i32): i32 => x + 1
        console.log(f(5))
      `)
      expect(result).toBe('6')
    })

    test('14.2. Без аннотаций (скобки опциональны)', () => {
      const result = run(`
        const f = x => x + 1
        console.log(f(5))
      `)
      expect(result).toBe('6')
    })

    test('14.3. Скобки всегда ok', () => {
      const result = run(`
        const f = (x) => x + 1
        console.log(f(5))
      `)
      expect(result).toBe('6')
    })
  })

  // =========================================================================
  // 15. Цепочки методов
  // =========================================================================

  describe('15. Цепочки методов', () => {
    test('15.1. Короткая цепочка', () => {
      const result = run(`
        const arr = [1, 2, 3, 4, 5]
        const result = arr.filter(x => x > 0).map(x => x * 2)
        console.log(result[0] + result[1])
      `)
      expect(result).toBe('6')
    })

    test('15.2. Длинная цепочка', () => {
      const result = run(`
        const arr = [1, 2, 3, 4, 5]
        const result = arr
            .filter(x => x > 0)
            .map(x => x * 2)
            .slice(0, 3)
        console.log(result[0] + result[1])
      `)
      expect(result).toBe('6')
    })
  })

  // =========================================================================
  // 16. Тернарный оператор
  // =========================================================================

  describe('16. Тернарный оператор', () => {
    test('16.1. Инлайн', () => {
      const result = run(`
        const isOk = true
        const label = isOk ? "yes" : "no"
        console.log(label)
      `)
      expect(result).toBe('yes')
    })

    test('16.2. Многострочный', () => {
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

  // =========================================================================
  // 17. Пустые строки
  // =========================================================================

  describe('17. Пустые строки', () => {
    test('17.1. Одна пустая строка между функциями', () => {
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
      expect(result).toBe('foo bar')
    })

    test('17.2. Две пустые строки', () => {
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
      expect(result).toBe('foo bar')
    })
  })

  // =========================================================================
  // 18. Длина строки
  // =========================================================================

  describe('18. Длина строки', () => {
    test('18.1. Короткая строка', () => {
      const result = run(`
        const x = 1
        console.log(x)
      `)
      expect(result).toBe('1')
    })

    test('18.2. Длинная строка (>120 символов)', () => {
      const result = run(`
        const veryLongVariableNameThatExceedsRecommendedLineLength = 123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890
        console.log(veryLongVariableNameThatExceedsRecommendedLineLength)
      `)
      expect(result).toBe('123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890')
    })
  })

  // =========================================================================
  // 19. Конец файла
  // =========================================================================

  describe('19. Конец файла', () => {
    test('19.1. С переводом строки', () => {
      const result = run(`
        const x = 1
        console.log(x)
      `)
      expect(result).toBe('1')
    })
  })

})
