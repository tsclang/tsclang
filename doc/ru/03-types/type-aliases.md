# Type Aliases — псевдонимы типов

[← Вверх](./index.md) | [Следующий →](./utility-types.md) | [Предыдущий ←](./clone.md)

---

`type` — compile-time псевдоним типа. Не создаёт новый тип в runtime — компилятор подставляет оригинальный тип везде, где используется alias.

## Алиас примитива

```typescript
type UserId = i32
type Timestamp = i64

function getUser(id: UserId): User { ... }
```

`UserId` и `i32` **взаимозаменяемы** — нового C-типа не создаётся:

```c
// getUser(id: UserId) → getUser(int32_t id)
User getUser_i32(int32_t id) { ... }
```

> **Примечание:** `type UserId = i32` — это **compile-time alias**, не nominal type. Нельзя перегрузить функцию по alias: `function f(id: UserId)` и `function f(id: i32)` — один и тот же тип.

## Алиас объекта (struct)

```typescript
type Point = { x: f64, y: f64 }

let p: Point = { x: 1.0, y: 2.0 }
```

Генерирует `typedef struct` в C. Методы **запрещены** — ошибка компилятора:

```c
typedef struct { double x; double y; } Point;

Point p = { .x = 1.0, .y = 2.0 };
```

### type vs interface

| Конструкция | Методы | C-output | Структурная совместимость |
|-------------|--------|----------|---------------------------|
| `type Point = { x: f64 }` | Запрещены — ошибка | Всегда `typedef struct` | ✅ |
| `interface Point { x: f64 }` | Разрешены | Без методов: `typedef struct`; с методами: fat pointer (vtable) | ✅ |

Используйте `type` когда гарантированно нужны только данные (embedded MMIO, бинарные структуры, ABI-критичный код). Используйте `interface` когда методы возможны в будущем.

## Nullable type

Единственный допустимый union в TSClang — `T | null`:

```typescript
type Nullable<T> = T | null  // generic алиас

function find(id: i32): Nullable<User> { ... }
// эквивалентно: User | null
```

```c
// Nullable<User> → opt_User (bool has_value + User value)
typedef struct { bool has_value; User value; } opt_User;
```

## Тип функции

Для колбэков и сигнатур функций:

```typescript
type Callback = (x: i32) => void
type Comparator<T> = (a: Ref<T>, b: Ref<T>) => i32

function sort(arr: Mut<i32[]>, cmp: Comparator<i32>): void { ... }
```

```c
// Comparator<i32> — указатель на функцию
typedef int32_t (*Comparator_i32)(const int32_t* a, const int32_t* b);

void sort_Mut_Array_i32(Array_i32* arr, Comparator_i32 cmp);
```

## Non-nullable union запрещён

```typescript
// ❌ ЗАПРЕЩЕНО
type StringOrInt = string | i32       // ошибка компилятора
function process(x: string | i32) {}  // ошибка компилятора
```

**Причина:** в C нет типа для «строка или число» без tagged union overhead. TSClang не поддерживает non-nullable runtime union.

### Используйте interface для полиморфизма

```typescript
interface Shape { area(): f64 }

class Circle implements Shape {
    r: f64;
    area(): f64 { return Math.PI * this.r * this.r; }
}

class Rect implements Shape {
    w: f64; h: f64;
    area(): f64 { return this.w * this.h; }
}

function process(x: Shape): void { ... }  // ok — fat pointer с vtable
```

## String Literal Union

Строковый литеральный union — **compile-time концепция**, компилируется в C enum:

```typescript
type Dir = "north" | "south" | "east" | "west"

let d: Dir = "north"   // ok
d = "up"               // ошибка: "up" не входит в Dir
```

```c
typedef enum { Dir_north, Dir_south, Dir_east, Dir_west } Dir;

static const char* const Dir_values[] = {
    [Dir_north] = "north",
    [Dir_south] = "south",
    [Dir_east]  = "east",
    [Dir_west]  = "west"
};
```

### Конверсия в string

```typescript
const s1 = d.toString()   // "north" — явно
const s2 = d as string    // "north" — кратко
```

Автоконверт запрещён — в C это скрытый `Dir_values[d]`, overhead должен быть виден в коде.

### Где разрешён

| Позиция | Разрешено |
|---------|-----------|
| `type` alias | ✅ |
| Тип параметра функции | ✅ |
| Generic-параметр (`keyof`, `Pick`, `Record`) | ✅ |
| Runtime union с другим типом (`Dir \| i32`) | ❌ |
| Автоконверт в `string` | ❌ |

## Ошибки

| Код | Ошибка | Решение |
|-----|--------|---------|
| `type S = string \| i32` | `non-nullable union types are not supported` | Используйте `interface` для полиморфизма |
| `type P = { x: f64 }; P.distance = ...` | `methods are not allowed on type aliases` | Используйте `class` или `interface` |
| `d = "up"` (где `d: Dir`) | `"up" is not assignable to Dir` | Используйте значение из union |
| `let s: string = d` | `cannot implicitly convert Dir to string` | Используйте `d.toString()` или `d as string` |

## См. также

- [Utility Types](./utility-types.md) — `Partial`, `Pick`, `Omit`, `Record` и др.
- [Интерфейсы](../04-classes/index.md) — структурная типизация с методами
- [Generics](../04-classes/index.md) — дженерики и монорфизация
- [Owner (T)](../05-memory/owner.md) — move семантика для type alias объектов
