# Borrow: Ref\<T\>, Mut\<T\>, Borrow Checker, Scope Constraint

## Ref\<T\> — immutable borrow

Только чтение, без изменения и удаления.

```typescript
function sum(arr: Ref<number[]>): number { ... }

const data = [1, 2, 3];
sum(data);
console.log(data);   // ok — data не перемещён
```

### `Ref<T>` паттерны, borrow из массива, borrow полей — см. [07-classes/](../07-classes/)

`Ref<T>` в полях класса запрещено, auto-borrow, `{}` блок для lifetime, borrow `arr[i]`, borrow полей (запрещено), 4 паттерна решения — см. [07-classes/](../07-classes/).

### Borrow из массива, borrow полей — см. [07-classes/](../07-classes/)

Подробности: borrow `arr[i]`, borrow полей объектов (запрещено), 4 паттерна решения, `{}` блок для lifetime — см. [07-classes/](../07-classes/).

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

## Shared\<T\> / Weak\<T\> — см. `04-shared-weak.md`

Полная спецификация ARC ownership, Weak references, upgrade, разрыв циклов, Desktop vs Embedded — см. `04-shared-weak.md`.

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

**Реактивность** решается через `std/reactive` с explicit-deps — без interior mutability, как чистая библиотека (см. [14-stdlib/](../14-stdlib/)).

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

> Полная спецификация замыканий — в [06-functions/](../06-functions/).

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
