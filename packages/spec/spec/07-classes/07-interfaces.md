## Интерфейсы

Два назначения:

**1. Данные без методов** — компилируется в `typedef struct`:
```typescript
interface Point {
    x: f64;
    y: f64;
}

let p: Point = { x: 10.5, y: 20.3 };
```
```c
typedef struct { double x; double y; } Point;
```

**2. Контракт с методами** — компилируется в vtable (fat pointer, как `dyn Trait` в Rust):
```typescript
interface Drawable {
    draw(): void;
    mut resize(factor: f64): void;
}

class Circle implements Drawable {
    draw(): void { ... }
    mut resize(factor: f64): void { ... }
}

let shape: Drawable = new Circle();  // fat pointer: self + vtable
shape = new Rect();                  // ok — другой тип, та же переменная
shape.draw();                        // ok — immutable метод
shape.resize(2.0);                   // ok — mut метод, shape это let

const shape2: Drawable = new Circle();
shape2.draw();                       // ok
shape2.resize(2.0);                  // ошибка: нельзя вызвать mut метод на const
```
```c
typedef struct {
    void (*draw)(void* self);
    void (*resize)(void* self, double factor);
} Drawable_vtable;

typedef struct {
    void* self;
    const Drawable_vtable *vtable;
} Drawable;
```

## `instanceof`

Проверка конкретного типа за interface fat pointer — сравнение vtable-адресов:

```typescript
interface Drawable { draw(): void }
class Circle implements Drawable { r: f64; draw(): void { ... } }
class Rect   implements Drawable { w: f64; h: f64; draw(): void { ... } }

let shape: Drawable = new Circle();

### Сужение типов через instanceof (Type Narrowing) — [NOT YET IMPLEMENTED]

В стандартной семантике TypeScript проверка `if (x instanceof User)` автоматически сужает тип переменной `x` до `User` внутри лексического блока `if`.

В текущей версии компилятора автоматическое сужение типов (Type Narrowing) на базе рантайм-проверок vtable находится в стадии разработки. Внутри блока `if` переменная сохраняет свой исходный базовый тип. Для доступа к полям дочернего класса разработчик обязан использовать явное приведение типов (Type Assertion) через оператор `as`: `(x as User).radius`. Полноценный статический анализ графа сужения типов запланирован в рамках следующих релизов Type Checker'а.

```typescript
interface Drawable { draw(): void }
class Circle implements Drawable { r: f64; draw(): void { ... } }
class Rect   implements Drawable { w: f64; h: f64; draw(): void { ... } }

let shape: Drawable = new Circle();

if (shape instanceof Circle) {
    // type narrowing ещё не реализован — shape всё ещё Drawable
    console.log((shape as Circle).r);   // ok через явный cast
}
```

C-output (vtable comparison):
```c
if (shape.vtable == &_Circle_Drawable_vtable) {
    printf("%f\n", ((Circle *)shape.self)->r);
}
```

- `instanceof` работает **только** для interface-переменных (fat pointer)
- `instanceof` с классом напрямую (`let c: Circle; c instanceof Circle`) — компилируется в `1` (compile-time constant, всегда true)
- Каждый класс, реализующий interface, имеет уникальный vtable — сравнение O(1), без RTTI overhead

- Класс может реализовывать несколько интерфейсов: `class Foo implements A, B`
- `mut` методы интерфейса подчиняются тем же правилам что и `mut` методы класса: `const` переменная запрещает вызов, `let` — разрешает
  ```typescript
  interface Drawable {
      draw(): void;
  }

  interface Resizable {
      mut resize(factor: f64): void;
  }

  class Circle implements Drawable, Resizable {
      draw(): void { ... }
      mut resize(factor: f64): void { ... }
  }

  let shape: Drawable = new Circle();    // ok
  let resizable: Resizable = new Circle(); // ok
  ```
- Если класс не реализует все методы интерфейса — ошибка компилятора

