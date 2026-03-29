# TSClang — Классы и объектная система

## Generics

- **Монорфизация** — компилятор генерирует отдельный код для каждого конкретного типа:
  - `identity<i32>` → `identity_i32` в C
  - `identity<User>` → `identity_User` в C
- **Синтаксис** — TypeScript-стиль `<T>`:
  ```typescript
  function identity<T>(x: T): T { return x; }
  function map<T, U>(arr: Ref<T[]>, f: (x: Ref<T>) => U): U[] { ... }

  class Stack<T> {
      items: T[];
      mut push(item: T): void { ... }
      mut pop(): T { ... }
  }
  ```
- **Bounds** — ограничение типового параметра через `implements` или `extends` (синонимы):
  ```typescript
  // оба синтаксиса эквивалентны — компилятор принимает оба
  function sort<T implements Comparable<T>>(arr: Mut<T[]>): void { ... }
  function sort<T extends  Comparable<T>>(arr: Mut<T[]>): void { ... }

  // несколько bounds
  function process<T implements Comparable<T> & Serializable>(val: T): void { ... }

  // структурный bound (по полям, без interface)
  function findById<T implements { id: i32 }>(arr: T[], id: i32): T | null { ... }

  // несколько параметров с bounds
  function zip<A implements Clone, B implements Clone>(a: A[], b: B[]): [A, B][] { ... }
  ```
  > **Линтер:** может предупредить, что предпочтительнее использовать `implements` над `extends`, но это ломает совместимость с TS. В generic-позиции — `extends` семантически означает наследование, которого в TSClang нет. `extends` допустим для совместимости с привычками TS-разработчиков.

- Без bounds — проверка при инстанцировании. Правила ownership применяются в момент подстановки конкретного типа:
  ```typescript
  first<i32>(arr);   // ok — примитив, копируется
  first<User>(arr);  // ошибка в точке вызова: User — сложный тип, нельзя вернуть T из Ref<T[]>
  ```
- **Ownership с generics** — `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>` работают как обычно:
  ```typescript
  function first<T>(arr: Ref<T[]>): Ref<T> { ... }  // borrow элемента
  function pop<T>(arr: Mut<T[]>): T { ... }          // move с удалением
  function process<T>(graph: Shared<T>) { ... }      // ARC
  ```

## Extension Methods

Добавление методов к существующим типам без изменения их определения. Импортируются явно — не загрязняют тип глобально.

```typescript
// std/string.tsc — объявление extension
export extension function charCount(this: string): i32 {
    // ... подсчёт codepoints
}

export extension function chars(this: string): Iterator<u32> {
    // ... итератор по codepoints
}
```

```typescript
// main.tsc — использование
import { charCount, chars } from "std/string"

const s = "привет"
s.charCount()   // ✅ — extension доступен после импорта
s.chars()       // ✅

// в другом файле без импорта:
s.charCount()   // ❌ ошибка компилятора: method charCount not found on string
                //    hint: import { charCount } from "std/string"
```

**Правила:**
- `this` — первый параметр, указывает расширяемый тип; не передаётся явно при вызове
- Методы типа имеют **приоритет** над extension — переопределить существующий метод невозможен (ошибка компилятора). Распространяется на: методы классов, методы задекларированные в `.d.tsc` (`declare function`)
  ```typescript
  class User {
      format(): string { return "class" }
  }
  export extension function format(this: User): string { return "ext" }
  // ❌ error: extension 'format' conflicts with existing method on User
  //    hint: rename extension or use different method name
  ```
- Extension виден только в файлах где он импортирован — **нет глобального загрязнения**
- Работает для любого типа: `string`, `i32`, пользовательских `type`/`interface`/`class`

**Пользовательские extensions:**
```typescript
// my_ext.tsc
export extension function toJson(this: User): string {
    return `{"name":"${this.name}","age":${this.age}}`
}
```

```typescript
import { toJson } from "./my_ext"
user.toJson()   // ✅
```

**C-output** — статический вызов, zero overhead:
```c
// import { charCount } from "std/string"  →
#include "std_string.h"
int32_t n = tsc_std_string_charCount(s);   // статический вызов, нет vtable
```

**Конфликт двух extensions с одинаковым именем:**

Если два разных модуля экспортируют extension с одинаковым именем для одного типа — это ошибка компилятора при попытке использовать оба одновременно:

```typescript
// module-a.tsc
export extension function format(this: string): string { ... }

// module-b.tsc
export extension function format(this: string): string { ... }

// main.tsc
import { format } from "./module-a"
import { format } from "./module-b"   // ❌ ошибка: ambiguous extension 'format' for type 'string'
                                      //    hint: use 'import { format as fmtA } from "./module-a"'
```

Разрешение — переименовать при импорте через `as`:

```typescript
import { format as fmtA } from "./module-a"
import { format as fmtB } from "./module-b"

"hello".fmtA()   // ✅ явно модуль-a
"hello".fmtB()   // ✅ явно модуль-b
```

Импортировать одно имя (второй не импортирован) — ошибки нет:

```typescript
import { format } from "./module-a"   // ✅ — только один, нет конфликта
"hello".format()
```

## Enum

### Числовой enum

```typescript
enum Direction { North, South, East, West }   // 0, 1, 2, 3
enum Color { Red = 1, Green = 2, Blue = 4 }   // явные значения (битовые флаги)
```

C-output:
```c
typedef enum { North, South, East, West } Direction;
static const Direction Direction_values[] = { North, South, East, West };
static const char*    Direction_names[]  = { "North", "South", "East", "West" };
```

### Строковый enum

```typescript
enum Status { Ok = "OK", Fail = "FAIL", Pending = "PENDING" }
```

C-output:
```c
typedef enum { Status_Ok, Status_Fail, Status_Pending } Status;
static const char* Status_strings[] = { "OK", "FAIL", "PENDING" };
```

### const enum

Только C enum, без runtime таблиц. Используется когда важен размер бинаря (embedded).

```typescript
const enum Pin { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 }
```

C-output:
```c
typedef enum { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 } Pin;
// больше ничего — нет таблиц
```

Утилиты на `const enum` недоступны — ошибка компилятора:
```typescript
Pin.values()         // error: const enum has no runtime table
Pin.fromValue(0)       // error: const enum has no runtime table
Pin.PA0.toString()   // error: const enum has no runtime table
```

### Утилиты enum (только обычный enum)

```typescript
enum Direction { North, South, East, West }

Direction.values()           // Direction[] — все значения: [North, South, East, West]
Direction.fromValue(2)         // Direction | null — Direction.East | null если не найдено
Direction.North.toString()   // string — "North"

// использование
for (const d of Direction.values()) {
    console.log(d.toString());
}

const d = Direction.fromValue(userInput);
if (d != null) {
    console.log(d.toString());
}
```

### enum в switch / match

```typescript
// switch — компилятор выдаёт warning если не все значения покрыты
switch (dir) {
    case Direction.North: ...; break;
    case Direction.South: ...; break;
    case Direction.East:  ...; break;
    case Direction.West:  ...; break;
}

// match — ошибка компилятора если не все значения покрыты (exhaustiveness)
const label = match (dir) {
    Direction.North => "вверх",
    Direction.South => "вниз",
    Direction.East  => "вправо",
    Direction.West  => "влево",
    // _ не нужен — все случаи покрыты
};
```

### enum vs const enum

| | `enum` | `const enum` |
|---|---|---|
| C-output | `typedef enum` + таблицы | только `typedef enum` |
| `.values()` | ✅ | ❌ |
| `.fromValue()` | ✅ | ❌ |
| `.toString()` | ✅ | ❌ |
| Размер бинаря | больше | минимальный |
| Применение | общий случай | embedded, флаги, константы |

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
    Drawable_vtable* vtable;
} Drawable;
```

## `instanceof`

Проверка конкретного типа за interface fat pointer — сравнение vtable-адресов:

```typescript
interface Drawable { draw(): void }
class Circle implements Drawable { r: f64; draw(): void { ... } }
class Rect   implements Drawable { w: f64; h: f64; draw(): void { ... } }

let shape: Drawable = new Circle();

if (shape instanceof Circle) {
    // компилятор сужает тип: shape — Circle здесь
    console.log(shape.r);   // ok
}
```

C-output:
```c
if (shape.vtable == &Circle_Drawable_vtable) {
    Circle* _shape = (Circle*)shape.self;
    printf("%f\n", _shape->r);
}
```

- `instanceof` работает **только** для interface-переменных (fat pointer)
- `instanceof` с классом напрямую (`let c: Circle; c instanceof Circle`) — ошибка компилятора, тип и так известен статически
- Компилятор выполняет type narrowing внутри `if (x instanceof T)` — тип переменной сужается до `T`
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

## Классы

**Наследования нет** — только композиция. `extends` запрещён, **кроме одного исключения**: `class MyError extends Error` — прямой наследник `Error`. Цепочки запрещены: `class TimeoutError extends NetworkError` — ошибка компилятора. Полиморфизм — только через `interface` + `implements`.

Для логической группировки ошибок — интерфейс:
```typescript
interface INetworkError { code: i32 }

class NetworkError extends Error implements INetworkError { code: i32 }
class TimeoutError extends Error implements INetworkError {
    code: i32
    constructor(msg: string) { super(msg); this.code = 408 }
}

// группировка через интерфейс:
function handleNetworkError(e: INetworkError): void { ... }
```

Это сохраняет flat C-структуры без type_id и делает catch статически типизированным.

```typescript
// вместо наследования — композиция
class Animal {
    name: string;
    mut speak(): string { ... }
}

class Dog {
    animal: Animal;  // композиция
    breed: string;
}
```

`mut` определяет семантику `this`. Модификаторы методов и полей:

| Модификатор | Описание |
|-------------|----------|
| `public` | виден везде (по умолчанию) |
| `private` | виден только внутри класса |
| `static` | метод на классе, нет `this` |
| `mut` | `this` — `Mut<Self>`, иначе `Ref<Self>` |
| `move` | `this` — `Self` (owned), объект перемещается в метод при вызове |

```typescript
class Counter {
    private value: i32 = 0;

    public get(): i32 {                  // this — Ref<Counter>
        return this.value;
    }

    public mut increment(): void {       // this — Mut<Counter>
        this.value++;
    }

    private mut reset(): void {          // private mutable
        this.value = 0;
    }

    static create(): Counter {           // static — нет this
        return new Counter();
    }

    private static default(): Counter {  // private static
        return new Counter();
    }
}

const c = new Counter();
c.get();        // ok
c.increment();  // ошибка: нельзя вызвать mut метод на const

let c2 = new Counter();
c2.increment(); // ok
```

- `static` + `mut` — недопустимо, ошибка компилятора (нет `this`)
- `protected` — отсутствует (нет наследования)

## Семантика `this` и доступ к полям

Тип `this` определяет тип `this.field`. Затем применяются **те же правила передачи аргументов** что и для обычных функций — см. матрицу совместимости в разделе "Правила передачи аргументов в функцию" ([spec/04-memory.md](spec/04-memory.md)):

| Вид метода | `this` тип | `this.field` тип (сложный) | `this.field` тип (примитив) |
|-----------|------------|---------------------------|---------------------------|
| обычный | `Ref<Self>` | `Ref<T>` | copy |
| `mut` | `Mut<Self>` | `Mut<T>` | copy |
| `move` | `Self` (owned) | `T` (owned) | copy |

Тип `this.field` определяется типом `this`. Затем применяются **те же правила из матрицы совместимости**:

```typescript
function sendEmail(to: string): void { ... }    // ожидает owned string
function printRef(s: Ref<string>): void { ... } // ожидает borrow

class QueryBuilder {
    query: string;
    params: i32[];

    // обычный метод — this: Ref<Self>, this.query: Ref<string>
    preview(): void {
        printRef(this.query);          // ok — Ref<string> → Ref<string> ✅
        sendEmail(this.query);         // ошибка — Ref<string> → string ❌
                                       // матрица: Ref<T> → T (owned) = запрещено
                                       // hint: clone если string implements Clone
        sendEmail(this.query.clone()); // ok ✅
        console.log(this.params[0]);   // ok — i32 всегда copy ✅
    }

    // mut метод — this: Mut<Self>, this.query: Mut<string>
    mut setQuery(q: string): void {
        this.query = q;                // ok — Mut разрешает запись ✅
        sendEmail(this.query);         // ошибка — Mut<string> → string ❌
                                       // матрица: Mut<T> → T (owned) = запрещено
        sendEmail(this.query.clone()); // ok ✅
    }

    // move метод — this: Self (owned), this.query: string (owned)
    move build(): Query {
        return new Query(this.query, this.params);  // ok — T → T, move ✅
    }
}

let b = new QueryBuilder("SELECT *", [1, 2]);
b.preview();           // ok — b жив ✅
b.setQuery("INSERT");  // ok — b жив ✅
const q = b.build();   // ok — b moved в метод
console.log(b);        // ошибка: b перемещён ❌

const b2 = new QueryBuilder("SELECT *", []);
b2.build();            // ошибка: нельзя вызвать move метод на const ❌
```

`readonly` поле можно записать только в конструкторе:

```typescript
class User {
    readonly id: i32;
    name: string;

    constructor(id: i32, name: string) {
        this.id = id;     // ok
        this.name = name;
    }

    mut rename(newName: string) {
        this.name = newName;  // ok
        this.id = 99;         // ошибка: readonly
    }
}
```

`mut` метод может менять обычные поля, но не `readonly`.

**Value object паттерн** — все поля `readonly`, нет `mut` методов. Класс полностью иммутабелен после конструктора:

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
        return new Point(this.x + dx, this.y + dy)  // новый объект
    }
}

const p = new Point(1.0, 2.0)
p.x = 5.0  // ошибка: readonly
```

Линтер предупреждает если класс имеет все поля `readonly`, но содержит `mut` метод — скорее всего ошибка.

`move` метод передает поля объекта наружу без лишнего копирования, когда исходный объект больше не нужен. Паттерн `Builder`:
```typescript
class QueryBuilder {
    query: string;
    params: i32[];

    // без move — this: Ref<Self>, поля нельзя move, нужен clone:
    build(): Query {
        return new Query(this.query.clone(), this.params.clone()); // лишняя копия данных
    }

    // с move — this: Self (owned), поля можно move, clone не нужен
    move build(): Query {
        return new Query(this.query, this.params);  // move полей — экономия памяти
    }
}

let b = new QueryBuilder("SELECT *", [1, 2, 3]);
const q = b.build();   // b перемещён в метод, данные переданы в Query без копии
console.log(b);        // ошибка: b перемещён — компилятор ловит
```

Конструктор — поля забирают владение (move):

```typescript
class Line {
    start: Point;
    end: Point;

    constructor(start: Point, end: Point) {
        this.start = start;  // move
        this.end = end;      // move
    }
}

const p1 = new Point(0, 0);
const p2 = new Point(1, 1);
const line = new Line(p1, p2);
console.log(p1);  // ошибка: p1 перемещён в line
```

Автогенерация конструктора — если конструктор не написан, компилятор генерирует его из полей:

- Поля **с дефолтом** → параметр со значением по умолчанию
- Поля **без дефолта** → обязательный параметр (в порядке объявления)
- `private` поля **с дефолтом** → авто-инициализируются тем дефолтом, в параметры конструктора не включаются
- `private` поля **без дефолта** → ошибка компилятора: нет способа инициализировать без явного конструктора
- Для `class X extends Error`: авто-конструктор добавляет `message: string` первым параметром и вызывает `super(message)` автоматически

Явный `constructor`: компилятор проверяет что все поля без дефолта инициализированы на всех путях выполнения (definite assignment analysis).

```typescript
class User {
    name: string;       // нет дефолта → обязательный параметр
    age: i32 = 0;       // есть дефолт → необязательный параметр
    active: boolean = true;
}
// компилятор генерирует:
// constructor(name: string, age: i32 = 0, active: boolean = true)

new User("Alice");           // ok — name="Alice", age=0, active=true
new User("Alice", 30);       // ok — name="Alice", age=30, active=true
new User("Alice", 30, false); // ok
new User();                  // ошибка: name обязателен

class Point {
    x: f64 = 0.0;
    y: f64 = 0.0;
    // все поля с дефолтом → генерируется конструктор без обязательных параметров
}

let p = new Point();       // ok — x=0.0, y=0.0
let p2 = new Point(1.0);   // ok — x=1.0, y=0.0
```

Если написан явный `constructor` — автогенерация не происходит.

Дефолтные параметры конструктора — вместо перегрузки по количеству:
```typescript
class Point {
    x: f64;
    y: f64;

    constructor(x: f64 = 0.0, y: f64 = 0.0) {
        this.x = x;
        this.y = y;
    }
}

let p1 = new Point();          // x=0.0, y=0.0
let p2 = new Point(1.0);       // x=1.0, y=0.0
let p3 = new Point(1.0, 2.0);  // x=1.0, y=2.0
```

`private` конструктор — для singleton/factory паттернов:
```typescript
class Config {
    private constructor() { ... }

    static create(): Config {
        return new Config();  // ok — внутри класса
    }
}

let c = new Config();         // ошибка: конструктор private
let c = Config.create();      // ok
```
