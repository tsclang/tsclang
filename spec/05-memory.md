# TSClang — Модель памяти

**Гибридная модель:** статический ownership/borrow checker + опциональный ARC. Нет GC, нет ручного `free`.

## Типы владения

| Тип | Семантика |
|-----|-----------|
| `T` | **Owner** — владеет объектом, move при передаче |
| `Ref<T>` | **Immutable borrow** — только чтение |
| `Mut<T>` | **Mutable borrow** — чтение и запись |
| `Shared<T>` | **ARC** — strong ref, увеличивает refcount |
| `Weak<T>` | **Weak ref** — не увеличивает refcount, разрывает циклы |
| `Slice<T>` | **Borrowed array view** — zero-copy sub-range, pointer + length |

`Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>` — **режимы хранения**, каждый имеет конкретное C-представление:

| Тип | C-представление | Примечание |
|-----|----------------|-----------|
| `T` (owned) | `T value` / `T* ptr` | move = не вызываем free на источнике |
| `Ref<T>` | `const T* ptr` | read-only pointer |
| `Mut<T>` | `T* ptr` | read-write pointer |
| `Shared<T>` | `T* ptr` + `atomic_size_t refcount` | ARC |
| `Weak<T>` | `T* ptr` + `atomic_size_t weak_refcount` | не удерживает объект |

> **`Move<T>` не существует** — move это операция передачи ownership, а не режим хранения. В C нет нового типа: `Move<T>` = `T`. Bare `T` в параметрах и возвращаемых типах уже означает move.

## Базовые правила

- **Примитивы** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — всегда **копируются**, borrow checker не применяется; `T | null` компилируется в struct с флагом
- **Сложные типы** (массивы, объекты, строки, классы) — управляются ownership системой
  - `string` — Owner, валидная UTF-8 последовательность байтов; передаётся как `Ref<string>`, копируется через `clone()`; `s[i]` возвращает `u8` (примитив, copy) — индексация не создаёт borrow. Литералы не выделяют heap (`capacity = 0`, data → rodata); heap выделяется только при динамическом построении (конкатенация, методы возвращающие новую строку, чтение из I/O)

## Owner (T) — владение

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
function sum(arr: Ref<i32[]>): i32 { ... }

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
function push(arr: Mut<i32[]>, val: i32) {
    arr.push(val);
}

let data = [1, 2, 3];
push(data, 4);
console.log(data);   // [1, 2, 3, 4]
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
Node* node1 = Node_new();
RC_retain(node1);   // refcount = 1
Node* node2 = Node_new();
RC_retain(node2);   // refcount = 1
node1->next = node2;
RC_retain(node2);   // refcount = 2
node2->prev = node1; // weak — RC_retain не вызывается
```

## Правила Borrow Checker

1. **Нельзя два Mut одновременно**
   ```typescript
   let a = [1, 2, 3];
   let r1: Mut<i32[]> = a;
   let r2: Mut<i32[]> = a;   // ошибка: уже есть активный Mut
   ```

2. **Нельзя Mut + Ref одновременно**
   ```typescript
   let a = [1, 2, 3];
   let r1: Ref<i32[]> = a;
   let r2: Mut<i32[]> = a;   // ошибка: a уже заимствован как Ref
   ```

3. **Можно несколько Ref одновременно**
   ```typescript
   let a = [1, 2, 3];
   let r1: Ref<i32[]> = a;
   let r2: Ref<i32[]> = a;   // ok
   ```

## Правила передачи аргументов в функцию

Тип параметра в сигнатуре **полностью диктует semantics на callsite** — явных `&` или `*` не нужно.

**Примитивы — всегда copy**, независимо от типа параметра:
```typescript
function foo(x: i32): void { ... }
let n = 42;
foo(n);  // copy — n жив после вызова
```

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

## Interior Mutability — почему её нет

`Shared<T>` — строго read-only (матрица: `Shared<T>` → `Mut<T>` = ❌). Это намеренное ограничение.

**На embedded** `Shared<T>` нет вообще — нет heap, нет ARC. Глобальное мутабельное состояние — через `@static let`.

## `@static let` — мутабельное глобальное состояние

`@static let` объявляет переменную с `'static` lifetime — живёт всю программу, размещается в BSS.

```typescript
@static let tasks = new Tasks<8>()
@static let counter: i32 = 0
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
@static let counter: i32 = 0
Thread.spawn(() => { counter++ })  // ошибка: @static let 'counter' accessed from thread — use Atomic<i32>
```

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

**Реактивность** решается через `std/reactive` с explicit-deps — без interior mutability, как чистая библиотека (см. std/reactive в [spec/09-stdlib.md](spec/09-stdlib.md)).

## Scope Constraint (без lifetime аннотаций)

TSC не имеет явных lifetime аннотаций (как `'a` в Rust). Вместо них — набор консервативных правил, которые компилятор проверяет статически.

**Правило 1: Ref/Mut нельзя в глобал**
```typescript
let global: Ref<User>;  // ошибка

function foo(u: Ref<User>) {
    global = u;  // ошибка: borrow не может пережить функцию
}
```

**Правило 2: Нельзя вернуть ссылку на локал**
```typescript
function bad(): Ref<User> {
    const u = new User();
    return u;  // ошибка: u умрёт в конце функции
}
```

**Правило 3: Возвращаемый `Ref<T>` и привязка к источнику**

**Один входной `Ref<T>`** — возвращаемый `Ref<T>` автоматически привязан к нему:

```typescript
function first(a: Ref<string>, n: i32): Ref<string> {
    return a   // ✅ результат привязан к a — компилятор знает источник точно
}

const s = "hello"
const r = first(s, 42)
console.log(r)  // ✅ валиден пока жив s
```

**Несколько входных `Ref<T>`** — компилятор консервативно считает что результат привязан к **минимальному** lifetime из всех входных Ref. Результат валиден пока живы **все** источники:

```typescript
function getLonger(a: Ref<string>, b: Ref<string>): Ref<string> {
    return a.length > b.length ? a : b
}

const s1 = "hello"
const s2 = "world!"
const longer = getLonger(s1, s2)
// longer валиден пока живы и s1, и s2 — borrow checker проверяет оба
console.log(longer)   // ✅

// ❌ если s1 или s2 dropped раньше longer — ошибка компилятора
```

Это **консервативно**: при нескольких Ref-параметрах компилятор может отклонить валидный код если не может доказать что конкретный источник переживёт результат. В таких случаях — использовать `clone()` или `Shared<T>`:

```typescript
// если нужно чтобы результат пережил источники — clone
function getLongerOwned(a: Ref<string>, b: Ref<string>): string {
    return (a.length > b.length ? a : b).clone()
}
```

**Правило 4: `Ref<T>` и `Mut<T>` не могут пережить точку `await`**

Borrow не может оставаться живым через `await` — borrow checker отвергает такой код. Причина: async state machine сохраняет состояние между suspension points, и источник borrow может быть invalidated или moved другой coroutine пока ожидает:

```typescript
// ❌ Ошибка компилятора: borrow пережил await
async function bad(arr: i32[]): Promise<void> {
    const r: Ref<i32> = arr[0]   // borrow из arr
    await something()            // ← r жив через await — ошибка
    console.log(r)
}

// ✅ Clone перед await
async function ok(arr: i32[]): Promise<void> {
    const val: i32 = arr[0]      // копия значения (i32 — Copy-тип)
    await something()
    console.log(val)
}

// ✅ Использовать borrow до await, новый borrow после
async function ok2(arr: i32[]): Promise<void> {
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

## Автоматический Drop

Компилятор вставляет `free()` в конце scope владельца:

```c
{
    User* b = User_new();
    // ... логика ...
    User_free(b);  // вставлено автоматически
}
```

При множественных `return` — единая точка очистки:

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... работа ...
cleanup:
    if (u_is_owned) User_free(u);
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
        Error_free(r->value.err);
    }
}
```

Это гарантирует отсутствие утечек при любом пути выполнения: `goto cleanup` всегда вызывает `_free_Result_*` для всех Result на стеке функции.

## Стратегия cleanup при `throw` / `?` — `goto cleanup`

Компилятор генерирует единую точку очистки через `goto cleanup` вместо дублирования free-вызовов на каждой `?`-точке. Это даёт O(N+M) строк вместо O(N×M) где N — owned переменные, M — точки propagation.

**Базовый паттерн:**

```c
// TSClang:
// let a = new Foo()
// let b = new Bar()
// doSomething()?
// doOther()?

// C-output:
Foo* a = NULL;   // ← все указатели объявлены NULL в начале функции
Bar* b = NULL;

a = Foo_new();
b = Bar_new();

_r = doSomething();
if (!_r.ok) goto cleanup;   // один goto — не дублируем free

_r2 = doOther();
if (!_r2.ok) goto cleanup;

use(a, b);

cleanup:
    if (b) Bar_free(b);   // NULL-check безопасен — b мог не быть создан
    if (a) Foo_free(a);
    return ...;
```

**Три нетривиальных случая:**

**1. `goto` через объявления переменных — нарушение C99**

В C99 `goto` не может перепрыгивать через объявление переменной. Решение — объявлять все owned указатели как `NULL` в самом начале функции, присвоение отдельно:

```c
// ❌ нарушение C99:
Foo* a = Foo_new();
if (!r.ok) goto cleanup;
Bar* b = Bar_new();  // goto перепрыгнул это объявление → UB

// ✅ правильно — объявления в начале, присвоения отдельно:
Foo* a = NULL;
Bar* b = NULL;       // объявлены до любого goto → C99 ok

a = Foo_new();
if (!r.ok) goto cleanup;
b = Bar_new();
if (!r2.ok) goto cleanup;

cleanup:
    if (b) Bar_free(b);
    if (a) Foo_free(a);
```

Компилятор **всегда** генерирует этот паттерн — объявления всех owned переменных функции в начале блока.

**2. Owned переменные внутри циклов**

`cleanup` в конце функции не знает про loop-local переменные. Для них компилятор генерирует inline free перед `goto`:

```c
// TSClang:
// for (let i = 0; i < n; i++) {
//     let item = new Item()
//     process(item)?
// }

for (int i = 0; i < n; i++) {
    Item* item = Item_new();

    _r = process(item);
    if (!_r.ok) {
        Item_free(item);   // ← inline free: loop-local переменная
        goto cleanup;      // ← затем outer cleanup
    }

    Item_free(item);       // нормальный путь — конец итерации
}
```

Компилятор определяет scope каждой переменной и генерирует inline free для loop-local перед `goto`.

**3. Вложенные scopes — разные наборы cleanup**

Переменные из внутренних scopes умирают раньше — нельзя использовать одну метку `cleanup` для всего:

```c
// TSClang:
// let a = new Foo()
// {
//     let b = new Bar()
//     if (fail1) throw ...   // нужны: a + b
// }                          // b умирает здесь
// let c = new Baz()
// if (fail2) throw ...       // нужны: a + c (b уже мёртв)

Foo* a = NULL;
Baz* c = NULL;

a = Foo_new();

{
    Bar* b = NULL;
    b = Bar_new();
    if (!r.ok) {
        Bar_free(b);       // inline: b scope-local
        goto cleanup;      // outer cleanup знает про a (не b)
    }
    Bar_free(b);           // нормальный выход из вложенного scope
}

c = Baz_new();
if (!r2.ok) goto cleanup;  // cleanup: a + c (b уже мёртв)

cleanup:
    if (c) Baz_free(c);
    if (a) Foo_free(a);
```

**Итоговые правила кодогенерации:**

| Случай | Решение |
|--------|---------|
| Несколько `?`-точек | одна метка `cleanup`, `NULL`-инициализация всех указателей |
| `goto` через объявления (C99) | объявить все owned указатели `NULL` в начале блока |
| Loop-local переменные | inline free перед `goto`, затем outer `cleanup` |
| Вложенные scopes | scope-local переменные: inline free; outer: через `cleanup` |

## Iterable\<T\> — пользовательские итерируемые типы

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

**Как компилятор разворачивает `for...of`:**

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
// для LinkedList<i32>
typedef struct {
    Node_i32* current;   // захваченный Ref<Node<i32>>
} LinkedList_i32_iter_t;

static int32_t* LinkedList_i32_iter_next(LinkedList_i32_iter_t* self) {
    if (self->current == NULL) return NULL;
    int32_t* val = &self->current->value;
    self->current = self->current->next;
    return val;
}
```

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
const age = user.age;      // i32 — copy (примитив)

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

### Деструктуризация — сахар для borrow-доступа к полям

Деструктуризация без аннотации типа — **всегда borrow** для сложных типов и copy для примитивов:

```typescript
const { name, age } = user;
// эквивалентно:
// const name = user.name;  → Ref<string>  (borrow, не move)
// const age = user.age;    → i32 (copy)
```

`user` остаётся жив после деструктуризации:

```typescript
const user = new User("Alice", 30, [1, 2, 3]);
const { name, age, scores } = user;
// name: Ref<string>, age: i32, scores: Ref<i32[]>

console.log(user);   // ok — ничего не перемещено
console.log(name);   // ok
console.log(scores); // ok
```

### Деструктуризация с аннотацией типа — move

Аннотация типа на весь паттерн делает move всех сложных полей (синтаксис совместим с TS):

```typescript
const { name, age, scores }: { name: string; age: i32; scores: i32[] } = user;
// name: string (move), age: i32 (copy), scores: i32[] (move)

console.log(user);        // ошибка: user частично consumed
console.log(user.name);   // ошибка: поле перемещено
console.log(user.age);    // ok — примитив скопирован, не перемещён
```

> **Линтер:** предупреждает о move через деструктуризацию — `lint: destructure-move`.

### Переименование в деструктуризации

Синтаксис `{ field: newName }` — переименование, как в JS/TS:

```typescript
const { name: userName, age: userAge } = user;
// userName: Ref<string>, userAge: i32

// ❌ ошибка компилятора: переименование в зарезервированное имя типа
const { name: string } = user;   // "string" — зарезервированный тип
const { age: i32 }     = user;   // "i32" — зарезервированный тип
const { data: Buffer } = packet; // "Buffer" — зарезервированный тип
```

## Срезы

По умолчанию срез — borrow (`Ref`), исходный массив остаётся жив. Явная аннотация типа даёт owned копию:

```typescript
const arr = [1, 2, 3, 4, 5];

const s = arr[1..3];          // Ref<i32[]> — borrow, arr жив
const s: i32[] = arr[1..3];   // i32[] — owned копия [2, 3]
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
const tail = arr[1..];     // Ref<i32[]> — с 1 до конца
const init = arr[..-1];    // Ref<i32[]> — всё кроме последнего
const last2 = arr[-2..];   // Ref<i32[]> — последние два
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

### Правила захвата

**Примитивы** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — всегда **копируются**:

```typescript
let x: i32 = 42;
const fn = (): i32 => x + 1;  // x скопирован, не захвачен по ссылке
x = 99;
fn();  // вернёт 43, не 100 — x скопирован в момент создания замыкания
```

**Сложные типы** (массивы, объекты, строки, классы) — по умолчанию захватываются по `Ref`:

```typescript
const items = [1, 2, 3];
const fn = (): i32 => items.length;  // fn держит Ref<items>
fn();  // ok — items жив
```

```typescript
let fn: () => i32;
{
    const items = [1, 2, 3];
    fn = (): i32 => items.length;  // захватывает Ref<items>
}
fn();  // ошибка: items мёртв
```

### Явный список захвата

`[var: Type]` перед параметрами — те же типы что везде:

```typescript
[data: Data]()          // T — move, замыкание становится владельцем
[data: Ref<Data>]()     // Ref — immutable borrow (явно, то же что по умолчанию)
[data: Mut<Data>]()     // Mut — mutable borrow
```

Move-захват решает проблему когда замыкание переживает источник:

```typescript
// ошибка без явного захвата — Ref не может пережить функцию
function makeGreeter(): () => void {
    const name = "Alice";
    return (): void => console.log(name);  // ошибка: name умрёт
}

// ok — name перемещён в замыкание, живёт пока живёт замыкание
function makeGreeter(): () => void {
    const name = "Alice";
    return [name: string](): void => console.log(name);  // ok
}
```

C-output — замыкание с move-захватом возвращается **по значению** (как любой C struct), heap не нужен. Монорфизация устраняет type erasure — каждый уникальный тип замыкания известен на этапе компиляции:

```c
typedef struct {
    String name;                     // owned String, moved in
    void (*fn)(struct Closure_0*);   // указатель на функцию
} Closure_0;

static void Closure_0_fn(Closure_0* self) {
    printf("%s\n", self->name.data);
}

Closure_0 makeGreeter(void) {
    String name = { .data = "Alice", .length = 5, .capacity = 0 };
    return (Closure_0){ .name = name, .fn = Closure_0_fn };
    // name скопирован в struct по значению — stack frame makeGreeter умирает, struct жив
}

// caller:
Closure_0 greet = makeGreeter();  // struct на стеке caller-а
greet.fn(&greet);                  // вызов
String_drop(&greet.name);         // drop owned поля когда greet умирает
```

Функция, принимающая замыкание, монорфизируется под конкретный тип:

```c
// callTwice специализирован под Closure_0
static void callTwice_Closure_0(Closure_0* f) {
    f->fn(f);
    f->fn(f);
}
```

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

Closure с `[x: Mut<T>]` захватом **перемещает** borrow в closure struct. Если closure жива через `await` — ошибка компилятора:

```typescript
async function bad() {
    let arr = [1, 2, 3]
    const fn = [arr: Mut<i32[]>]() => arr.push(1)  // arr moved в fn
    await something()  // ← fn жива через await — ошибка
    fn()
}
// error: closure with Mut<T> capture cannot live across await
//   --> main.tsc:4:5
//    |
//  4 |     await something()
//    |     ^^^^^ closure 'fn' with Mut<i32[]> capture still alive
//    |
//    = hint: use owned capture [arr: i32[]] or complete closure before await
```

Три паттерна решения:

```typescript
// ✅ Вариант 1: owned capture — closure владеет данными
async function ok1() {
    let arr = [1, 2, 3]
    const fn = [arr: i32[]]() => arr.push(1)  // owned — ok через await
    await something()
    fn()
}

// ✅ Вариант 2: вызвать closure до await
async function ok2() {
    let arr = [1, 2, 3]
    const fn = [arr: Mut<i32[]>]() => arr.push(1)
    fn()               // вызвали — fn дропнулась, borrow освобождён
    await something()
}

// ✅ Вариант 3: создать closure после await
async function ok3() {
    let arr = [1, 2, 3]
    await something()
    const fn = [arr: Mut<i32[]>]() => arr.push(1)  // свежий borrow после await
    fn()
}
```
