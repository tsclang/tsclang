# Classes

[← Up](./index.md) | [Next →](./interfaces.md)

---

TSClang classes are a nominal type with methods, ownership semantics for `this`, and auto-generated constructors. Inheritance is absent (except for `extends Error`), polymorphism is implemented via interfaces.

## Class definition

```typescript
class Counter {
    private value: i32 = 0;

    public get(): i32 {                  // this: Ref<Counter>
        return this.value;
    }

    public mut increment(): void {       // this: Mut<Counter>
        this.value++;
    }

    static create(): Counter {           // static — no this
        return new Counter();
    }
}
```

## Inheritance is forbidden (except Error)

`extends` is allowed **only** for direct descendants of `Error`. Chains are forbidden.

```typescript
class MyError extends Error { message: string }             // ok
class TimeoutError extends NetworkError { ... }             // compiler error
```

For logical grouping of errors use interfaces:

```typescript
interface INetworkError { code: i32 }

class NetworkError extends Error implements INetworkError { code: i32 }
class TimeoutError extends Error implements INetworkError { code: i32; constructor(msg: string) { super(msg); this.code = 408 } }

function handleNetworkError(e: INetworkError): void { ... }
```

Instead of inheritance — composition:

```typescript
class Animal {
    name: string;
    mut speak(): string { ... }
}

class Dog {
    animal: Animal;   // composition
    breed: string;
}
```

## Method and field modifiers

| Modifier | Description |
|----------|-------------|
| `public` | visible everywhere (default) |
| `private` | visible only inside the class |
| `static` | method on the class, no `this` |
| `mut` | `this` — `Mut<Self>`, otherwise `Ref<Self>` |
| `move` | `this` — `Self` (owned), object is moved into the method |

```typescript
const c = new Counter();
c.get();        // ok
c.increment();  // error: cannot call mut method on const

let c2 = new Counter();
c2.increment(); // ok
```

- `static` + `mut` — compiler error (no `this`)
- `protected` — absent (no inheritance)

## `this` semantics and field access

The `this` type determines the type of `this.field`, then standard argument passing rules apply:

| Method kind | `this` type | `this.field` (complex) | `this.field` (primitive) |
|-------------|-------------|------------------------|--------------------------|
| regular | `Ref<Self>` | `Ref<T>` | copy |
| `mut` | `Mut<Self>` | `Mut<T>` | copy |
| `move` | `Self` (owned) | `T` (owned) | copy |

```typescript
function sendEmail(to: string): void { ... }        // expects owned string
function printRef(s: Ref<string>): void { ... }     // expects borrow

class QueryBuilder {
    query: string;

    preview(): void {                               // this: Ref<Self>
        printRef(this.query);                       // ok — Ref<string> → Ref<string>
        sendEmail(this.query);                      // error — Ref<string> → string forbidden
        sendEmail(this.query.clone());              // ok
    }

    mut setQuery(q: string): void {                 // this: Mut<Self>
        this.query = q;                             // ok — Mut allows writing
    }

    move build(): Query {                           // this: Self (owned)
        return new Query(this.query);               // ok — move field
    }
}

let b = new QueryBuilder("SELECT *");
const q = b.build();    // b is moved into the method
console.log(b);         // error: b was moved
```

## readonly fields

A `readonly` field can be written only in the constructor:

```typescript
class User {
    readonly id: i32;
    name: string;

    constructor(id: i32, name: string) {
        this.id = id;      // ok
        this.name = name;
    }

    mut rename(newName: string) {
        this.name = newName;   // ok
        this.id = 99;          // error: readonly
    }
}
```

A `mut` method can change regular fields, but not `readonly`.

## Value Object pattern

All fields are `readonly`, no `mut` methods — the class is fully immutable after construction:

```typescript
class Point {
    readonly x: f64
    readonly y: f64

    constructor(x: f64, y: f64) {
        this.x = x
        this.y = y
    }

    distanceTo(other: Ref<Point>): f64 {
        const dx = this.x - other.x
        const dy = this.y - other.y
        return Math.sqrt(dx * dx + dy * dy)
    }

    translate(dx: f64, dy: f64): Point {
        return new Point(this.x + dx, this.y + dy)   // new object
    }
}

const p = new Point(1.0, 2.0)
p.x = 5.0   // error: readonly
```

The linter warns if a class has all fields `readonly` but contains a `mut` method.

## Builder pattern with move

A `move` method passes fields without extra copying when the source object is no longer needed:

```typescript
class QueryBuilder {
    query: string;
    params: i32[];

    build(): Query {
        return new Query(this.query.clone(), this.params.clone());   // extra copy
    }

    move build(): Query {
        return new Query(this.query, this.params);                   // move — no copy
    }
}

let b = new QueryBuilder("SELECT *", [1, 2, 3]);
const q = b.build();    // b is moved, data passed without copy
```

## Constructor

### Auto-generation

If a constructor is not written explicitly, the compiler generates one from fields:

- Fields **with defaults** → parameter with default value
- Fields **without defaults** → required parameter (in declaration order)
- `private` fields **with defaults** → auto-initialized, not included in parameters
- `private` fields **without defaults** → compiler error

```typescript
class User {
    name: string;       // required
    age: i32 = 0;       // optional
    active: boolean = true;
}
// auto-generated: constructor(name: string, age: i32 = 0, active: boolean = true)

new User("Alice");            // ok
new User("Alice", 30);        // ok
new User("Alice", 30, false); // ok
new User();                   // error: name is required
```

### Explicit constructor

The compiler checks that all fields without defaults are initialized on all execution paths (definite assignment analysis).

```typescript
class Point {
    x: f64;
    y: f64;

    constructor(x: f64 = 0.0, y: f64 = 0.0) {
        this.x = x;
        this.y = y;
    }
}

new Point();          // x=0.0, y=0.0
new Point(1.0);       // x=1.0, y=0.0
new Point(1.0, 2.0);  // x=1.0, y=2.0
```

### Private constructor (singleton/factory)

```typescript
class Config {
    private constructor() { ... }

    static create(): Config {
        return new Config();   // ok — inside the class
    }
}

let c = new Config();    // error: constructor is private
let c = Config.create(); // ok
```

### Constructor taking ownership (move)

```typescript
class Line {
    start: Point;
    end: Point;

    constructor(start: Point, end: Point) {
        this.start = start;   // move
        this.end = end;       // move
    }
}

const p1 = new Point(0, 0);
const p2 = new Point(1, 1);
const line = new Line(p1, p2);
console.log(p1);   // error: p1 was moved into line
```

## C-output

```typescript
class Counter {
    value: i32 = 0;
    mut increment(): void { this.value++; }
    get(): i32 { return this.value; }
}
```

```c
typedef struct {
    int32_t value;
} Counter;

void Counter_init(Counter* self) {
    self->value = 0;
}

void Counter_increment(Counter* self) {
    self->value++;
}

int32_t Counter_get(const Counter* self) {
    return self->value;
}
```

## Errors

| Error | Cause |
|-------|-------|
| `extends is only allowed for Error` | Attempt to inherit from an arbitrary class |
| `cannot chain Error inheritance` | `class A extends B` where `B extends Error` |
| `cannot call mut method on const` | Calling `mut` method on a `const` variable |
| `cannot call move method on const` | Calling `move` method on a `const` variable |
| `static and mut are incompatible` | `static mut` — no `this` |
| `readonly field 'id' cannot be assigned` | Writing to `readonly` outside constructor |
| `variable 'b' was moved` | Accessing a variable after `move` |
| `private field without default requires explicit constructor` | No way to initialize the field |

## See also

- [Interfaces](./interfaces.md) — polymorphism via `implements`, fat pointer vtable
- [Generics](./generics.md) — parameterized classes and functions
- [Memory Model — Owner](../05-memory/owner.md) — move semantics, `Ref<T>`, `Mut<T>`
- [Memory Model — Borrow rules](../05-memory/borrow-rules.md) — Borrow Checker rules
