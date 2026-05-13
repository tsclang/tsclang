# Ручная миграция

[← Вверх](./index.md) | [Следующий →](./incompatible.md) | [Предыдущий ←](./automatic.md)

---

Часть TypeScript-кода переносится без изменений, но некоторые паттерны требуют ручной правки — их невозможно автоматизировать безопасно.

## Работает как есть

Следующий TypeScript-код компилируется в TSClang без изменений:

```typescript
// Интерфейсы
interface User {
    name: string
    age: i32
}

// Функции с типами
function greet(u: User): string {
    return `Hello, ${u.name}`
}

// Стрелочные функции
const add = (a: i32, b: i32): i32 => a + b

// Классы (без extends)
class Counter {
    private count: i32 = 0
    increment(): void { this.count++ }
    get(): i32 { return this.count }
}

// Дженерики
function first<T>(arr: T[]): T | null {
    return arr.length > 0 ? arr[0] : null
}

// try/catch
try {
    const data = readFile("x.txt")
} catch (e: IOError) {
    console.log(e.message)
}

// Шаблонные строки
const msg = `User ${user.name} has ${user.age} years`

// Деструктуризация
const { name, age } = user
const [first, ...rest] = arr
```

## Требует ручной правки

### `s[i]` — возвращает `u8`, не `string`

В TypeScript `s[0]` возвращает первый символ как `string`. В TSClang — байт UTF-8 как `u8`.

```typescript
// TypeScript:
const ch: string = s[0]   // первый символ

// TSClang:
const byte: u8 = s[0]     // байт UTF-8, не символ!
const ch: string = s[0..1] // однобайтовый срез как строка
// или:
import { graphemeAt } from "std/string"
const ch = graphemeAt(s, 0)  // правильно для Unicode
```

### `for (let x of arr)` с `const arr`

Borrow checker требует `const` в итераторе для неизменяемых коллекций:

```typescript
// TypeScript:
const arr = [1, 2, 3]
for (let x of arr) { ... }  // ok

// TSClang:
const arr = [1, 2, 3]
for (const x of arr) { ... }  // const — borrow checker требует
// let x создаёт move-семантику, что не работает для примитивов в for-of
```

### Классовое наследование → композиция

Наследование классов (кроме `extends Error`) запрещено. Используйте интерфейсы + композицию:

```typescript
// TypeScript:
class Animal { speak(): string { return "..." } }
class Dog extends Animal { speak(): string { return "Woof" } }

// TSClang — интерфейс + реализация:
interface Animal {
    speak(): string
}

class Dog implements Animal {
    speak(): string { return "Woof" }
}

// Переиспользование реализации — через вложение:
class Dog implements Animal {
    private base: BaseAnimal = new BaseAnimal()
    speak(): string { return this.base.speak() }
    bark(): string { return "Woof" }
}
```

### `??` — семантика ownership

Оператор `??` работает аналогично TypeScript, но перемещает левую часть:

```typescript
// TypeScript:
const x = maybeNull ?? defaultValue  // если null — взять default

// TSClang — аналогично, но ?? перемещает maybeNull:
const x = maybeNull ?? defaultValue
// Нельзя использовать maybeNull после ?? — ownership перемещён
```

### Числовые типы — явные аннотации

TypeScript `number` эквивалентен `f64`. Для других числовых типов нужна явная аннотация:

```typescript
// TypeScript:
let x = 42           // number (f64)
let y = 3.14         // number

// TSClang — поведение то же самое (number = f64):
let x = 42           // f64 (через number — как в TypeScript)
let y = 3.14         // f64
let z: i64 = 42      // явно i64
let n: i32 = 42      // явно i32
let w: f32 = 3.14    // явно f32 — будет усечение!
```

### `string.slice()` — байты, не символы

```typescript
// TypeScript:
const sub = s.slice(1, 3)  // подстрока символов 1..2

// TSClang — slice по байтам (не символам):
const sub = s.slice(1, 3)  // байты 1..2 — может разрезать UTF-8 codepoint!

// Безопасно для ASCII. Для Unicode — sliceChars по codepoint-индексам:
import { sliceChars } from "std/string"
const sub = sliceChars(s, 1, 3)  // codepoints 1..2
```

## C-output: пример миграции

TypeScript-код после миграции:

```typescript
function greet(name: string | null): string {
    const n = name ?? "World"
    return `Hello, ${n}`
}
```

Компилируется в:

```c
String greet(Option_String name) {
    String n = name.ok ? name.value : str("World");
    if (name.ok) String_free(name.value);
    String _tmp = format(str("Hello, %s"), n.data);
    String_free(n);
    return _tmp;
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `type error: string expected, got u8` | `s[i]` возвращает `u8` — использовать `s[i..j]` или `graphemeAt` |
| `cannot move out of const context` | `for (let x of arr)` — заменить `let` на `const` |
| `extends is not supported` | Классовое наследование — заменить на композицию |
| `use after move` | Переменная использована после `??` — ownership перемещён |
| `possible truncation` | Присвоение `f64` в `f32` — явная аннотация |

## См. также

- [Автоматическая миграция](./automatic.md) — что `tsclang migrate` делает автоматически
- [Несовместимые паттерны](./incompatible.md) — конструкции без аналога
- [Типы: Числа](../03-types/numbers.md) — числовые типы TSClang
- [Типы: Строки](../03-types/strings.md) — строковые операции, UTF-8
- [Модель памяти: Owner](../05-memory/owner.md) — move и ownership
