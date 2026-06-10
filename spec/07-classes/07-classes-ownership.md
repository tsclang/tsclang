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

### Allocation Strategy

Стратегия размещения класса в памяти определяется **декоратором** на классе, а не платформой. Платформа (`allocator: "heap"` / `allocator: "static"`) не меняет аллокацию класса — классы ВСЕГДА живут в памяти, известной на этапе компиляции.

| Тип класса | Синтаксис | C-вывод | Размещение | `T \| null` | Move | Drop |
|------------|-----------|---------|------------|-------------|------|------|
| `class` (default) | `new Point(10, 20)` | `Point p = Point_new(10, 20)` | Стек (на всех платформах) | `opt_Point` inline | memset src=0 | `_free()` release string-полей |
| `@struct` | `Point(10, 20)` (без `new`) | `Point p = {10, 20}` | Стек/inline | Запрещён | copy | no-op |
| `@pool(N)` | `new Gem(42)` | alloc from pool + constructor | BSS static pool | `opt_ref_Gem` pointer | pointer copy + `a = NULL` | `drop()` или auto-drop |
| `@heap` (future) | `new Node(42)` | `malloc + constructor` | Heap | `Node*` (NULL) | pointer copy + `a = NULL` | auto-free при scope exit |

#### Принципы

1. **Классы = value types** на стеке по умолчанию. Heap malloc для классов **не используется** — `allocator: "heap"` означает malloc только для `Array`, `Map`, `Set`, `closures`, но не для классов.
2. **Единый синтаксис `new`** для всех типов классов (П2 — совместимость с TypeScript). Разница только в C-выводе.
3. **Move semantics** на всех платформах: `let b = a` — bitwise copy (стек) или pointer copy + zero-out (pool/heap), `a` помечается как moved.
4. **Детерминированное освобождение** — никакого GC, никакого ARC. Drop вызывается compile-time предсказуемо.
5. **`@heap` — future feature** (Шаг 2). В текущей реализации не поддерживается; на `allocator: "static"` → compile error. Pool покрывает основные use-cases (рекурсивные типы, множественные объекты).

### Почему так

Move semantics = zero-cost abstraction. Нет refcount, нет runtime overhead. Один владелец = один destructor call. Borrow (Ref/Mut) = pointer — нулевой overhead, но compile-time guarantee безопасности.

---

## `@struct` — value-type class

Декоратор `@struct` превращает класс в **принудительный value-type** — плоская структура без heap и vtable, размещается inline в родительском scope.

### Синтаксис

```typescript
@struct
class Point { x: i32; y: i32; }

// Используется БЕЗ new — value, как struct
let p = Point(10, 20);
p.x = 15;
```

### C-вывод

```c
typedef struct { int32_t x; int32_t y; } Point;

// Inline в scope, без вызова Point_new()
int32_t main(void) {
    Point p = {10, 20};
    p.x = 15;
    return 0;
}
```

### Ограничения

- **Нет методов** (кроме `constructor`) — компилятор выдаёт ошибку если класс содержит не-конструктор методы
- **Нет интерфейсов** (no vtable) — `Point` не может реализовывать интерфейсы
- **Нет `@pool`/`@heap`** — `@struct` исключает другие декораторы аллокации
- **На non-embedded платформах** — `@struct` допустим, компилируется в тот же inline-стиль

### Когда использовать

- Маленькие POD-типы (Point, Color, Matrix)
- Когда нужна максимальная производительность (no function call overhead)
- Когда объекты всегда живут короткое время (на стеке)

---

## `@pool(N)` — статический пул объектов

Декоратор `@pool(N)` создаёт **статический пул из N слотов в BSS** для размещения объектов. На embedded — единственный способ динамически создавать объекты без heap. На desktop — детерминированная альтернатива heap malloc (для mission-critical потоков, real-time систем).

### Синтаксис

```typescript
@pool(4)
class Gem { value: i32; }

// Используется через new (как обычный класс)
let g = new Gem(42);
g.value = 99;
drop(g); // или auto-drop при выходе из scope
```

### C-вывод

```c
// В BSS сегменте
static Gem _Gem_pool[4];
static uint8_t _Gem_pool_used = 0;  // bitmask (uint8/16/32/64 в зависимости от N)

typedef struct { bool has_value; Gem *value; int _pool_idx; } opt_ref_Gem;

static opt_ref_Gem Gem_pool_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_Gem_pool_used & ((uint8_t)1 << _i))) {
            _Gem_pool_used |= ((uint8_t)1 << _i);
            return (opt_ref_Gem){true, &_Gem_pool[_i], _i};
        }
    }
    return (opt_ref_Gem){false, NULL, -1};
}

static void Gem_pool_free(opt_ref_Gem x) {
    if (x.has_value) _Gem_pool_used &= ~((uint8_t)1 << x._pool_idx);
}
```

### Move semantics

```typescript
let a = new Gem(42);
let b = a; // Move: a → b, a становится null
// a.value // ❌ Ошибка компиляции (E002: use of moved value)
```

C-вывод:

```c
opt_ref_Gem a = Gem_pool_alloc();
Gem_constructor(a.value, 42);

opt_ref_Gem b = a;  // pointer copy
a = (opt_ref_Gem){false, NULL, -1};  // zero-out source
```

### Pool-full → exception (не panic)

```typescript
try {
    let g = new Gem(42);
} catch (e) {
    // обработка pool-full
}
```

### Рекурсивные типы через `@pool`

Pool решает проблему рекурсивных структур на embedded (tree, linked list, graph) без malloc:

```typescript
@pool(16)
class HeavyNode {
    data: string;
    next: HeavyNode | null;  // HeavyNode* next в C — указатель на слот пула
}

let root = new HeavyNode("root");
let child = new HeavyNode("child");
child.next = root;
```

### Ограничения

- **N ≤ 64** — компилятор выдаёт ошибку для N > 64
- **Работает на всех платформах** — desktop (детерминированный пул) и embedded (BSS)
- **Pool-full** — обрабатывается через try/catch или throws-функции (Result-based error)
- **Drop** — explicit `drop(g)` или auto-drop при выходе из scope (с проверкой `_moved`)

### Когда использовать

- Объекты, которые создаются/уничтожаются часто (particle systems, scene graph nodes)
- На embedded: единственный способ динамических объектов
- На desktop: real-time потоки, где malloc недопустим

---

## `@heap` — heap-аллокация классов (future feature)

Декоратор `@heap` (будущая фича, Шаг 2) создаёт класс с **heap-аллокацией через `malloc`/`free`**. Используется для сложных динамических структур (деревья, графы, циклические ссылки) на desktop.

### Статус

**Не реализовано в текущей версии.** В этом разделе описана целевая семантика для будущей реализации.

### Синтаксис

```typescript
@heap
class HeavyNode {
    data: string;
    next: HeavyNode | null;  // HeavyNode* в C
}

let root = new HeavyNode("root");
let child = new HeavyNode("child");
child.next = root;  // OK: циклические ссылки допустимы
```

### C-вывод (целевой)

```c
typedef struct HeavyNode HeavyNode;
struct HeavyNode { String data; HeavyNode *next; };

int main(void) {
    HeavyNode* root = (HeavyNode*)tsc_malloc(sizeof(HeavyNode));
    HeavyNode_constructor(root, "root");
    
    HeavyNode* child = (HeavyNode*)tsc_malloc(sizeof(HeavyNode));
    HeavyNode_constructor(child, "child");
    
    child->next = root;  // OK: указатели допускают циклы
    
    // Auto-drop при выходе из scope
    if (child != NULL) { HeavyNode_destructor(child); tsc_free(child); }
    if (root != NULL) { HeavyNode_destructor(root); tsc_free(root); }
    return 0;
}
```

### Move semantics (целевая)

```typescript
let a = new HeavyNode("data");
let b = a;  // pointer copy
a = null;   // zero-out (C-указатель)
```

### Когда использовать

- Рекурсивные типы с неизвестной глубиной (деревья, графы)
- Циклические ссылки (невозможно на стеке)
- Объекты, время жизни которых выходит за рамки scope

### Альтернативы

- **`@pool(N)`** — для embedded и real-time desktop (детерминированный пул, N ≤ 64)
- **`class` default** — для value types на стеке (самый быстрый)

### Ограничения

- **Только `allocator: "heap"`** — на `allocator: "static"` → compile error
- **Деструктор обязателен** — компилятор генерирует auto-free, но пользовательский `destructor` нужен для cleanup полей
- **Не перемещается в `@pool`/`@struct`** — `@heap` исключает другие декораторы аллокации

---

## `@static class field` — статическое поле класса

Декоратор `@static` на поле класса создаёт **одно статическое поле на класс** (не per-instance), размещённое в BSS. Все экземпляры класса разделяют это поле.

### Синтаксис

```typescript
class Counter {
    @static instances: i32 = 0;  // BSS, одно на класс
    
    constructor() {
        Counter.instances = Counter.instances + 1;
    }
}

let c1 = new Counter();
let c2 = new Counter();
// Counter.instances == 2
```

### C-вывод

```c
typedef struct Counter Counter;  // opaque (нет per-instance полей)
static int32_t Counter_instances = 0;

void Counter_constructor(Counter* self) {
    Counter_instances = Counter_instances + 1;
}
```

### Ограничения

- **Инициализатор обязателен** — `@static field` должно иметь начальное значение (compile-time constant)
- **Доступ через `ClassName.field`** — не через `instance.field` (хотя TS может разрешать оба)
- **`@readonly` совместим** — `@static readonly` создаёт compile-time константу

### Когда использовать

- Счётчики экземпляров
- Кеши, разделяемые между всеми экземплярами
- Конфигурация класса (defaults, feature flags)

---

## `@readonly` class field

Декоратор `@readonly` на поле класса делает поле **неизменяемым после инициализации в конструкторе**. После выхода из конструктора — только чтение.

### Синтаксис

```typescript
class User {
    @readonly id: i32;
    name: string;
    
    constructor(id: i32, name: string) {
        this.id = id;     // OK: инициализация в конструкторе
        this.name = name;
    }
}

let u = new User(42, "Alice");
// u.id = 100;          // ❌ Ошибка компиляции (E00X: cannot assign to readonly field)
console.log(u.id);       // OK: чтение
```

### C-вывод

```c
typedef struct { const int32_t id; String name; } User;
```

`const` в C гарантирует, что компилятор C тоже запретит мутацию.

### Ограничения

- **Инициализация только в конструкторе** — после конструктора поле неизменяемо
- **`@readonly` + `@static` совместимы** — статическое readonly поле = compile-time константа
- **`@readonly` на параметрах запрещён** — параметры по определению `let`

### Когда использовать

- Идентификаторы (id, uuid)
- Константы уровня экземпляра
- Immutability pattern (immutable objects)

### Почему так

Move semantics = zero-cost abstraction. Нет refcount, нет runtime overhead. Один владелец = один destructor call. Borrow (Ref/Mut) = pointer — нулевой overhead, но compile-time guarantee безопасности.
