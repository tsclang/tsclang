## match

> Синтаксис соответствует [TC39 Pattern Matching proposal](https://github.com/tc39/proposal-pattern-matching) и ожидаемому TypeScript 7.

Expression-based pattern matching. Возвращает значение, exhaustiveness проверяется компилятором.

```typescript
// литералы
const label = match (x) {
    0       => "zero",
    1..10   => "small",
    11..100 => "medium",
    _       => "large",
};

// null
const msg = match (user) {
    null => "not found",
    _    => `Hello, ${user.name}`,
};

// enum
const desc = match (direction) {
    Direction.North => "вверх",
    Direction.South => "вниз",
    Direction.East  => "вправо",
    Direction.West  => "влево",
    // _ не нужен — компилятор проверяет полноту
};

// match по interface — сравнение vtable-адресов (instanceof под капотом)
// shape: Drawable (interface fat pointer)
interface Drawable { area(): f64 }
class Circle implements Drawable { r: f64; area(): f64 { return Math.PI * this.r * this.r; } }
class Rect   implements Drawable { w: f64; h: f64; area(): f64 { return this.w * this.h; } }

const a = match (shape) {
    Circle { r }    => Math.PI * r * r,
    Rect   { w, h } => w * h,
    // exhaustiveness: компилятор НЕ может знать все реализации interface
    // _ обязателен для interface (в отличие от enum)
    _ => 0.0,
};

// match по type / interface с деструктуризацией по полям (data-only, без vtable)
type Circle2D = { kind: "circle"; r: f64 }
type Rect2D   = { kind: "rect";   w: f64; h: f64 }
// для type-алиасов с дискриминатором — деструктуризация по литералу поля:
const area = match (shape2d) {
    { kind: "circle", r }  => Math.PI * r * r,
    { kind: "rect", w, h } => w * h,
};

// несколько паттернов для одной ветки
const sign = match (n) {
    0            => "zero",
    1 | 2 | 3    => "small positive",
    _            => "other",
};
```

**Правила match:**

- `_` — wildcard, совпадает с чем угодно; обязателен если паттерны не исчерпывающие
- Паттерны проверяются сверху вниз, срабатывает первый совпавший
- Exhaustiveness: если компилятор видит что все случаи покрыты (enum, null + non-null) — `_` не нужен; если не покрыты — ошибка компилятора
- Для **interface**-переменных компилятор не знает всех реализаций → `_` обязателен всегда
- Для **enum** и **`T | null`** компилятор проверяет полноту → `_` только если реально не покрыто
- `|` — несколько паттернов для одной ветки
- Диапазон `a..b` — от `a` включительно до `b` не включительно (как везде в TSC)
- Деструктуризация в паттерне `match` — **copy**, source жив: поля копируются (примитивы — copy by value, string — copy + retain, class — struct copy). После match source доступен
  ```typescript
  match (result) {
      Ok  { value } => process(value),  // value: T — copy из result
      Err { error } => log(error),      // error: E — copy из result
  }
  // result жив — можно использовать дальше
  ```

**match vs switch:**

| | `switch` | `match` |
|---|---|---|
| Тип | statement | expression (возвращает значение) |
| Exhaustiveness | warning | ошибка компилятора |
| Паттерны | только равенство | литералы, диапазоны, деструктуризация, `\|` |
| Fallthrough | запрещён | нет (каждая ветка — отдельное выражение) |

