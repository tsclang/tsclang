# Tuples — фиксированные кортежи

[← Вверх](./index.md) | [Следующий →](./clone.md) | [Предыдущий ←](./map-set.md)

---

Tuple — фиксированный кортеж с известным на этапе компиляции количеством элементов и типом каждого элемента. В отличие от массива, элементы могут иметь **разные типы**.

## Базовый синтаксис

```typescript
let pair: [i32, string] = [1, "hello"]
let triple: [i32, string, f64] = [1, "hello", 3.14]

pair[0]  // 1 — i32
pair[1]  // "hello" — string
```

### C-output

Tuple компилируется в struct с полями `_0`, `_1`, `_2` и т.д.:

```c
typedef struct {
    int32_t _0;
    String  _1;
} tuple_i32_string;

tuple_i32_string pair = {
    ._0 = 1,
    ._1 = (String){ .data = "hello", .length = 5, .capacity = 0 }
};
```

## Деструктуризация

```typescript
let pair: [i32, string] = [1, "hello"]

const [a, b] = pair       // a: i32 = 1, b: string = "hello"
// pair невалиден — move

let triple: [i32, string, f64] = [1, "hello", 3.14]
const [x, , z] = triple   // x: i32 = 1, z: f64 = 3.14 (пропуск элемента)
```

### C-output

```c
// const [a, b] = pair
int32_t a = pair._0;
String  b = pair._1;
// pair обнулён — move
```

## Labeled Tuples

Labels дают имена элементам и разрешают dot-access наравне с индексным:

```typescript
type Point = [x: f64, y: f64]

let p: Point = [1.0, 2.0]
p[0]  // ok — 1.0
p.x   // ok — сахар над p[0], компилируется в p._0
```

`p.x` и `p[0]` генерируют одинаковый C-код:

```c
typedef struct { double x; double y; } Point;
Point p = { .x = 1.0, .y = 2.0 };
p._0;  // 1.0
p.x;   // 1.0 — то же самое
```

> **Примечание:** Labels должны быть либо у всех элементов, либо ни у кого. `[x: f64, f64]` — ошибка компилятора.

## Readonly Tuples

```typescript
let t: readonly [i32, string] = [1, "hello"]
t[0] = 5  // ошибка: cannot assign to readonly tuple element
```

```c
typedef struct {
    const int32_t _0;
    const String  _1;
} readonly_tuple_i32_string;
```

## Optional Elements

Optional-элементы (`?`) разрешены **только в конце**:

```typescript
type Config = [string, i32?]

let a: Config = ["localhost"]         // ok — i32 отсутствует
let b: Config = ["localhost", 8080]   // ok

a[1]  // i32 | null
```

```typescript
type Good = [i32, string?, f64?]  // ok
type Bad  = [i32?, string, f64]   // ошибка: optional element must be at end
```

```c
typedef struct {
    String  _0;
    opt_i32 _1;  // bool has_value + int32_t value
} tuple_string_opt_i32;
```

## Rest Elements

`...T[]` — произвольное количество элементов в конце. Один rest, только в конце, несовместим с optional.

```typescript
type Strings = [string, ...string[]]

let a: Strings = ["first"]
let b: Strings = ["first", "second", "third"]
```

```c
typedef struct {
    String  _0;
    String* tail;
    usize   tail_len;
} tuple_string_rest_string;
```

Rest-часть требует heap. На embedded — те же правила что и `Array`.

## Spread в tuple-литералах

```typescript
// Копирование tuple
const p: [f64, f64, f64] = [1.0, 2.0, 3.0]
const copy: [f64, f64, f64] = [...p]

// Spread фиксированного tuple — размер известен статически
const pair: [f64, f64] = [1.0, 2.0]
const triple: [f64, f64, f64] = [...pair, 3.0]  // ok
```

Spread из runtime-массива в rest-tuple разрешён:

```typescript
function wrap(items: string[]): [i32, ...string[]] {
    return [0, ...items]  // ok — items.length становится tail_len
}
```

Spread из runtime-массива в фиксированный tuple — ошибка компилятора:

```typescript
let t: [i32, string, string] = [1, ...runtimeArray]
// ошибка: cannot spread runtime-length array into fixed tuple
```

## Ownership

### Move при деструктуризации

```typescript
let t: [User, string] = [new User(), "test"]

// Move — tuple потреблён
const [user, name] = t  // user: User, name: string; t невалиден
```

### Borrow через Ref

```typescript
function process(t: Ref<[User, string]>): void {
    // user: Ref<User>, name: Ref<string> — borrow, не move
}
```

## Tuple vs Array

| Свойство | Tuple `[A, B]` | Array `A[]` |
|----------|----------------|-------------|
| Размер | Фиксирован на compile-time | Динамический |
| Типы элементов | Разные | Одинаковые |
| C-output | Struct (`_0`, `_1`) | Dynamic array struct (`data + length + capacity`) |
| `.length` | Compile-time константа | Runtime значение |
| `push` / `pop` | Недоступны | Доступны |
| Индексация | По числовому литералу | По runtime-индексу |
| Embedded | Всегда доступен | Требует heap (кроме `T[N]`) |

## Ошибки

| Код | Ошибка | Решение |
|-----|--------|---------|
| `[x: f64, f64]` | `all or none elements must be labeled` | Либо все с labels, либо ни одного |
| `[i32?, string]` | `optional element must be at end` | Переставьте optional в конец |
| `[1, ...arr]` (фиксированный) | `cannot spread runtime-length array into fixed tuple` | Используйте rest-tuple: `[i32, ...i32[]]` |
| `t[0] = 5` (readonly) | `cannot assign to readonly tuple element` | Уберите `readonly` из типа |
| `p.length` | `conflict with built-in property 'length'` | Переименуйте label |

## См. также

- [Clone](./clone.md) — глубокое копирование tuples
- [Type Aliases](./type-aliases.md) — `type Point = [x: f64, y: f64]`
- [Деструктуризация](../05-memory/auto-drop.md) — borrow vs move при деструктуризации
- [Массивы](./index.md) — динамические и фиксированные массивы
