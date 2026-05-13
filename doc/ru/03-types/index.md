# Система типов

[← Вверх](../index.md) | [Следующий →](./numbers.md)

---

Система типов TSClang — статическая, с выводом типов и тремя уровнями безопасности: compile-time проверки, ownership/borrow checker и опциональный ARC.

## Два уровня типизации

TSClang разделяет типы на **структурные** и **номинальные**:

| Конструкция | Типизация | Объектные литералы | C-вывод |
|-------------|-----------|-------------------|---------|
| `type Foo = { ... }` | Структурная | ✅ | `typedef struct`, методы запрещены |
| `interface Foo { ... }` | Структурная | ✅ (если нет методов) | `typedef struct` или fat pointer + vtable |
| `class Foo { ... }` | **Номинальная** | ❌ | struct + методы |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // ok — структурная совместимость
const v: Vector = p                     // ok — те же поля

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // ошибка — класс номинальный
```

Ключевое различие `type` vs `interface`:
- `type Point = { x: f64; y: f64 }` — **гарантированно** data struct без vtable. Методы запрещены ошибкой компилятора. Используйте для embedded MMIO, бинарных структур, ABI-критичного кода.
- `interface Point { x: f64; y: f64 }` — сейчас data struct, но можно расширить методами в будущем (тогда ABI сменится на vtable).

## Type inference

Тип выводится если не указан явно:

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — анонимная struct
const s = "hello"            // → string
const n = 42                 // → number (= f64 на desktop)
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[] (= f64[])
```

Явная аннотация переопределяет: `const i: i32 = 1` → `i32`.

## Автокаст числовых типов

Три механизма, применяются последовательно. Первый применимый выигрывает.

### Механизм 1 — type-level widening (let и const)

Работает только по типам, не смотрит на значения. Безусловно безопасен.

| Откуда | Куда | Комментарий |
|--------|------|-------------|
| `i8`/`i16`/`i32` | `i64` | same-sign, без потерь |
| `u8`/`u16`/`u32` | `u64` | same-sign, без потерь |
| `u8` | `i16` | все 256 значений помещаются |
| `u16` | `i32` | все 65 536 помещаются |
| `u32` | `i64` | все 4.3G помещаются |
| `i32`, `u32` | `f64` | без потерь (53-bit мантисса) |
| `f32` | `f64` | без потерь |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 всегда помещается в i64
```

### Механизм 2 — compile-time анализ значений (только const)

Когда оба операнда `const` с известными литеральными значениями и механизм 1 не применим. Пошаговый алгоритм — см. [Числовые типы → Автокаст](./numbers.md).

### Механизм 3 — явный `as` (для let)

Если механизм 1 не применим к `let`-переменным — требуется явный каст:

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // ошибка — нет type-level widening
let c: f64 = (a + (b as i64)) as f64  // ok
```

Подробности по каждому механизму — на странице [Числовые типы](./numbers.md).

## Подстраницы

| Страница | Описание |
|----------|----------|
| [Числовые типы](./numbers.md) | i8..i64, u8..u64, f32, f64, usize, number, автокасты, `as` |
| [Строки](./strings.md) | UTF-8 строки, литералы, методы, std/string |
| [Специальные типы](./special-types.md) | any, never, void, unknown |
| [Null](./null.md) | Nullable типы, optional chaining, `??` |
| [Массивы](./arrays.md) | Динамические, фиксированные, Slice\<T\> |
| [Map и Set](./map-set.md) | Хеш-таблицы и множества |
| [Tuples](./tuples.md) | Кортежи, labeled, readonly, optional, rest |
| [Clone](./clone.md) | Явное клонирование owned значений |
| [Type Aliases](./type-aliases.md) | `type`, opaque aliases, String Literal Union |
| [Utility Types](./utility-types.md) | Partial, Required, Readonly, Pick, Omit, Record и др. |
| [Date](./date.md) | Legacy JS-совместимый тип даты/времени |

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `expected f64, got i32` | Несовместимые числовые типы без автокаста |
| `empty object literal is forbidden` | Пустой `{}` — используйте `Map<K,V>` или объявите тип |
| `cannot use "void" as variable type` | `void` только для возвращаемого типа функции |
| `non-nullable runtime union: string \| i32` | Non-nullable union запрещён, используйте interface или discriminated union |

## См. также

- [Переменные: let / const](../02-syntax/variables/index.md) — влияние `let`/`const` на типы и автокаст
- [Модель памяти](../05-memory/index.md) — ownership, `Ref<T>`, `Mut<T>`
- [Классы и интерфейсы](../04-classes/index.md) — номинальная типизация, generics
- [Обработка ошибок](../06-errors/index.md) — `throws`, `T | null` vs `T throws E`
