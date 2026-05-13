# 03 — Калькулятор

Пишем консольный калькулятор: принимает два числа и операцию, возвращает результат. На этом примере разберём функции, ветвления и безопасную обработку ошибок.

## Что узнаем

- Функции с возвращаемым значением
- `match` — мощная замена `switch`
- `throws` — функции, которые могут завершиться ошибкой
- `try` / `catch` — перехват ошибок
- `parseFloat` — преобразование строки в число
- Деструктуризация массива

## Шаг 1. Объявляем тип ошибки и функцию

Создайте файл `calc.tsc`:

```typescript
class CalcError {
    message: string;
}

function calculate(a: f64, b: f64, op: string): f64 throws CalcError {
    if (op == "+") {
        return a + b;
    } else if (op == "-") {
        return a - b;
    } else if (op == "*") {
        return a * b;
    } else if (op == "/") {
        if (b == 0.0) {
            throw new CalcError("Division by zero");
        }
        return a / b;
    } else {
        throw new CalcError("Unknown operator: " + op);
    }
}
```

> **`throws CalcError`** — функция явно объявляет, что может завершиться ошибкой. Вызывающий код обязан либо перехватить ошибку через `try/catch`, либо тоже объявить `throws`.

> **Про `match`:** в TSClang `match` — это выражение для сопоставления с образцом. Оно отлично подходит для enum, чисел и диапазонов:
> ```typescript
> const grade = match score {
>     90..100 => "A",
>     70..89  => "B",
>     50..69  => "C",
>     _       => "F",
> };
> ```
> Для калькулятора проще использовать `if/else`, потому что операция `/` требует дополнительной проверки на ноль.

## Шаг 2. Чтение аргументов

```typescript
const args = process.argv;

if (args.length < 4) {
    console.log("Usage: calc <a> <op> <b>");
    process.exit(1);
}

const [_, aStr, op, bStr] = args;

const a: f64 = parseFloat(aStr);
const b: f64 = parseFloat(bStr);
```

> Деструктуризация `const [_, aStr, op, bStr] = args` — удобный способ извлечь элементы из массива. `_` — первый элемент (имя программы), который нам не нужен.

> `parseFloat` преобразует строку в `f64`. Если строка невалидная — программа выведет ошибку и завершится.

## Шаг 3. Вычисление и обработка ошибок

```typescript
try {
    const result = calculate(a, b, op);
    console.log("Result:", result);
} catch (e: CalcError) {
    console.log("Error:", e.message);
}
```

> **Важно:** в `catch` указывайте тип ошибки явно — `catch (e: CalcError)`. Это помогает компилятору сгенерировать правильный C-код.

## Шаг 4. Сборка и запуск

```bash
tsclang build calc.tsc --emit binary --outDir build
./build/calc 10 + 5
```

Вывод:

```
Result: 15
```

Проверим ошибки:

```bash
./build/calc 10 // 0
```

> **Примечание для Windows/Git Bash:** символ `/` одиночный shell может интерпретировать как путь. Используйте `//` — Git Bash преобразует его в `/`.

Вывод:

```
Error: Division by zero
```

```bash
./build/calc 10 ^ 2
```

Вывод:

```
Error: Unknown operator: ^
```

## Полный исходник

```typescript
// calc.tsc
class CalcError {
    message: string;
}

function calculate(a: f64, b: f64, op: string): f64 throws CalcError {
    if (op == "+") {
        return a + b;
    } else if (op == "-") {
        return a - b;
    } else if (op == "*") {
        return a * b;
    } else if (op == "/") {
        if (b == 0.0) {
            throw new CalcError("Division by zero");
        }
        return a / b;
    } else {
        throw new CalcError("Unknown operator: " + op);
    }
}

const args = process.argv;

if (args.length < 4) {
    console.log("Usage: calc <a> <op> <b>");
    process.exit(1);
}

const [_, aStr, op, bStr] = args;

const a: f64 = parseFloat(aStr);
const b: f64 = parseFloat(bStr);

try {
    const result = calculate(a, b, op);
    console.log("Result:", result);
} catch (e: CalcError) {
    console.log("Error:", e.message);
}
```

## Упражнения

1. Добавьте операцию `%` (остаток от деления).
2. Добавьте `**` (возведение в степень) с помощью `Math.pow`.
3. Измените программу так, чтобы при ошибке возвращался код выхода `1`. Для этого `process.exit(1)` нужно вынести в `catch`.
4. Напишите функцию `grade(score: f64): string` с `match`, которая возвращает оценку по шкале A/B/C/D/F.

## Что дальше

В [следующей главе](04-todo-cli.md) напишем программу с изменяемым состоянием — список дел в консоли. Там разберём массивы, строки и модули.
