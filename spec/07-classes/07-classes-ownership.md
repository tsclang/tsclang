# 07 — Классы: ownership и семантика присваивания

Классы — **move semantics**. Присваивание передаёт ownership, оригинал обнуляется.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | Move + zero-out | `User b = a; a = (User){0};` |
| `const b = a` | Move + zero-out | `const User b = a; a = (User){0};` |
| `b = a` (reassign) | Move + zero-out | `b = a; a = (User){0};` |

После move `a` обнуляется, доступ к `a` — ошибка компиляции (`E002: use after move`).

### Передача в функцию

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `foo(a)` (param: `T`) | Move + zero-out после вызова | `foo(a); a = (User){0};` (через `_postStmtCleanups`) |

```typescript
function process(u: User): void { /* владеет u */ }
let user = new User("Alice", 30);
process(user);
console.log(user.name);  // ❌ E002: use after move
```

```c
void process_User(User u) { /* u перемещён */ }
User user = User_new("Alice", 30);
process_User(user);
memset(&user, 0, sizeof(User));  // zero-out после вызова
```

### Ref\<T\> / Mut\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<User> = a` | Immutable borrow | `const User *b = &a;` + borrow tracking |
| `const b: Mut<User> = a` | Mutable borrow | `User *b = &a;` + borrow tracking |
| `const b: Ref<User> = a` (где `a: const`) | ✅ ok | borrow из const — read-only |
| `const b: Mut<User> = a` (где `a: const`) | ❌ ошибка | нельзя Mut из const binding |

### Shared\<T\> / Weak\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Shared<User> = a` | **Ошибка** — `a` не является `Shared<T>` | Нельзя создать Shared из owned |
| `const b: Weak<User> = a` | **Ошибка** — `a` не является `Shared<T>` | Weak только из Shared |

### Borrow из массива

`arr[i]` для сложных типов — только borrow (`Ref<T>`), move по индексу запрещён:

```typescript
const u: Ref<User> = users[0];     // ✅ borrow
const u = users[0];                // ❌ E009: cannot move out of array by index
const u = users.remove(0);         // ✅ move + удаление из массива
```

### Borrow полей объектов — запрещён

```typescript
const u: Ref<User> = container.user;  // ❌ Cannot borrow a class field
const m: Mut<User> = container.user;  // ❌ Cannot borrow a class field
```

**Паттерн 1: передавать весь объект как `Ref<Container>`:**

```typescript
function getName(c: Ref<Container>): string {
    return c.user.name;   // ✅ доступ внутри функции
}
```

Auto-borrow делает pass-through эргономичным — `buf` передаётся без явной аннотации `Ref<>` на callsite:

```typescript
parser.parse(buf, 0)   // buf автоматически заимствуется как Ref<Buffer>
parser.skip(buf, 5)    // borrow отпускается после каждого вызова
```

**Паттерн 2: `{}` блок для тонкого контроля borrow lifetime**

Если нужно явно ограничить продолжительность borrow — обычный блок `{}`. Borrow checker уважает block-level scope без дополнительных ключевых слов:

```typescript
let buf = new Buffer(input)
{
    const ref: Ref<Buffer> = buf   // borrow начинается
    parser.parse(ref, 0)
    parser.skip(ref, 5)
}   // ref dropped — borrow заканчивается
buf.append(more)   // ✅ — buf снова свободен для мутации
```

> **Примечание:** borrow на коллекции (включая `arr[i]`) блокирует мутацию только до конца `{}`-scope, в котором создана переменная-borrow. После выхода из блока мутация снова разрешена.

**Паттерн 3: `Shared<T>` (только desktop)**

Если методов много и многословность неприемлема — `Shared<T>` даёт ARC-семантику вместо borrow. Не работает на embedded.

**Паттерн 4: owned поле**

Если данные принадлежат самому объекту — хранить как owned поле, не borrow:

```typescript
class Parser {
    data: Buffer   // owned — не borrow
    constructor(input: u8[]) {
        this.data = new Buffer(input)
    }
    parse(pos: usize): Token { ... }  // доступ через this.data
}
```

Цена: `Parser` владеет `Buffer` и не может работать с чужими данными без клонирования.

**Решение для итераторов** — замыкание (см. [05-for-of-iteration.md](../05-control-flow/05-for-of-iteration.md)): `Ref<T>` в замыкании разрешён, так как замыкание стековое и не может пережить источник.

### Классы с string-полями

Компилятор автоматически генерирует `ClassName_free()` — деструктор, который вызывает `tsc_string_release` для каждого string-поля. Функция **не** вызывает `free(self)` — классы размещаются на стеке как value types. Генерируется только для классов, имеющих string-поля.

```typescript
class User {
    name: string;
    email: string;
}
```

```c
static void User_free(User *self) {
    if (!self) return;
    tsc_string_release(self->name);
    tsc_string_release(self->email);
}
```

Деструктор вызывается в cleanup-секции при выходе из scope, где класс был создан или перемещён: `User_free(&u)`.

### Поведение внутри функций

**Обычные функции** — передача по значению = move, по Ref/Mut = borrow:

```typescript
function process(u: User): void { /* владеет u */ }
function view(u: Ref<User>): void { /* borrow */ }
function modify(u: Mut<User>): void { /* mutable borrow */ }
```

```c
void process(User u) { /* u перемещён, caller обнулён */ }
void view(const User *u) { /* borrow pointer */ }
void modify(User *u) { /* mutable borrow pointer */ }
```

**Замыкания с class/array capture** — implicit **reference** (pointer на source).

Class/array захватывается **по ссылке** (pointer). Source жив, mutations видны. Примитивы — copy (snapshot). Строки — retain (ARC copy). Для explicit capture: `[x: Ref<T>]` (read-only), `[x: Mut<T>]` (mutable). Move capture `[x: T]` убран.

Подробнее: capture model, примеры, C-representation, ограничения — см. [06-closures.md](../06-functions/06-closures.md).

### Spread объектов

Spread **копирует** поля — source жив. Move semantics для spread не применяется. `let`/`const` на source не влияет — всегда copy.

**Object spread — всегда copy:**

```typescript
let base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };
console.log(base);    // ok — base жив
console.log(base.x);  // 1
```

```c
tsc_string_retain(base.name);
BaseType extended = {.x = base.x, .name = base.name};
extended.extra = 42;
// base untouched
```

Все поля копируются в новый объект, оригинал не тронут. string-поля — retain (новый владелец).

**Object spread из `const` — тоже copy:**

```typescript
const base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };
console.log(base);  // ok — base жив
```

`let`/`const` на source не влияет на copy/move — spread всегда copy (см. [08-spread-destructuring.md](../08-collections/08-spread-destructuring.md), D1).

**Object spread из `Shared<T>` — retain:**

```typescript
const obj: Shared<Config> = new Config();
const a = { ...obj, y: 2 };  // ok — retain, obj жив
const b = { ...obj, z: 3 };  // ok — retain, obj жив
```

**string-поля при spread** — retain при копировании (новый владелец), release в cleanup:

```typescript
let base = { name: "Alice" };
const extended = { ...base };
// extended.name: retain("Alice") — новый владелец
// cleanup: tsc_string_release(extended.name)
```

### Доступ к полю — borrow по умолчанию

Обращение к полю сложного типа без аннотации возвращает `Ref`:

```typescript
const user = new User("Alice", [1, 2, 3]);

const name = user.name;    // Ref<string> — borrow, user жив
const age = user.age;      // number — copy (примитив)

console.log(user);         // ok — user не тронут
console.log(user.name);    // ok
```

Чтобы переместить поле — явная аннотация типа владельца:

```typescript
const name: string = user.name;  // string (T) — move
console.log(user.name);          // ошибка: поле перемещено
console.log(user.age);           // ok — остальные поля живы
console.log(user);               // ошибка: нельзя использовать user целиком после move поля
```

### Возврат borrow из метода

Возвращаемый `Ref<T>`/`Mut<T>` неявно привязан к `this`:

```typescript
class Config {
    data: string[];

    getFirst(): Ref<string> {
        return this.data[0];  // привязан к this
    }
}

const config = new Config();
const s = config.getFirst();  // ok — s привязан к config
console.log(s);               // ok
```

```typescript
let s: Ref<string>;
{
    const config = new Config();
    s = config.getFirst();  // borrow привязан к config
}  // config умер
console.log(s);  // ошибка: config умер, s dangling
```

### Borrows в полях класса — запрещено

```typescript
class View {
    data: Ref<User[]>;  // ошибка: нельзя хранить borrow в поле
}
```

Альтернативы:

```typescript
// Владеем данными
class View {
    data: User[];  // owned
}

// Или Shared
class View {
    data: Shared<User[]>;  // ARC
}

// Временный доступ — через параметр метода
function renderView(data: Ref<User[]>) { ... }
```

### Деструктуризация объектов

Деструктуризация **копирует** поля — source жив. Move semantics для деструктуризации не применяется. `let`/`const` на source не влияет — всегда copy.

**Полная деструктуризация — copy всех полей:**

```typescript
let user = new User("Alice", 30);
const { name, age } = user;  // copy: name retain, age copy
console.log(user.name);      // "Alice" — user жив
```

**Переименование:**

```typescript
const { name: userName, age: userAge } = user;
```

**Частичная деструктуризация — copy указанных полей:**

```typescript
const { name } = user;  // copy: name retain, остальные поля нетронуты
console.log(user.name); // "Alice" — user жив
```

Type annotation указывает тип source, но **не меняет** copy-семантику (05d, D4).

**Частичная деструктуризация с rest — copy указанных полей + deep copy rest:**

```typescript
let user = { name: "Alice", age: 30, email: "a@b.c" };
const { name, ...rest } = user;  // copy name + copy rest
console.log(user.name);          // "Alice" — user жив
```

**Деструктуризация с Ref — copy + retain string-полей:**

```typescript
const { name }: Ref<User> = user;  // copy: name retain, user жив
```

**string-поля при деструктуризации** — retain при извлечении (новый владелец), release в cleanup:

```typescript
const { name, email } = user;
// name: retain("Alice"), email: retain("a@b.c")
// cleanup: tsc_string_release(name); tsc_string_release(email);
```

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `new User()` | `User u = User_new(args);` — stack value, return by value | Аналогично: `User u = {0};` (на стеке или в BSS) |
| Move (zero-out) | `memset(&src, 0, sizeof(T))` | Аналогично |
| Ref/Mut borrow | Pointer (`const T*` / `T*`) | Pointer (идентично) |
| `ClassName_free()` | Release string-полей только (без `free(self)`) | No-op (string-поля — no-op retain/release) |
| Замыкания с class capture | Reference (pointer в env), source жив | Reference (pointer, идентично) |
| Spread объекта | Copy полей + retain string-полей, source жив | Copy полей (string — no-op retain), source жив |
| Деструктуризация объекта | Copy полей + retain string-полей + cleanup release, source жив | Copy полей (string — no-op), source жив |
| Деструктор при exit | `User_free(&u)` — release string-полей | No-op |

**Ключевое отличие:** классы — **value types**, размещаются на стеке как struct. Конструктор возвращает struct by value (`User User_new(args) { User self = {0}; ... return self; }`), call site: `User u = User_new(args)`. Нет `malloc`/`free` для самого объекта. `ClassName_free(&u)` освобождает только string-поля, не вызывает `free(self)`. На embedded нет heap → нет `malloc`/`free` вообще. String-поля на embedded — no-op retain/release (ring buffer).

### Почему так

Move semantics = zero-cost abstraction. Нет refcount, нет runtime overhead. Один владелец = один destructor call. Borrow (Ref/Mut) = pointer — нулевой overhead, но compile-time guarantee безопасности.
