# match

[← Вверх](./index.md) | [Предыдущий ←](./switch.md)

---

`match` — выражение с pattern matching. Возвращает значение, проверяет полноту покрытия (exhaustiveness). Компилируется в `if-else` для общих паттернов и в `switch` для enum.

## Синтаксис

```typescript
const результат = match (выражение) {
    паттерн1 => ветка1,
    паттерн2 => ветка2,
    _         => ветка_по_умолчанию,
};
```

Паттерны проверяются сверху вниз, первый совпавший выигрывает. Каждая ветка — выражение (после `=>`), значение которого становится результатом `match`.

## Правила

- **`_`** — wildcard, соответствует любому значению. Обязателен, если паттерны не покрывают все возможные значения.
- **Exhaustiveness**: компилятор проверяет полноту покрытия. Для `enum` и `T | null` — все варианты должны быть указаны явно или покрыты `_`. Неполный match — **ошибка компиляции**.
- **Интерфейсы**: для переменных типа `interface` — `_` всегда обязателен, так как компилятор не может знать все реализации.
- **`|`** — несколько паттернов для одной ветки (`1 | 2 | 3 => ...`).
- **Диапазон `a..b`** — от `a` до `b` включительно с обеих сторон (`x >= a && x <= b`).
- **Деструктуризация** — кортежи `[a, b]`, объектные литералы `{ field }`, классы `ClassName { field }`.
- **Move-семантика**: деструктуризация в match — это **move**, не borrow. Для borrow — явно используйте `Ref<T>` в паттерне.

## Сравнение switch и match

| | `switch` | `match` |
|---|---|---|
| Тип | оператор (statement) | выражение (возвращает значение) |
| Полнота покрытия | warning | **ошибка компиляции** |
| Паттерны | только равенство | литералы, диапазоны, деструктуризация, `|` |
| Fallthrough | запрещён | отсутствует (каждая ветка — отдельное выражение) |
| Куда компилируется | C `switch` | C `switch` (enum) или `if-else` (общий случай) |

## Примеры

### Литералы и wildcard

```typescript
const x: i32 = 5;
const result = match x {
    0 => "zero",
    1..4 => "small",
    _ => "other",
};
console.log(result);
```

C-output:

```c
const int32_t x = 5;
String result;
if (x == 0) { result = STR_LIT("zero"); }
else if (x >= 1 && x <= 4) { result = STR_LIT("small"); }
else { result = STR_LIT("other"); }
printf("%s\n", result.data);
```

Вывод: `other`

### Диапазоны

```typescript
const score: i32 = 75;
const grade = match score {
    90..100 => "A",
    70..89  => "B",
    50..69  => "C",
    _       => "F",
};
console.log(grade);
```

C-output:

```c
const int32_t score = 75;
String grade;
if (score >= 90 && score <= 100) { grade = STR_LIT("A"); }
else if (score >= 70 && score <= 89) { grade = STR_LIT("B"); }
else if (score >= 50 && score <= 69) { grade = STR_LIT("C"); }
else { grade = STR_LIT("F"); }
printf("%s\n", grade.data);
```

Вывод: `B`

### Несколько паттернов (`|`)

```typescript
const n: i32 = 2;
const s = match n {
    1 | 2 | 3 => "low",
    _ => "high",
};
console.log(s);
```

C-output:

```c
const int32_t n = 2;
String s;
if (n == 1 || n == 2 || n == 3) { s = STR_LIT("low"); }
else { s = STR_LIT("high"); }
printf("%s\n", s.data);
```

Вывод: `low`

### Enum — exhaustiveness

Для enum компилятор проверяет, что все значения покрыты. Полный match компилируется в C `switch`:

```typescript
enum Dir { North, South, East, West }
const d: Dir = Dir.East;
const s = match d {
    Dir.North => "N",
    Dir.South => "S",
    Dir.East  => "E",
    Dir.West  => "W",
};
console.log(s);
```

C-output:

```c
typedef enum { Dir_North = 0, Dir_South = 1, Dir_East = 2, Dir_West = 3 } Dir;

Dir d = Dir_East;
String s;
switch (d) {
    case Dir_North: s = STR_LIT("N"); break;
    case Dir_South: s = STR_LIT("S"); break;
    case Dir_East:  s = STR_LIT("E"); break;
    case Dir_West:  s = STR_LIT("W"); break;
}
printf("%s\n", s.data);
```

Вывод: `E`

### Null-паттерн

```typescript
let x: i32 | null = null;
const msg = match x {
    null => "nothing",
    _ => "value",
};
console.log(msg);
```

C-output — nullable-примитив представлен как `struct { bool has_value; T value; }`:

```c
typedef struct { bool has_value; int32_t value; } opt_i32;

opt_i32 x = {false, 0};
String msg;
if (!x.has_value) { msg = STR_LIT("nothing"); }
else { msg = STR_LIT("value"); }
printf("%s\n", msg.data);
```

Вывод: `nothing`

### Деструктуризация кортежа

```typescript
const pair: [i32, string] = [1, "one"];
const desc = match(pair) {
    [1, _] => "starts with one",
    [2, _] => "starts with two",
    _      => "other",
};
console.log(desc);
```

C-output:

```c
typedef struct { int32_t _0; String _1; } tuple_i32_string;

const tuple_i32_string pair = {._0 = 1, ._1 = STR_LIT("one")};
String desc;
if (pair._0 == 1) { desc = STR_LIT("starts with one"); }
else if (pair._0 == 2) { desc = STR_LIT("starts with two"); }
else { desc = STR_LIT("other"); }
printf("%s\n", desc.data);
```

Вывод: `starts with one`

### Деструктуризация объекта (type literal)

```typescript
type Shape = { kind: i32; a: f64; b: f64 }

const shape: Shape = { kind: 1, a: 5.0, b: 0.0 };

const area = match(shape) {
    { kind: 1, a, b } => 3.14 * a * a,
    { kind: 2, a, b } => a * b,
    _ => 0.0,
};
console.log(area);
```

C-output — поля извлекаются в локальные переменные (move):

```c
typedef struct { int32_t kind; double a; double b; } Shape;

const Shape shape = { .kind = 1, .a = 5.0, .b = 0.0 };
double area;
if (shape.kind == 1) {
    double a = shape.a;
    double b = shape.b;
    area = 3.14 * a * a;
}
else if (shape.kind == 2) {
    double a = shape.a;
    double b = shape.b;
    area = a * b;
}
else { area = 0.0; }
printf("%g\n", area);
```

Вывод: `78.5`

### Деструктуризация класса (interface matching)

При match по interface-переменной компилятор проверяет vtable для определения конкретного класса:

```typescript
interface Shape { area(): f64 }

class Circle implements Shape {
    r: f64;
    area(): f64 { return 3.14 * this.r * this.r; }
}
class Rect implements Shape {
    w: f64;
    h: f64;
    area(): f64 { return this.w * this.h; }
}

let c = new Circle();
c.r = 5.0;
let shape: Shape = c;

const a = match(shape) {
    Circle { r } => 3.14 * r * r,
    Rect { w, h } => w * h,
    _ => 0.0,
};
console.log(a);
```

C-output — сопоставление через vtable, приведение типа и извлечение полей:

```c
Shape shape = {.self = &c, .vtable = &Circle_Shape_vtable};
double a;
if (shape.vtable == &Circle_Shape_vtable) {
    double r = ((Circle*)shape.self)->r;
    a = 3.14 * r * r;
}
else if (shape.vtable == &Rect_Shape_vtable) {
    double w = ((Rect*)shape.self)->w;
    double h = ((Rect*)shape.self)->h;
    a = w * h;
}
else { a = 0.0; }
printf("%g\n", a);
```

Вывод: `78.5`

> **Важно:** для интерфейсов `_` обязателен — компилятор не может гарантировать, что перечислены все реализации.

## Ошибки

### Неполный match по enum

```typescript
enum Dir { North, South, East, West }
const d: Dir = Dir.North;
const s = match(d) {
    Dir.North => "N",
    Dir.South => "S",
};
```

```
TypeError: Non-exhaustive match on enum 'Dir': missing cases 'East', 'West'
```

Для enum все значения должны быть покрыты либо явно, либо через `_`.

### Неполный match без `_`

Если тип конечен (enum, `T | null`) и `_` отсутствует, а случаи перечислены не все — ошибка. Для неограниченных типов (числа, строки, интерфейсы) `_` обязателен всегда.

## См. также

- [switch](./switch.md) — оператор выбора по значению
- [Enum](../../03-types/enum.md) — перечисления и exhaustiveness
- [Модель памяти](../../05-memory/index.md) — move-семантика, borrow, `Ref<T>`
- [Nullable-типы](../truthy-falsy.md) — `T | null`, optional chaining, `??`
