# TSClang — Модель памяти

> **Приоритет:** при конфликте с `05c-for-of-iteration.md` по for-of — доминирует 05c. При конфликте с `05d-spread-destructuring-merge.md` по spread/destructuring — доминирует 05d. При конфликте с `05e-closures.md` по closures/capture — доминирует 05e.

**Гибридная модель:** статический ownership/borrow checker + опциональный ARC. Нет GC, нет ручного `free`.

## Типы владения

| Тип | Семантика |
|-----|-----------|
| `T` | **Owner** — владеет объектом, move при передаче (кроме `string`) |
| `string` | **Immutable + ARC** — copy + retain при присвоении, release при выходе из scope |
| `Ref<T>` | **Immutable borrow** — только чтение |
| `Mut<T>` | **Mutable borrow** — чтение и запись |
| `Shared<T>` | **ARC** — strong ref, увеличивает refcount |
| `Weak<T>` | **Weak ref** — не увеличивает refcount, разрывает циклы |
| `Slice<T>` | **Borrowed array view** — zero-copy sub-range, pointer + length |

`Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>` — **режимы хранения**, каждый имеет конкретное C-представление:

| Тип | C-представление | Примечание |
|-----|----------------|-----------|
| `T` (owned) | `T value` / `T* ptr` | move = не вызываем free на источнике |
| `string` | `String` struct + ARC | immutable, copy + retain на присвоении, release при выходе из scope |
| `Ref<T>` | `const T* ptr` | read-only pointer |
| `Mut<T>` | `T* ptr` | read-write pointer |
| `Shared<T>` | `int32_t _refcount; int32_t _weakcount;` встроены в struct T | ARC |
| `Weak<T>` | Тот же struct что Shared; `tsc_weak_create` = инкремент `_weakcount` | не удерживает объект |

> **`Move<T>` не существует** — move это операция передачи ownership, а не режим хранения. В C нет нового типа: `Move<T>` = `T`. Bare `T` в параметрах и возвращаемых типах уже означает move.

## Базовые правила

- **Примитивы** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — всегда **копируются**, borrow checker не применяется; `T | null` компилируется в struct с флагом
- **Сложные типы** (массивы, объекты, классы) — управляются ownership системой (move при присвоении)
  - **Строки (`string`)** — **immutable + ARC**. Каждый владелец `String` делает `tsc_string_retain` при получении и `tsc_string_release` при потере значения. Литералы не выделяют heap (`capacity = 0`, data → rodata, `_refcount = NULL`); heap-строки получают `_refcount` через `_tsc_str_make`. На embedded (`TSC_EMBEDDED`) нет ARC — `retain`/`release` = no-op, строки выделяются из ring buffer (`_tsc_str_pool`) при конкатенации/slice; литералы — rodata (`capacity = 0`). Ring buffer не поддерживает индивидуальный `free` — память переиспользуется при переполнении. `s[i]` возвращает `u8` (примитив, copy) — индексация не создаёт borrow. Подробности ARC — см. раздел «String ARC» ниже.

## Owner (T) — владение

> **Исключение:** `string` не использует move-семантику. Строки — immutable + ARC (см. ниже).

### Move при присвоении

```typescript
let a = new User();
let b = a;          // MOVE: a теперь invalid
// console.log(a);  // ошибка: a перемещён
```

### Move при передаче в функцию

```typescript
function addToCache(cache: Mut<Cache>, data: User[]) {
   cache.items.push(data);   // ok — data принадлежит функции
}

addToCache(myCache, myData);
console.log(myData);   // ошибка: myData перемещён
```

## Ref\<T\> — immutable borrow

Только чтение, без изменения и удаления.

```typescript
function sum(arr: Ref<number[]>): number { ... }

const data = [1, 2, 3];
sum(data);
console.log(data);   // ok — data не перемещён
```

### `Ref<T>` в полях класса — запрещено

`Ref<T>` нельзя хранить в поле класса — компилятор не может отследить lifetime без аннотаций:

```typescript
class Parser {
    data: Ref<Buffer>  // ❌ ошибка компилятора
}
```

**Решение для view-паттернов** (парсер, рендерер, обработчик) — передавать `Ref<T>` через параметры методов. Единственная цена — многословность, технических ограничений нет ни на desktop, ни на embedded:

```typescript
class Parser {
    // нет поля — получает buffer в каждый метод
    parse(data: Ref<Buffer>, pos: usize): Token { ... }
    skip(data: Ref<Buffer>, n: usize): void { ... }
    peek(data: Ref<Buffer>): u8 { ... }
}

let buf = new Buffer(input)
let parser = new Parser()
let token = parser.parse(buf, 0)
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

### Borrow из массива

`arr[i]` для сложных типов — только borrow (`Ref<T>`), move по индексу запрещён:

```typescript
const u: Ref<User> = users[0];     // ✅ borrow
const u = users[0];                // ❌ E009: cannot move out of array by index
const u = users.remove(0);         // ✅ move + удаление из массива
```

`Mut<T>` для элементов массива (`arr[i]`) — не поддерживается.

### Borrow полей объектов — не поддерживается

`Ref<T>` / `Mut<T>` от поля класса (`obj.field`) — запрещены. Компилятор не может отследить lifetime поля без аннотаций:

```typescript
const u: Ref<User> = container.user;  // ❌ ошибка
const m: Mut<User> = container.user;  // ❌ ошибка
```

**Паттерн: передавать весь объект как `Ref<Container>`:**

```typescript
function getName(c: Ref<Container>): string {
    return c.user.name;   // ✅ доступ внутри функции
}
```

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

**Решение для итераторов** — замыкание (см. [Iterable\<T\>](#iterablet--пользовательские-итерируемые-типы)): `Ref<T>` в замыкании разрешён, так как замыкание стековое и не может пережить источник.

## Mut\<T\> — mutable borrow

Чтение и запись, только один `Mut` за раз.

```typescript
function push(arr: Mut<number[]>, val: number) {
    arr.push(val);
}

let data = [1, 2, 3];
push(data, 4);
console.log(data);   // [1, 2, 3, 4]
```

### Borrow tracking для `const m: Mut<T> = a`

Компилятор проверяет три условия при создании `Mut<T>` переменной из идентификатора:

1. **const binding** — нельзя создать `Mut<T>` из `const` переменной
2. **Ref активен** — нельзя `Mut<T>` пока существует живой `Ref<T>` borrow на тот же символ
3. **Двойной Mut** — нельзя создать два `Mut<T>` на один символ одновременно

```typescript
const b = new Box();
const m: Mut<Box> = b;   // ❌ cannot borrow "b" as mutable: it is a const binding

let c = new Box();
const r: Ref<Box> = c;
const m: Mut<Box> = c;   // ❌ Cannot create mutable borrow while immutable borrow is active

let d = new Box();
const m1: Mut<Box> = d;
const m2: Mut<Box> = d;  // ❌ Cannot create two simultaneous mutable borrows
```

## Shared\<T\> — ARC

Для графов, циклов, неопределённого времени жизни.

Объект становится `Shared` через аннотацию типа — компилятор автоматически оборачивает в ARC:

```typescript
let node: Shared<Node> = new Node();  // ARC
let node = new Node();                // Owner — move семантика
```

Цикл разрывается через `Weak<T>` — одна из сторон держит слабую ссылку:

```typescript
class Node {
    next: Shared<Node>;
    prev: Weak<Node>;
}

let node1: Shared<Node> = new Node();
let node2: Shared<Node> = new Node();
node1.next = node2;  // retain(node2)
node2.prev = node1;  // weak — refcount не растёт, цикл разорван
```

При обращении к `Weak<T>` — тип всегда `T | null` (объект мог быть освобождён). Используй `?.` и `??`:

```typescript
node2.prev?.doSomething();           // вызов только если объект жив
const name = node2.prev?.name ?? ""; // дефолт если объект освобождён
if (node2.prev != null) {
    // narrowing — здесь prev: Weak<Node> (жив)
}
```

Генерируемый C:
```c
Node *node1 = tsc_arc_alloc(sizeof(Node));   // _refcount = 1, _weakcount = 0 (calloc)
Node *node2 = tsc_arc_alloc(sizeof(Node));   // _refcount = 1, _weakcount = 0
node1->next = node2;
tsc_arc_retain(node2);   // node2._refcount = 2
node2->prev = node1; // weak — tsc_weak_create, node1._weakcount = 1
```

## Правила Borrow Checker

1. **Нельзя два Mut одновременно**
   ```typescript
   let a = [1, 2, 3];
   let r1: Mut<number[]> = a;
   let r2: Mut<number[]> = a;   // ошибка: уже есть активный Mut
   ```

2. **Нельзя Mut + Ref одновременно**
   ```typescript
   let a = [1, 2, 3];
   let r1: Ref<number[]> = a;
   let r2: Mut<number[]> = a;   // ошибка: a уже заимствован как Ref
   ```

3. **Можно несколько Ref одновременно**
   ```typescript
   let a = [1, 2, 3];
   let r1: Ref<number[]> = a;
   let r2: Ref<number[]> = a;   // ok
   ```

## Правила передачи аргументов в функцию

Тип параметра в сигнатуре **полностью диктует semantics на callsite** — явных `&` или `*` не нужно.

**Примитивы — всегда copy**, независимо от типа параметра:
```typescript
function foo(x: number): void { ... }
let n = 42;
foo(n);  // copy — n жив после вызова
```

**Строки (`string`) в параметрах — implicit borrow (zero-overhead):**
```typescript
function greet(name: string): void { ... }
let s = "hello";
greet(s);  // borrow — s жив после вызова, caller чистит s в своём cleanup
```
Caller **не** делает `tsc_string_retain`; callee **не** делает `tsc_string_release`. Владение остаётся у caller. Если callee сохраняет строку (в поле, массиве, `return`), safe temp pattern / return retain автоматически добавляет `retain`. Для явного borrow используется `Ref<string>`.

**Сложные типы — 4 варианта параметра:**
```typescript
function toRef(x: Ref<User>): void { ... }        // borrow
function toMut(x: Mut<User>): void { ... }        // mutable borrow
function toOwned(x: User): void { ... }           // move
function toShared(x: Shared<User>): void { ... }  // retain

let u = new User();
const c = new User();
let s: Shared<User> = new User();

toRef(u);    // ok — auto borrow, u жив
toRef(c);    // ok — auto borrow, c жив
toMut(u);    // ok — auto mutable borrow
toMut(c);    // ошибка: нельзя Mut<T> из const
toOwned(u);  // ok — move, u недоступен после вызова
toOwned(c);  // ошибка: нельзя move из const
toShared(s); // ok — retain (refcount++)
toShared(u); // ошибка: u не является Shared<T>
```

**Передача через промежуточный тип (Ref/Mut/Shared как источник):**
```typescript
function bar(u: Ref<User>): void {
    toRef(u);    // ok — re-borrow
    toMut(u);    // ошибка: Ref → Mut запрещено
    toOwned(u);  // ошибка: нельзя move из Ref
                 // hint: clone если User implements Clone
}

function baz(u: Mut<User>): void {
    toRef(u);    // ok — Mut → Ref разрешено (понижение)
    toMut(u);    // ok — re-borrow как Mut
    toOwned(u);  // ошибка: нельзя move из Mut
}

function qux(u: Shared<User>): void {
    toRef(u);    // ok — borrow из Shared
    toMut(u);    // ошибка: Shared не даёт Mut (нет эксклюзивного владения)
    toOwned(u);  // ошибка: нельзя move из Shared
    toShared(u); // ok — retain
}
```

**Матрица совместимости:**

| Источник ↓ \ Параметр → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `let T`                  | ✅ auto borrow | ✅ auto mut borrow | ✅ move | ❌ |
| `const T`                | ✅ auto borrow | ❌ | ❌ | ❌ |
| `Ref<T>`                 | ✅ re-borrow | ❌ | ❌ | ❌ |
| `Mut<T>`                 | ✅ понижение | ✅ re-borrow | ❌ | ❌ |
| `Shared<T>`              | ✅ borrow | ❌ | ❌ | ✅ retain |

> **Примечание к реализации:** Все ❌-ячейки матрицы проверяются компилятором на этапе codegen. Для `Ref→Mut`, `Mut→Shared`, `Ref→owned`, `Mut→owned`, `Shared→owned` — compile-time error с понятным сообщением. `const→Mut` и `const→owned` — тоже error (const binding нельзя переместить или мутировать).

## Interior Mutability — почему её нет

`Shared<T>` — строго read-only (матрица: `Shared<T>` → `Mut<T>` = ❌). Это намеренное ограничение.

**На embedded** `Shared<T>` нет вообще — нет heap, нет ARC. Глобальное мутабельное состояние — через `@static let`.

## `@static let` — мутабельное глобальное состояние

`@static let` объявляет переменную с `'static` lifetime — живёт всю программу, размещается в BSS.

```typescript
@static let tasks = new Tasks<8>()
@static let counter: number = 0
```

**Правила borrow checker для `@static let`:**

Множественный `Mut<T>` к одному `@static let` **разрешён** — объект живёт всю программу, dangling pointer невозможен:

```typescript
@static let tasks = new Tasks<8>()

tasks.add(blinkTask)   // ok — Mut<Tasks<8>>
tasks.add(inputTask)   // ok — второй Mut<Tasks<8>> к тому же объекту
```

Это отличается от обычных переменных где два одновременных `Mut<T>` — ошибка компилятора.

**Гонки данных — ответственность разработчика:**

| Контекст | `@static let` мутация | Безопасность |
|----------|----------------------|--------------|
| Single-thread | разрешено | гонок нет |
| `async/await` (без потоков) | разрешено | один поток, event loop |
| Embedded (любой allocator) | разрешено | нет потоков по природе |
| `std/threads` | требует `Atomic<T>` или синхронизацию | иначе ошибка компилятора |

При использовании `std/threads` компилятор обнаруживает `@static let` с не-атомарным типом и требует явной синхронизации:

```typescript
@static let counter: number = 0
Thread.spawn(() => { counter++ })  // ошибка: @static variable captured in spawn — use Atomic<T>
```

> **Реализовано:** Компилятор проверяет захват `@static let` переменных (с `_isStaticArray` / `_isStaticMap` маркерами) в spawn-блоках и выбрасывает ошибку. Также реализована рекурсивная Send-проверка: Array, Set, Map, opt-типы и классы с непримитивными полями отвергаются. Разрешены: примитивы, string, Atomic, Readonly.

**На desktop** event loop однопоточный. `Shared<T>` с мутацией нужен только при `Thread.spawn`. Реальные кейсы и их решения:

| Кейс | Нужен Shared<T> + мутация? | Альтернатива |
|------|---------------------------|--------------|
| Счётчик запросов | да | `Atomic<i32>` |
| HTTP-кэш | только multi-thread | actor через `Channel` |
| Connection pool | только multi-thread | actor через `Channel` |
| Логгер | только multi-thread | `Atomic` буфер или `Channel` |
| Lazy init конфига | нет | инициализируй в конструкторе |
| Memoization | нет | owned кэш, передавай `Mut<T>` |

**Actor-паттерн** покрывает все multi-thread кейсы — один поток владеет состоянием, остальные шлют запросы через `Channel`:

```typescript
// вместо Shared<Cache> с мутацией:
async function cacheActor(rx: Rx<CacheRequest>): Promise<void> {
    let cache = new Map<string, Buffer>()  // owned, не Shared
    for await (const req of rx) {
        match (req) {
            Get { key, reply } => reply.send(cache.get(key)),
            Set { key, val }   => cache.set(key, val),
        }
    }
}
```

**Реактивность** решается через `std/reactive` с explicit-deps — без interior mutability, как чистая библиотека (см. std/reactive в [10-stdlib.md](../10-stdlib/10-stdlib.md)).

## Scope Constraint (без lifetime аннотаций)

TSC не имеет явных lifetime аннотаций (как `'a` в Rust). Вместо них — набор консервативных правил, которые компилятор проверяет статически.

**Правило 1: Ref/Mut нельзя в глобал**
```typescript
let global: Ref<User>;  // ошибка

function foo(u: Ref<User>) {
    global = u;  // ошибка: borrow не может пережить функцию
}
```

**Правило 2: Нельзя вернуть ссылку на локал или элемент массива**
```typescript
function bad(): Ref<User> {
    const u = new User();
    return u;        // ❌ ошибка: u умрёт в конце функции
}

function bad2(arr: Ref<User[]>): Ref<User> {
    return arr[0];   // ❌ ошибка: borrow на элемент не может пережить массив
}

function bad3(arr: Mut<number[]>): Mut<number> {
    return arr[0];   // ❌ ошибка: mutable borrow на элемент не может пережить массив
}
```

**Правило 3: Conservative Union — `Ref<T>` и `Mut<T>` return**

Когда функция возвращает `Ref<T>` или `Mut<T>`, компилятор применяет **Conservative Union**: заимствуются **все** аргументы, переданные в `Ref<T>`/`Mut<T>` параметры. Результат привязан ко всем источникам одновременно.

### `Ref<T>` return — immutable borrow

Мутация источников блокируется. Чтение разрешено.

```typescript
function getRef(b: Ref<Box>): Ref<Box> {
    return b
}

let box = new Box()
box.x = 42
const r = getRef(box)    // box заимствован (immutable)
// box.x = 99            // ❌ мутация заблокирована
console.log(box.x)       // ✅ чтение разрешено
```

### `Mut<T>` return — total quarantine (эксклюзивный borrow)

**Полная блокировка** источника: чтение, запись, методы, передача аргументом — всё запрещено пока `Mut` результат жив. Это как `&mut` в Rust — эксклюзивный доступ.

```typescript
function getMut(b: Mut<Box>): Mut<Box> {
    return b
}

let box = new Box()
box.x = 42
const m = getMut(box)    // box под тотальным карантином
// box.x = 99            // ❌ мутация заблокирована
// console.log(box.x)    // ❌ чтение заблокировано
// console.log(box)       // ❌ любой доступ заблокирован
m.x = 10                 // ✅ ok — через сам Mut
```

**Несколько `Mut<T>` параметров** — все источники под карантином:

```typescript
function pickMut(a: Mut<Box>, b: Mut<Box>): Mut<Box> {
    return a
}

let b1 = new Box()
let b2 = new Box()
const m = pickMut(b1, b2)
// b1.x = 1   // ❌ под карантином
// b2.x = 2   // ❌ под карантином
```

**Освобождение** — при выходе из scope:

```typescript
{
    const m = getMut(box)
    m.x = 10
}   // m умер → карантин снят
box.x = 99   // ✅ ok
```

### `Shared<T>` / `Weak<T>` return — нет borrow tracking

Возврат `Shared<T>` и `Weak<T>` **не создаёт borrow** — они управляют памятью через refcount. Источник остаётся полностью доступен:

```typescript
function share(n: Shared<Node>): Shared<Node> {
    return n   // refcount++ — без borrow
}

let x: Shared<Node> = new Node()
const s = share(x)
x.value = 99   // ✅ ok — Shared не блокирует источник
```

### Почему консервативно

При нескольких Ref/Mut-параметрах компилятор заимствует **все**, даже если функция возвращает только один. Это sound: компилятор не может знать какой именно параметр вернётся. Обход — `clone()` или `Shared<T>`:

```typescript
function getLongerOwned(a: Ref<string>, b: Ref<string>): string {
    return (a.length > b.length ? a : b).clone()
}
```

**Правило 4: `Ref<T>` и `Mut<T>` не могут пережить точку `await`**

Borrow не может оставаться живым через `await` — borrow checker отвергает такой код. Причина: async state machine сохраняет состояние между suspension points, и источник borrow может быть invalidated или moved другой coroutine пока ожидает:

```typescript
// ✅ Copy перед await
async function ok(arr: number[]): Promise<void> {
    const val: number = arr[0]      // копия значения (number — Copy-тип)
    await something()
    console.log(val)
}

// ✅ Использовать borrow до await, новый borrow после
async function ok2(arr: number[]): Promise<void> {
    console.log(arr[0])          // borrow использован и отпущен до await
    await something()
    console.log(arr[0])          // новый borrow после await
}
```

Правило действует только для `Ref<T>` и `Mut<T>`. Owned значения (`T`) через `await` переживать могут — они захватываются в state machine struct.

**Почему нет автоматического re-borrow после `await`**

Технически компилятор мог бы молча дропать borrow на `await` и восстанавливать его после — в single-threaded async это безопасно (никто не тронет источник пока suspended). Это осознанно не сделано:

- `await` — граница где другие задачи выполняются. Пользователь должен видеть что borrow здесь прерывается — это teachable moment ownership модели.
- Скрытый re-borrow маскирует факт что `r` после await — уже другой borrow, не тот что до.
- Явный паттерн (`arr[0]` после await вместо `r`) короче и понятнее.

Авто-reborrow отклонён — запрет полный и явный.

**Правило 5: Замыкания и capture**

> **Приоритет:** полная спецификация замыканий — в `05e-closures.md`. При конфликте доминирует 05e.

Замыкание (arrow function) захватывает переменные по-разному: примитивы — copy (snapshot), строки — retain (ARC copy), class/array — reference (pointer). Source всегда жив. Env struct — stack-allocated, escaping scope = UB. Cleanup: source владеет, env нет (кроме String retain/release).

---

### Сводная таблица поведения borrow по контекстам

| Контекст | Borrow отпускается? | Примечание |
|----------|---------------------|------------|
| Конец `{}` scope | ✅ Да | `_scopeBorrowStack` + `_refBorrowCount` в `pushScope`/`popScope` |
| Конец функции | ✅ Да | Cleanup + отпускание |
| Конец arrow function | ✅ Да | Env struct умирает на стеке |
| Callback после `await` | ❌ Запрещён | `err-ref-across-await` |
| Отложенный callback | ❌ Запрещён по дизайну | Closure — стековое |
| Захват в closure | Copy/retain (примитив/String), Reference (class/array) | Same-scope безопасно, escaping = UB |

## Автоматический Drop

Компилятор вставляет `_free()` в конце scope владельца. Классы размещаются на стеке как value types — `User u = User_new(args)`. Деструктор `ClassName_free(User *self)` освобождает только string-поля (`tsc_string_release`), не вызывает `free(self)`.

```c
{
    User b = User_new();
    // ... логика ...
    User_free(&b);  // вставлено автоматически — release string-полей, не free()
}
```

При множественных `return` — единая точка очистки:

```c
void process(User u) {
    if (error) goto cleanup;
    // ... работа ...
cleanup:
    if (u_is_owned) User_free(&u);
}
```

**Result + ARC — `_free` всегда проверяет дискриминант:**

`Result<T, E>` — discriminated union. Когда `?` пропагирует ошибку, T никогда не был создан → утечки нет. Но когда `Result<T, E>` dropped без потребления (например, возвращён из функции и проигнорирован), компилятор генерирует `_free_Result_T_E` который проверяет дискриминант и вызывает нужный деструктор:

```c
// генерируемый _free для Result<Shared<User>, Error>
void _free_Result_SharedUser_Error(Result_SharedUser_Error* r) {
    if (r->is_ok) {
        // успех — освобождаем Shared<User>
        SharedUser_release(r->value.ok);
    } else {
        // ошибка — освобождаем Error
        Error_free(&r->value.err);
    }
}
```

Это гарантирует отсутствие утечек при любом пути выполнения: `goto cleanup` всегда вызывает `_free_Result_*` для всех Result на стеке функции.

## Стратегия cleanup при `throw` / `?` — `goto cleanup`

Компилятор генерирует единую точку очистки через `goto cleanup` вместо дублирования free-вызовов на каждой `?`-точке. Это даёт O(N+M) строк вместо O(N×M) где N — owned переменные, M — точки propagation.

**Базовый паттерн:**

```c
// TSClang:
// let items = [1, 2, 3]
// doSomething()?
// doOther()?

// C-output:
Array_f64 items = {0};                // ← value type, zero-init
items = tsc_array_create_f64(4);

_r = doSomething();
if (!_r.ok) goto cleanup;            // один goto — не дублируем free

_r2 = doOther();
if (!_r2.ok) goto cleanup;

use(&items);

cleanup:
    tsc_array_free_f64(&items);      // direct free, no NULL-check
    return ...;
```

Классы и массивы — **value types на стеке** (`{0}` init). Cleanup вызывает `_free(&var)` напрямую — `if (!self) return;` внутри `_free` гарантирует безопасность для zero-init переменных.

**Три нетривиальных случая:**

**1. `goto` через объявления переменных — нарушение C99**

В C99 `goto` не может перепрыгивать через объявление переменной. Для value types это не проблема — `Type var = {0};` не вызывает конструктор. Для `Result` и других локальных переменных компилятор использует `{0}`:

```c
// ❌ нарушение C99 (гипотетический pointer-паттерн):
Foo* a = Foo_new();
if (!r.ok) goto cleanup;
Bar* b = Bar_new();  // goto перепрыгнул это объявление → UB

// ✅ реально генерируемый паттерн — value types с {0}:
Result_i32_Err _result = {0};
Array_i32 items = {0};
items = tsc_array_create_i32(4);

if (!r.ok) goto cleanup;  // goto не перепрыгивает объявления
```

**2. Owned переменные внутри циклов**

`cleanup` в конце функции не знает про loop-local переменные. Для них компилятор генерирует inline free перед `goto`:

```c
// TSClang:
// for (let i = 0; i < n; i++) {
//     let tmp = [1, 2]
//     process(tmp)?
// }

for (int32_t i = 0; i < count; i++) {
    Array_f64 tmp = tsc_array_create_f64(2);   // immediate init

    Result_i32_Err _res_0 = process(i);
    if (!_res_0.ok) {
        tsc_array_free_f64(&tmp);              // ← inline free: loop-local
        _result = ...error...;
        goto cleanup;                          // ← затем outer cleanup
    }

    tsc_array_free_f64(&tmp);                  // нормальный путь — конец итерации
}
```

Компилятор определяет scope каждой переменной и генерирует inline free для loop-local перед `goto`.

**3. Вложенные scopes — разные наборы cleanup**

Переменные из внутренних scopes умирают раньше — нельзя использовать одну метку `cleanup` для всего:

```c
// TSClang:
// let items = [1, 2, 3]
// {
//     let inner = [4, 5]
//     if (fail1) throw ...   // нужны: items + inner
// }                          // inner умирает здесь
// if (fail2) throw ...       // нужны: только items (inner уже мёртв)

Array_f64 items = {0};
items = tsc_array_create_f64(4);

{
    Array_f64 inner = tsc_array_create_f64(2);   // immediate init
    if (x < 0) {
        tsc_array_free_f64(&inner);              // inline: inner scope-local
        _result = ...error...;
        goto cleanup;                            // outer cleanup знает про items (не inner)
    }
    tsc_array_free_f64(&inner);                  // нормальный выход из вложенного scope
}

if (!r2.ok) goto cleanup;                        // cleanup: только items

cleanup:
    tsc_array_free_f64(&items);
    return _result;
```

Компилятор **всегда** генерирует value-type паттерн: `Type var = {0};` для outer переменных, `Type var = create(...)` для inner-scope/loop-local.

**Итоговые правила кодогенерации:**

| Случай | Решение |
|--------|---------|
| Несколько `?`-точек | одна метка `cleanup`, `{0}` инициализация value types |
| `goto` через объявления (C99) | value types: `Type var = {0};` — goto не перепрыгивает через init |
| Loop-local переменные | inline `free(&var)` перед `goto`, затем outer `cleanup` |
| `break` / `continue` в цикле | inline `free(&var)` loop-local переменных перед `break`/`continue` |
| Вложенные scopes | scope-local: inline `free(&var)`; outer: через `cleanup` |

Пример cleanup при `break`:

```c
for (int32_t i = 0; i < 5; i++) {
    String s = STR_LIT("hello");
    if (i == 2) {
        tsc_string_release(s);   // ← inline free перед break
        break;
    }
    total = total + i;
    tsc_string_release(s);       // нормальный путь — конец итерации
}
```

## Iterable\<T\> — пользовательские итерируемые типы

> **Подробная спецификация for-of и Iterable** — в `spec/05c-for-of-iteration.md`. При конфликте — доминирует 05c.

`for...of` работает с любым типом реализующим встроенный interface `Iterable<T>`:

```typescript
// встроен в язык — не требует импорта
interface Iterable<T> {
    iter(): mut () => T | null  // возвращает замыкание-итератор
}
```

Возвращаемое замыкание — **pull-based итератор**: каждый вызов возвращает следующий элемент или `null` когда коллекция исчерпана.

**Реализация пользовательской коллекции:**

```typescript
class Node<T> {
    value: T
    next:  Node<T> | null = null
}

class LinkedList<T> implements Iterable<T> {
    private head: Node<T> | null = null

    iter(): mut () => T | null {
        let current: Ref<Node<T>> | null = this.head  // Ref захвачен в замыкание
        return mut () => {
            if (current == null) return null
            let val = current.value                   // copy или Ref в зависимости от T
            current = current.next
            return val
        }
    }
}

let list = new LinkedList<i32>()
// ...

for (const x of list) {   // ✅ работает через Iterable<T>
    console.log(x)
}
```

**Как компилятор разворачивает `for...of` (см. `spec/05c-for-of-iteration.md` §4.1):**

```typescript
for (const x of list) { body }
// ↓ desugars to:
{
    let _iter = list.iter()
    let _x: T | null
    while ((_x = _iter()) != null) {
        const x = _x
        body  // break/return работают — обычный while
    }
    // _iter auto-drop (RAII scope drop)
}

for (let x of list) { body }
// ↓ desugars to:
{
    let _iter = list.iter()
    let _x: T | null
    while ((_x = _iter()) != null) {
        let x = _x       // let — mutable local
        body
    }
    // _iter auto-drop (RAII scope drop)
}
```

**Почему итератор — замыкание, а не класс с `Ref<T>` в поле:**

`Ref<T>` в поле класса запрещён — компилятор не может отследить lifetime без аннотаций. Замыкание — стековое, его scope автоматически ограничен областью видимости источника:

```typescript
let iter = list.iter()
drop(list)    // ошибка компилятора: iter захватил Ref на list — list не может умереть раньше
```

**C-output** — closure компилируется в struct на стеке, без heap:

```c
// для LinkedList<i32> (примитив — value, не pointer)
typedef struct {
    Node_i32* current;
} LinkedList_i32_iter_t;

// opt_i32: примитив → T value
typedef struct { bool has_value; int32_t value; } opt_i32;

static opt_i32 LinkedList_i32_iter_next(LinkedList_i32_iter_t* self) {
    if (self->current == NULL) return (opt_i32){false};
    int32_t val = self->current->value;               // Copy — примитив
    self->current = self->current->next;
    return (opt_i32){true, val};
}
```

```c
// для LinkedList<User> (class — pointer, P2 borrow protocol)
typedef struct {
    Node_User* current;
} LinkedList_User_iter_t;

// opt_User: complex type → T *value
typedef struct { bool has_value; User *value; } opt_User;

static opt_User LinkedList_User_iter_next(LinkedList_User_iter_t* self) {
    if (self->current == NULL) return (opt_User){false};
    User *val = &self->current->value;                 // Pointer — borrow
    self->current = self->current->next;
    return (opt_User){true, val};
}
```

```c
// для LinkedList<string> (String — struct-by-value, не pointer)
typedef struct {
    Node_string* current;
} LinkedList_string_iter_t;

// opt_string: String → T value (struct copy + retain)
typedef struct { bool has_value; String value; } opt_string;

static opt_string LinkedList_string_iter_next(LinkedList_string_iter_t* self) {
    if (self->current == NULL) return (opt_string){false};
    String val = self->current->value;                 // Copy — struct
    tsc_string_retain(val);                            // retain — новый владелец
    self->current = self->current->next;
    return (opt_string){true, val};
}
```

**Три варианта opt_T** (см. `spec/05c-for-of-iteration.md`):

| Тип элемента | opt_T | Значение |
|-------------|-------|----------|
| Primitive (`i32`, `boolean`, ...) | `T value` | Copy |
| string | `String value` | Struct copy + retain |
| Class / Array | `T *value` | Borrow pointer |

Работает на embedded — нет heap, нет ARC.

**Встроенные типы** (`Array<T>`, `Map<K,V>`, `Set<T>`, `string`) реализуют `Iterable<T>` через тот же механизм — компилятор генерирует `iter()` автоматически.

**Ограничения и как их обойти:**

```typescript
// ❌ итератор живёт дольше коллекции
let iter = list.iter()
drop(list)    // ошибка: iter захватил Ref на list

// ✅ fix: вложенный scope — iter умирает раньше list
{
    let iter = list.iter()
    while ... { iter() }
}             // iter умирает здесь
drop(list)    // ✅ ok


// ❌ мутация коллекции пока итератор жив
let iter = list.iter()
list.push(42)   // ошибка: list изменён пока iter держит Ref

// ✅ fix 1: for...of — iter временный, умирает в конце цикла
for (const x of list) { ... }
list.push(42)   // ✅ ok — iter уже мёртв

// ✅ fix 2: собрать snapshot, потом мутировать
let items = [...list]   // iter временный внутри spread
list.push(42)           // ✅ ok
items.forEach(x => process(x))


// ✅ два read-only итератора одновременно — ok
let i1 = list.iter()
let i2 = list.iter()

// ❌ два mut итератора — ошибка (два Mut<T> запрещены)
```

## Доступ к полям и деструктуризация

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

### Деструктуризация — сахар для copy-доступа к полям

> **Приоритет:** при конфликте — доминирует `spec/05d-spread-destructuring-merge.md`.

Деструктуризация **всегда copy** — source жив, нет move, нет E002. Для сложных типов — copy + retain (новый владелец). Для примитивов — copy. `let`/`const` на result = только мутабельность.

```typescript
const user = new User("Alice", [1, 2, 3]);

const { name, age } = user;
// name: string — copy + retain (независимый владелец)
// age: number — copy (примитив)

console.log(user);         // ok — user жив
console.log(user.name);    // ok — ничего не перемещено
console.log(name);         // ok — независимая копия
```

`user` остаётся жив после деструктуризации:

```typescript
const user = new User("Alice", 30, [1, 2, 3]);
const { name, age, scores } = user;
// name: string (copy + retain), age: number (copy), scores: number[] (copy + retain)

console.log(user);   // ok — ничего не перемещено
console.log(name);   // ok — независимая копия
console.log(scores); // ok — независимая копия
```

### Type annotation на деструктуризации — только тип

Аннотация типа на весь паттерн указывает тип source, но **не меняет** copy-семантику (05d, D4):

```typescript
const { name, age, scores }: { name: string; age: number; scores: number[] } = user;
// name: string (copy + retain), age: number (copy), scores: number[] (copy + retain)

console.log(user);        // ok — user жив
console.log(user.name);   // ok
console.log(user.age);    // ok
```

### Переименование в деструктуризации

Синтаксис `{ field: newName }` — переименование, как в JS/TS:

```typescript
const { name: userName, age: userAge } = user;
// userName: string, userAge: number

// ❌ ошибка компилятора: переименование в зарезервированное имя типа
const { name: string } = user;   // "string" — зарезервированный тип
const { age: number }     = user;   // "number" — зарезервированный тип
const { data: Buffer } = packet; // "Buffer" — зарезервированный тип
```

## Срезы

По умолчанию срез — borrow (`Ref`), исходный массив остаётся жив. Явная аннотация типа даёт owned копию:

```typescript
const arr = [1, 2, 3, 4, 5];

const s = arr[1..3];          // Ref<number[]> — borrow, arr жив
const s: number[] = arr[1..3];   // number[] — owned копия [2, 3]
```

Borrow-срез блокирует мутацию источника пока жив:

```typescript
let arr = [1, 2, 3, 4, 5];
const s = arr[1..3];   // Ref — arr заимствован
arr.push(6);           // ошибка: arr заимствован
```

Отрицательные индексы и открытые срезы:

```typescript
const last = arr[-1];      // последний элемент (copy — примитив)
const tail = arr[1..];     // Ref<number[]> — с 1 до конца
const init = arr[..-1];    // Ref<number[]> — всё кроме последнего
const last2 = arr[-2..];   // Ref<number[]> — последние два
```

## Move из массива по индексу

```typescript
let ref: User;
{
    const users = [user1, user2, user3];
    ref = users[0];  // попытка move из массива
}  // users умирает → ref dangling
```

```
error: cannot move out of array by index
  --> main.tsc:4
hint: use users.remove(0) to take ownership
```

Исправление:

```typescript
let ref: User;
{
    let users = [user1, user2, user3];
    ref = users.remove(0);  // move с удалением — ok
}
```

## Мутация коллекции при активном borrow

Borrow элемента = borrow коллекции.

```typescript
let users = [user1, user2, user3];
let u: Ref<User> = users[0];  // borrow на users
users.push(user4);            // ошибка: mut на заимствованном
```

## Возврат borrow из метода

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

## Borrows в полях класса — запрещено

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

## Замыкания

> **Приоритет:** полная спецификация замыканий — в `05e-closures.md`. При конфликте доминирует 05e.

Замыкание (arrow function) захватывает переменные по-разному: примитивы — copy (snapshot), строки — retain (ARC copy), class/array — **reference** (pointer). Source **всегда жив**. Нет move capture `[x: T]`, нет E002 для implicit capture. Explicit capture: только `[x: Ref<T>]` и `[x: Mut<T>]`. Env struct — stack-allocated, escaping = UB.

Capture model, примеры, C-representation, cleanup — см. `05e-closures.md`.

**Trampoline adapter для capturing callbacks:**

Runtime-макросы (например, `Array.map`, `Array.filter`, `Array.forEach`) ожидают callback вида `void (*fn)(elem)` — без env-параметра. Когда callback является capturing closure (env struct ≠ пустой), компилятор генерирует **trampoline adapter**:

```c
// capturing closure: env содержит captured variable
typedef struct {
    String prefix;
} _closure_0_env;

static _closure_0_env* _tramp_env_0;  // file-scope static env pointer

static String _tramp_adapter_0(String elem) {
    return _closure_0_fn(_tramp_env_0, elem);  // делегирует к реальной closure fn
}

// использование в макросе:
tsc_string_retain(prefix);
_closure_0_env _env = { .prefix = prefix };
_tramp_env_0 = &_env;
Array_String result = Array_String_map(arr, _tramp_adapter_0);
```

**Ограничения:**
- File-scope static pointer — **не реентрантно**. Вложенные capturing callbacks не поддерживаются.
- Приемлемо для TSClang: JS однопоточный, macros синхронные, вложенные capturing callbacks — редкий паттерн.
- Если captures = 0 (bare function), adapter не генерируется — передаётся напрямую.

Mut-захват — замыкание мутирует внешний объект через явный `Mut<T>`:

```typescript
let counter = new Counter();
const inc = [counter: Mut<Counter>](): void => counter.increment();
inc();
inc();
```

### Тип замыкания с Mut-захватом

Замыкание с `Mut<T>` захватом имеет тип `() => T` — как и любое другое замыкание. Mutation видна в capture list, а не в типе функции.

```typescript
const inc = [c: Mut<Counter>](): void => c.increment()
// тип: () => void — одинаков с немутирующим замыканием

arr.forEach(item => log(item))       // () => void
arr.forEach(item => counter.inc())   // () => void — тот же тип, просто мутирует
```

> **Дизайн-решение: нет `mut () => T`.** Рассматривался вариант с отдельным типом `mut () => T` для замыканий с `Mut<T>` захватом — аналог `FnMut` в Rust. Отклонён по причине вирусности: каждая higher-order функция (`map`, `filter`, `forEach`, `sort`) потребовала бы `mut`-перегрузку, а generic callbacks — дополнительной аннотации. При этом mutation в TSClang уже явна: capture list `[c: Mut<Counter>]` нельзя написать случайно — она видна в коде. Дополнительная гарантия на уровне типа функции даёт малый выигрыш при высокой стоимости сложности.

### Mut-closure через await — запрещено

Closure с `[x: Mut<T>]` захватом удерживает mutable pointer на source. Если closure жива через `await` — ошибка компилятора:

```typescript
async function bad() {
    let arr: number[] = [1, 2, 3]
    const fn = [arr: Mut<number[]>]() => arr.push(1)  // arr captured by pointer
    await something()  // ← fn жива через await — ошибка
    fn()
}
// error: closure with Mut<T> capture cannot live across await
//   --> main.tsc:4:5
//    |
//  4 |     await something()
//    |     ^^^^^ closure 'fn' with Mut<number[]> capture still alive
//    |
//    = hint: complete closure before await or create after await
```

Два паттерна решения:

```typescript
// ✅ Вариант 1: вызвать closure до await
async function ok1() {
    let arr: number[] = [1, 2, 3]
    const fn = [arr: Mut<number[]>]() => arr.push(1)
    fn()               // вызвали — borrow освобождён
    await something()
}

// ✅ Вариант 2: создать closure после await
async function ok2() {
    let arr: number[] = [1, 2, 3]
    await something()
    const fn = [arr: Mut<number[]>]() => arr.push(1)  // свежий borrow после await
    fn()
}
```
