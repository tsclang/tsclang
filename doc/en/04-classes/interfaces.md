# Interfaces

[← Up](./index.md) | [Next →](./enum.md) | [Previous ←](./classes.md)

---

TSClang interfaces have two modes: data interface (without methods, compiles to `typedef struct`) and contract (with methods, compiles to fat pointer with vtable). Structural typing — compatibility by shape, not by name.

## Data interface (without methods)

Compiles to an ordinary C struct. No vtable, no overhead.

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

Object literals are allowed if the interface contains no methods.

## Contract interface (with methods)

Compiles to a fat pointer: data pointer + vtable pointer. Analogous to `dyn Trait` in Rust.

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
shape.draw();                         // ok — immutable method
shape.resize(2.0);                    // ok — mut method, shape is let

const shape2: Drawable = new Circle();
shape2.resize(2.0);                   // error: cannot call mut method on const
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

## `instanceof` — type check

`instanceof` checks the concrete type behind an interface fat pointer via vtable address comparison — O(1), without RTTI overhead.

```typescript
interface Drawable { draw(): void }
class Circle implements Drawable { r: f64; draw(): void { ... } }
class Rect   implements Drawable { w: f64; h: f64; draw(): void { ... } }

let shape: Drawable = new Circle();

if (shape instanceof Circle) {
    console.log(shape.r);   // ok — compiler narrows type to Circle
}
```

```c
if (shape.vtable == &Circle_Drawable_vtable) {
    Circle* _shape = (Circle*)shape.self;
    printf("%f\n", _shape->r);
}
```

**`instanceof` limitations:**

- Works **only** for interface variables (fat pointer)
- `instanceof` with a class directly (`c instanceof Circle`) — error: type is already known statically
- The compiler performs type narrowing inside `if (x instanceof T)`

## Multiple interfaces

A class can implement multiple interfaces:

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

If a class does not implement all methods of an interface — compiler error.

## `mut` interface methods

Obey the same rules as `mut` class methods: `const` variable forbids the call, `let` allows it.

```typescript
interface Drawable {
    draw(): void;
    mut resize(factor: f64): void;
}

const shape: Drawable = new Circle();
shape.draw();      // ok
shape.resize(2.0); // error: cannot call mut method on const
```

## Structural compatibility

Interfaces use structural typing — a class is compatible with an interface if it has all required fields/methods, even without explicit `implements`:

```typescript
interface Printable {
    toString(): string;
}

class User {
    name: string;
    toString(): string { return this.name }
}

function print(p: Printable): void { console.log(p.toString()) }

print(new User());  // ok — structural compatibility
```

For data interfaces structural compatibility works via fields:

```typescript
interface HasId { id: i32 }

class User { id: i32; name: string }
class Order { id: i32; total: f64 }

function findById(items: HasId[], id: i32): HasId | null { ... }
```

## C-output

### Data interface

```typescript
interface Point { x: f64; y: f64 }
```

```c
typedef struct { double x; double y; } Point;
```

### Contract interface

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

## Errors

| Error | Cause |
|-------|-------|
| `class Circle does not implement method 'draw' from interface Drawable` | Not all methods implemented |
| `instanceof requires interface-typed variable` | `c instanceof Circle` with known type |
| `cannot call mut method on const` | Calling `mut` method on `const` interface variable |

## See also

- [Classes](./classes.md) — definition, modifiers, `this` semantics
- [Enum](./enum.md) — enumerations
- [Generics](./generics.md) — parameterization with bounds
- [Memory Model](../05-memory/index.md) — ownership, fat pointer, borrow checker
