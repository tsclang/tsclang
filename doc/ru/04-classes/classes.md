# Классы

[← Вверх](./index.md) | [Следующий →](./interfaces.md)

---

Классы TSClang — номинальный тип с методами, ownership-семантикой `this` и автогенерацией конструктора. Наследование отсутствует (кроме `extends Error`), полиморфизм реализуется через интерфейсы.

## Определение класса

```typescript
class Counter {
    private value: i32 = 0;

    public get(): i32 {                  // this: Ref<Counter>
        return this.value;
    }

    public mut increment(): void {       // this: Mut<Counter>
        this.value++;
    }

    static create(): Counter {           // static — нет this
        return new Counter();
    }
}
```

## Наследование запрещено (кроме Error)

`extends` разрешён **только** для прямого наследника `Error`. Цепочки запрещены.

```typescript
class MyError extends Error { message: string }             // ok
class TimeoutError extends NetworkError { ... }             // ошибка компилятора
```

Для логической группировки ошибок используйте интерфейсы:

```typescript
interface INetworkError { code: i32 }

class NetworkError extends Error implements INetworkError { code: i32 }
class TimeoutError extends Error implements INetworkError { code: i32; constructor(msg: string) { super(msg); this.code = 408 } }

function handleNetworkError(e: INetworkError): void { ... }
```

Вместо наследования — композиция:

```typescript
class Animal {
    name: string;
    mut speak(): string { ... }
}

class Dog {
    animal: Animal;   // композиция
    breed: string;
}
```

## Модификаторы методов и полей

| Модификатор | Описание |
|-------------|----------|
| `public` | виден везде (по умолчанию) |
| `private` | виден только внутри класса |
| `static` | метод на классе, нет `this` |
| `mut` | `this` — `Mut<Self>`, иначе `Ref<Self>` |
| `move` | `this` — `Self` (owned), объект перемещается в метод |

```typescript
const c = new Counter();
c.get();        // ok
c.increment();  // ошибка: нельзя вызвать mut метод на const

let c2 = new Counter();
c2.increment(); // ok
```

- `static` + `mut` — ошибка компилятора (нет `this`)
- `protected` — отсутствует (нет наследования)

## Семантика `this` и доступ к полям

Тип `this` определяет тип `this.field`, затем применяются стандартные правила передачи аргументов:

| Вид метода | `this` тип | `this.field` (сложный) | `this.field` (примитив) |
|-----------|------------|------------------------|------------------------|
| обычный | `Ref<Self>` | `Ref<T>` | copy |
| `mut` | `Mut<Self>` | `Mut<T>` | copy |
| `move` | `Self` (owned) | `T` (owned) | copy |

```typescript
function sendEmail(to: string): void { ... }        // ожидает owned string
function printRef(s: Ref<string>): void { ... }     // ожидает borrow

class QueryBuilder {
    query: string;

    preview(): void {                               // this: Ref<Self>
        printRef(this.query);                       // ok — Ref<string> → Ref<string>
        sendEmail(this.query);                      // ошибка — Ref<string> → string запрещено
        sendEmail(this.query.clone());              // ok
    }

    mut setQuery(q: string): void {                 // this: Mut<Self>
        this.query = q;                             // ok — Mut разрешает запись
    }

    move build(): Query {                           // this: Self (owned)
        return new Query(this.query);               // ok — move поля
    }
}

let b = new QueryBuilder("SELECT *");
const q = b.build();    // b перемещён в метод
console.log(b);         // ошибка: b перемещён
```

## readonly-поля

`readonly` поле можно записать только в конструкторе:

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
        this.id = 99;          // ошибка: readonly
    }
}
```

`mut` метод может менять обычные поля, но не `readonly`.

## Value Object паттерн

Все поля `readonly`, нет `mut` методов — класс полностью иммутабелен после конструктора:

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
        return new Point(this.x + dx, this.y + dy)   // новый объект
    }
}

const p = new Point(1.0, 2.0)
p.x = 5.0   // ошибка: readonly
```

Линтер предупреждает если класс имеет все поля `readonly`, но содержит `mut` метод.

## Builder паттерн с move

`move` метод передаёт поля без лишнего копирования, когда исходный объект больше не нужен:

```typescript
class QueryBuilder {
    query: string;
    params: i32[];

    build(): Query {
        return new Query(this.query.clone(), this.params.clone());   // лишняя копия
    }

    move build(): Query {
        return new Query(this.query, this.params);                   // move — без копии
    }
}

let b = new QueryBuilder("SELECT *", [1, 2, 3]);
const q = b.build();    // b перемещён, данные переданы без копии
```

## Конструктор

### Автогенерация

Если конструктор не написан явно, компилятор генерирует его из полей:

- Поля **с дефолтом** → параметр со значением по умолчанию
- Поля **без дефолта** → обязательный параметр (в порядке объявления)
- `private` поля **с дефолтом** → авто-инициализируются, в параметры не включаются
- `private` поля **без дефолта** → ошибка компилятора

```typescript
class User {
    name: string;       // обязательный
    age: i32 = 0;       // необязательный
    active: boolean = true;
}
// автосгенерировано: constructor(name: string, age: i32 = 0, active: boolean = true)

new User("Alice");            // ok
new User("Alice", 30);        // ok
new User("Alice", 30, false); // ok
new User();                   // ошибка: name обязателен
```

### Явный конструктор

Компилятор проверяет, что все поля без дефолта инициализированы на всех путях выполнения (definite assignment analysis).

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

### Private конструктор (singleton/factory)

```typescript
class Config {
    private constructor() { ... }

    static create(): Config {
        return new Config();   // ok — внутри класса
    }
}

let c = new Config();    // ошибка: конструктор private
let c = Config.create(); // ok
```

### Конструктор забирает владение (move)

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
console.log(p1);   // ошибка: p1 перемещён в line
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

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `extends is only allowed for Error` | Попытка наследования от произвольного класса |
| `cannot chain Error inheritance` | `class A extends B` где `B extends Error` |
| `cannot call mut method on const` | Вызов `mut`-метода на `const`-переменной |
| `cannot call move method on const` | Вызов `move`-метода на `const`-переменной |
| `static and mut are incompatible` | `static mut` — нет `this` |
| `readonly field 'id' cannot be assigned` | Запись в `readonly` вне конструктора |
| `variable 'b' was moved` | Обращение к переменной после `move` |
| `private field without default requires explicit constructor` | Нет способа инициализировать поле |

## См. также

- [Интерфейсы](./interfaces.md) — полиморфизм через `implements`, fat pointer vtable
- [Generics](./generics.md) — параметризованные классы и функции
- [Модель памяти — Owner](../05-memory/owner.md) — move-семантика, `Ref<T>`, `Mut<T>`
- [Модель памяти — Borrow rules](../05-memory/borrow-rules.md) — правила Borrow Checker
