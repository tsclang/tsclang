# Несовместимые паттерны

[← Вверх](./index.md) | [Следующий →](./new-features.md) | [Предыдущий ←](./manual.md)

---

Некоторые TypeScript-конструкции не имеют прямого аналога в TSClang. Это связано с фундаментальными отличиями: статическая типизация без runtime-интерпретации, отсутствие prototype chain, NFA-regex без backtracking.

## Таблица несовместимостей

| Конструкция | Причина | Альтернатива |
|-------------|---------|--------------|
| `with` statement | Не поддерживается | Явный доступ к полям |
| `eval()` | Нет runtime-интерпретации | Нет прямого аналога |
| `Function` constructor | Нет runtime-интерпретации | Нет прямого аналога |
| Прототипное наследование | TSClang не имеет prototype chain | Интерфейсы + композиция |
| Dynamic property access `obj[key]` | Статическая типизация | `Map<string, V>` или `switch` |
| `arguments` в функциях | Нет variadic без типов | Явный массив или перегрузка |
| Closure над `let` в loop | Разные семантики захвата | Явная копия перед замыканием |
| `typeof x === "object"` | Runtime type checks через union | Exhaustive match по union типу |
| Regex backreferences `\1` | `std/regex` — NFA, нет backtracking | `@tsc/pcre` если нужны |
| Regex lookahead `(?=...)` | `std/regex` — NFA, нет backtracking | `@tsc/pcre` если нужны |
| `RegExp` литерал `/pattern/flags` | Замена на `new Regex(r"pattern")` | `import { Regex } from "std/regex"` |

## Подробности и примеры

### Dynamic property access `obj[key]`

```typescript
// TypeScript:
const field = "name"
const value = obj[field]   // dynamic access

// TSClang — использовать Map:
const obj = new Map<string, string>()
obj.set("name", "Alice")
const value = obj.get("name")

// Или switch для известных полей:
function getField(obj: User, field: string): string {
    return match (field) {
        "name" => obj.name,
        "email" => obj.email,
        _ => ""
    }
}
```

### `arguments` в функциях

```typescript
// TypeScript:
function sum(...args: number[]): number {
    return args.reduce((a, b) => a + b, 0)
}

// TSClang — явный массив:
function sum(args: f64[]): f64 {
    let total: f64 = 0
    for (const x of args) { total += x }
    return total
}

// Или перегрузка:
function sum2(a: f64, b: f64): f64 { return a + b }
function sum3(a: f64, b: f64, c: f64): f64 { return a + b + c }
```

### Closure над `let` в loop

```typescript
// TypeScript — каждая итерация создаёт новую привязку let:
for (let i = 0; i < 5; i++) {
    setTimeout(() => console.log(i), 100)  // 0, 1, 2, 3, 4
}

// TSClang — явная копия:
for (let i = 0; i < 5; i++) {
    const copy = i            // явная копия значения
    spawn(() => console.log(copy))
}
```

### `typeof` runtime-проверки

```typescript
// TypeScript:
function process(value: string | number) {
    if (typeof value === "string") { ... }
    if (typeof value === "number") { ... }
}

// TSClang — exhaustive match по union типу:
function process(value: string | i32) {
    match (value) {
        s: string => { /* string branch */ },
        n: i32    => { /* number branch */ },
    }
}
```

### RegExp

```typescript
// TypeScript:
const re = /pattern/gi
const found = "text".match(/pattern/)

// TSClang:
import { Regex } from "std/regex"
const re = new Regex(r"pattern")
const found = re.test("text")

// Для backreferences и lookahead:
// import from "@tsc/pcre" (внешний пакет)
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `with statement is not supported` | Используется `with` — переписать на явный доступ |
| `eval is not supported` | Вызов `eval()` — нет runtime-интерпретации |
| `dynamic property access` | `obj[expr]` где тип ключа — не литерал — использовать `Map` |
| `arguments is not defined` | `arguments` в теле функции — использовать явный массив |
| `typeof runtime check` | `typeof x === "..."` — использовать `match` |

## См. также

- [Ручная миграция](./manual.md) — паттерны, требующие ручных правок
- [Новые возможности](./new-features.md) — что TSClang добавляет
- [Стандартная библиотека: Regex](../10-stdlib/regex.md) — работа с регулярными выражениями
- [Синтаксис: Match](../02-syntax/match/syntax.md) — pattern matching
