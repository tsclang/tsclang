# TSClang — Migration Guide: TypeScript → TSClang

Руководство для разработчиков, переходящих с TypeScript на TSClang.

---

## Автоматические правки (codemod)

Эти изменения механические — можно автоматизировать:

| TypeScript | TSClang | Причина |
|------------|---------|---------|
| `undefined` | `null` | TSClang не имеет `undefined` |
| `throw "message"` | `throw new Error("message")` | Бросать можно только экземпляры `Error` |
| `export default X` | `export { X }` | `export default` запрещён |
| `import X from "./m"` | `import X from "./m"` | Имя — namespace, не default |
| `x === y` | `x == y` | `==` и `===` идентичны в TSClang |
| `x !== y` | `x != y` | Аналогично |

---

## Работает как есть

Этот TypeScript-код переносится без изменений:

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

---

## Требует ручной правки

### `s[i]` — возвращает `u8`, не `string`

```typescript
// TypeScript:
const ch: string = s[0]   // первый символ

// TSClang:
const byte: u8 = s[0]     // ← байт UTF-8, не символ!
const ch: string = s[0..1] // однобайтовый срез как строка
// или:
import { graphemeAt } from "std/string"
const ch = graphemeAt(s, 0)  // ← правильно для Unicode
```

### `for (let x of arr)` с `const arr`

```typescript
// TypeScript:
const arr = [1, 2, 3]
for (let x of arr) { ... }  // ok

// TSClang:
const arr = [1, 2, 3]
for (const x of arr) { ... }  // ✅ — borrow checker требует const
// let x создаёт move-семантику, что не работает для примитивов в for-of
```

### Классовое наследование → композиция

```typescript
// TypeScript:
class Animal { speak(): string { return "..." } }
class Dog extends Animal { speak(): string { return "Woof" } }

// TSClang — наследование запрещено, использовать интерфейс + реализацию:
interface Animal {
    speak(): string
}

class Dog implements Animal {
    speak(): string { return "Woof" }
}

// Если нужно переиспользовать реализацию — вложение:
class Dog implements Animal {
    private base: BaseAnimal = new BaseAnimal()
    speak(): string { return this.base.speak() }
    bark(): string { return "Woof" }
}
```

### `??` — семантика ownership

```typescript
// TypeScript:
const x = maybeNull ?? defaultValue  // если null — взять default

// TSClang — аналогично, но ?? перемещает левую часть:
const x = maybeNull ?? defaultValue  // move maybeNull если не null
// Нельзя использовать maybeNull после ??
```

### Числовые типы — явные аннотации

```typescript
// TypeScript:
let x = 42           // number (f64)
let y = 3.14         // number

// TSClang — нужно указать явно если не хочешь дефолт:
let x = 42           // i32 по умолчанию для целых
let y = 3.14         // f64 по умолчанию для дробных
let z: i64 = 42      // явно i64
let w: f32 = 3.14    // явно f32 — будет усечение!
```

### `string[i]` для slice

```typescript
// TypeScript:
const sub = s.slice(1, 3)  // подстрока символов 1..2

// TSClang — slice по байтам (не символам):
const sub = s.slice(1, 3)  // байты 1..2 — может разрезать UTF-8 codepoint!

// Безопасно для ASCII. Для Unicode — sliceChars по codepoint-индексам:
import { sliceChars } from "std/string"
const sub = sliceChars(s, 1, 3)  // codepoints 1..2 ✅
```

---

## Несовместимые паттерны — нет аналога

| Конструкция | Причина | Альтернатива |
|-------------|---------|--------------|
| `with` statement | Не поддерживается | Явный доступ к полям |
| `eval()` | Нет рантайм-интерпретации | Нет прямого аналога |
| `Function` constructor | Нет рантайм-интерпретации | Нет прямого аналога |
| Прототипное наследование | TSClang не имеет prototype chain | Интерфейсы + композиция |
| Dynamic property access `obj[key]` | Статическая типизация | `Map<string, V>` или `switch` |
| `arguments` в функциях | Нет variadic без типов | Явный массив или перегрузка |
| Closure над `let` в loop | Разные семантики захвата | Явная копия перед замыканием |
| `typeof x === "object"` | Runtime type checks через union | Exhaustive match по union типу |

---

## Добавляет TSClang (нет в TS)

- **Ownership** — `T` (owned), `Ref<T>` (borrow), `Mut<T>` (mutable borrow)
- **`throws`** — явное объявление ошибок в сигнатуре
- **`mut` методы** — явное обозначение мутирующих методов
- **`as` overflow** — wrap-truncation (предсказуемо, не UB)
- **Фиксированные массивы** — `T[N]` на стеке
- **`@embedded.*` аннотации** — для ISR, inline, no-heap
- **Platform profiles** — условная компиляция без препроцессора
- **Extension methods** — добавление методов к чужим типам без inheritance
- **`?` propagate** — сокращение для return-on-error
