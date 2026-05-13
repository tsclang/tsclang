# Интерфейсы

[← Вверх](./index.md) | [Следующий →](./enum.md) | [Предыдущий ←](./classes.md)

---

Интерфейсы TSClang имеют два режима: data-интерфейс (без методов, компилируется в `typedef struct`) и контрактный (с методами, компилируется в fat pointer с vtable). Структурная типизация — совместимость по форме, а не по имени.

## Data-интерфейс (без методов)

Компилируется в обычную C-структуру. Нет vtable, нет overhead.

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

Объектные литералы допустимы, если интерфейс не содержит методов.

## Контрактный интерфейс (с методами)

Компилируется в fat pointer: указатель на данные + указатель на vtable. Аналог `dyn Trait` в Rust.

```typescript
interface Drawable {
    draw(): void;
    mut resize(factor: f64): void;
}

class Circle implements Drawable {
    r: f64;
    draw(): void { ... }
    mut resize(factor: f64): void { ... }
}

let shape: Drawable = new Circle();   // fat pointer: self + vtable
shape.draw();                         // ok — immutable метод
shape.resize(2.0);                    // ok — mut метод, shape это let

const shape2: Drawable = new Circle();
shape2.resize(2.0);                   // ошибка: нельзя вызвать mut метод на const
```

```c
typedef struct {
    void (*draw)(void* self);
    void (*resize)(void* self, double factor);
} Drawable_vtable;

typedef struct {
    void* self;
    Drawable_vtable* vtable;
} Drawable;
```

## `instanceof` — проверка типа

`instanceof` проверяет конкретный тип за interface fat pointer через сравнение адресов vtable — O(1), без RTTI overhead.

```typescript
interface Drawable { draw(): void }
class Circle implements Drawable { r: f64; draw(): void { ... } }
class Rect   implements Drawable { w: f64; h: f64; draw(): void { ... } }

let shape: Drawable = new Circle();

if (shape instanceof Circle) {
    console.log(shape.r);   // ok — компилятор сужает тип до Circle
}
```

```c
if (shape.vtable == &Circle_Drawable_vtable) {
    Circle* _shape = (Circle*)shape.self;
    printf("%f\n", _shape->r);
}
```

**Ограничения `instanceof`:**

- Работает **только** для interface-переменных (fat pointer)
- `instanceof` с классом напрямую (`c instanceof Circle`) — ошибка: тип уже известен статически
- Компилятор выполняет type narrowing внутри `if (x instanceof T)`

## Несколько интерфейсов

Класс может реализовывать несколько интерфейсов:

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

let shape: Drawable = new Circle();       // ok
let resizable: Resizable = new Circle();  // ok
```

Если класс не реализует все методы интерфейса — ошибка компилятора.

## `mut`-методы интерфейса

Подчиняются тем же правилам, что и `mut`-методы класса: `const` переменная запрещает вызов, `let` — разрешает.

```typescript
interface Drawable {
    draw(): void;
    mut resize(factor: f64): void;
}

const shape: Drawable = new Circle();
shape.draw();      // ok
shape.resize(2.0); // ошибка: нельзя вызвать mut метод на const
```

## Структурная совместимость

Интерфейсы используют структурную типизацию — класс совместим с интерфейсом если имеет все требуемые поля/методы, даже без явного `implements`:

```typescript
interface Printable {
    toString(): string;
}

class User {
    name: string;
    toString(): string { return this.name }
}

function print(p: Printable): void { console.log(p.toString()) }

print(new User());  // ok — структурная совместимость
```

Для data-интерфейсов структурная совместимость работает через поля:

```typescript
interface HasId { id: i32 }

class User { id: i32; name: string }
class Order { id: i32; total: f64 }

function findById(items: HasId[], id: i32): HasId | null { ... }
```

## C-output

### Data-интерфейс

```typescript
interface Point { x: f64; y: f64 }
```

```c
typedef struct { double x; double y; } Point;
```

### Контрактный интерфейс

```typescript
interface Drawable { draw(): void; mut resize(factor: f64): void }
class Circle implements Drawable { r: f64; draw(): void { ... }; mut resize(factor: f64): void { ... } }
```

```c
typedef struct {
    void (*draw)(void* self);
    void (*resize)(void* self, double factor);
} Drawable_vtable;

typedef struct {
    void* self;
    Drawable_vtable* vtable;
} Drawable;

static Drawable_vtable Circle_Drawable_vtable = {
    .draw = (void(*)(void*))Circle_draw,
    .resize = (void(*)(void*, double))Circle_resize,
};
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `class Circle does not implement method 'draw' from interface Drawable` | Не все методы реализованы |
| `instanceof requires interface-typed variable` | `c instanceof Circle` при известном типе |
| `cannot call mut method on const` | Вызов `mut`-метода на `const` interface-переменной |

## См. также

- [Классы](./classes.md) — определение, модификаторы, `this`-семантика
- [Enum](./enum.md) — перечисления
- [Generics](./generics.md) — параметризация с bounds
- [Модель памяти](../05-memory/index.md) — ownership, fat pointer, borrow checker
