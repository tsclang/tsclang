## Семантика `this` и доступ к полям

Тип `this` определяет тип `this.field`. Затем применяются **те же правила передачи аргументов** что и для обычных функций — см. матрицу совместимости в разделе "Правила передачи аргументов в функцию" ([04-ownership.md](../04-ownership/04-ownership.md)):

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

Автогенерация конструктора *[NOT YET IMPLEMENTED]* — в текущей реализации, если конструктор не написан, `new ClassName()` генерирует zero-init: `(ClassName){0}`. Поля инициализируются дефолтными значениями (0 для чисел, NULL для ссылок).

Запланированная полная версия:

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
// *[NOT YET IMPLEMENTED]* компилятор генерирует:
// constructor(name: string, age: i32 = 0, active: boolean = true)

// Текущая реализация: new User() → (User){0}
new User("Alice");           // *[NOT YET IMPLEMENTED]*
new User("Alice", 30);       // *[NOT YET IMPLEMENTED]*
new User("Alice", 30, false); // *[NOT YET IMPLEMENTED]*
new User();                  // текущая: ok (zero-init)

class Point {
    x: f64 = 0.0;
    y: f64 = 0.0;
    // все поля с дефолтом → генерируется конструктор без обязательных параметров
}

let p = new Point();       // ok — x=0.0, y=0.0
let p2 = new Point(1.0);   // *[NOT YET IMPLEMENTED]*
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

---

