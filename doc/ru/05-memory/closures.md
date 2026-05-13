# Замыкания

[← Вверх](./index.md) | [Предыдущий ←](./auto-drop.md)

---

Замыкания в TSClang компилируются в **struct на стеке** — без heap-аллокации. Правила захвата зависят от типа переменной.

## Правила захвата

### Примитивы — всегда copy

Примитивные типы (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) копируются в момент создания замыкания:

```typescript
let x: i32 = 42;
const fn = (): i32 => x + 1;    // x скопирован
x = 99;
fn();    // → 43, не 100
```

### Сложные типы — Ref по умолчанию

Массивы, объекты, строки, классы по умолчанию захватываются по `Ref<T>`:

```typescript
const items = [1, 2, 3];
const fn = (): i32 => items.length;    // fn держит Ref<items>
fn();    // ok — items жив
```

Замыкание не может пережить источник при Ref-захвате:

```typescript
let fn: () => i32;
{
    const items = [1, 2, 3];
    fn = (): i32 => items.length;    // захватывает Ref<items>
}
fn();    // ошибка: items мёртв
```

## Явный список захвата

`[var: Type]` перед параметрами — те же типы владения, что и везде:

```typescript
[data: Data]()          // T — move, замыкание становится владельцем
[data: Ref<Data>]()     // Ref — immutable borrow (как по умолчанию)
[data: Mut<Data>]()     // Mut — mutable borrow
```

### Move-захват `[var: T]`

Замыкание забирает ownership. Решает проблему когда замыкание переживает источник:

```typescript
// ошибка — Ref не может пережить функцию
function makeGreeter(): () => void {
    const name = "Alice";
    return (): void => console.log(name);    // name умрёт
}

// ok — name перемещён в замыкание
function makeGreeter(): () => void {
    const name = "Alice";
    return [name: string](): void => console.log(name);    // move
}
```

C-output — замыкание с move-захватом:

```c
typedef struct {
    String name;                     // owned String, moved in
    void (*fn)(struct Closure_0*);
} Closure_0;

static void Closure_0_fn(Closure_0* self) {
    printf("%s\n", self->name.data);
}

Closure_0 makeGreeter(void) {
    String name = { .data = "Alice", .length = 5, .capacity = 0 };
    return (Closure_0){ .name = name, .fn = Closure_0_fn };
    // name moved into struct — stack frame dies, struct lives
}

// caller:
Closure_0 greet = makeGreeter();    // struct на стеке caller-а
greet.fn(&greet);                    // вызов
String_drop(&greet.name);           // drop owned поля при смерти greet
```

Функция, принимающая замыкание, монорфизируется под конкретный тип:

```c
// callTwice специализирован под Closure_0
static void callTwice_Closure_0(Closure_0* f) {
    f->fn(f);
    f->fn(f);
}
```

### Mut-захват `[var: Mut<T>]`

Замыкание мутирует внешний объект через явный `Mut<T>`:

```typescript
let counter = new Counter();
const inc = [counter: Mut<Counter>](): void => counter.increment();
inc();
inc();
```

### Ref-захват `[var: Ref<T>]`

Явная форма того, что происходит по умолчанию. Полезна для документирования намерений:

```typescript
const data = [1, 2, 3];
const fn = [data: Ref<i32[]>](): i32 => data.length;    // явный borrow
```

## Нет `mut () => T`

Замыкание с `Mut<T>` захватом имеет тип `() => T` — как и любое другое. Мутация видна в capture list, а не в типе функции:

```typescript
const inc = [c: Mut<Counter>](): void => c.increment()
// тип: () => void — тот же, что и у немутирующего замыкания

arr.forEach(item => log(item))       // () => void
arr.forEach(item => counter.inc())   // () => void — тот же тип
```

> **Дизайн-решение:** отдельный тип `mut () => T` (аналог `FnMut` в Rust) отклонён. Причина — вирусность: каждая higher-order функция (`map`, `filter`, `forEach`) потребовала бы `mut`-перегрузку, а generic callbacks — дополнительной аннотации. Capture list `[c: Mut<Counter>]` уже делает мутацию явной — её нельзя написать случайно.

## Mut-closure через await — запрещено

Closure с `[x: Mut<T>]` захватом **перемещает** borrow в closure struct. Если closure жива через `await` — ошибка компилятора:

```typescript
async function bad() {
    let arr = [1, 2, 3]
    const fn = [arr: Mut<i32[]>]() => arr.push(1)    // arr moved в fn
    await something()    // fn жива через await — ошибка
    fn()
}
// error: closure with Mut<T> capture cannot live across await
//   hint: use owned capture [arr: i32[]] or complete closure before await
```

### Решение 1: owned capture

```typescript
async function ok() {
    let arr = [1, 2, 3]
    const fn = [arr: i32[]]() => arr.push(1)    // owned — ok через await
    await something()
    fn()
}
```

### Решение 2: вызвать closure до await

```typescript
async function ok() {
    let arr = [1, 2, 3]
    const fn = [arr: Mut<i32[]>]() => arr.push(1)
    fn()                    // вызвали — fn дропнулась, borrow освобождён
    await something()
}
```

### Решение 3: создать closure после await

```typescript
async function ok() {
    let arr = [1, 2, 3]
    await something()
    const fn = [arr: Mut<i32[]>]() => arr.push(1)    // свежий borrow
    fn()
}
```

## Итераторы через замыкания

`Iterable<T>` использует замыкание-итератор вместо класса с `Ref<T>` в поле:

```typescript
interface Iterable<T> {
    iter(): mut () => T | null    // closure-iterator
}
```

Замыкание разрешено, потому что оно стековое и не может пережить источник:

```typescript
class LinkedList<T> implements Iterable<T> {
    private head: Node<T> | null = null

    iter(): mut () => T | null {
        let current: Ref<Node<T>> | null = this.head    // Ref в замыкании
        return mut () => {
            if (current == null) return null
            let val = current.value
            current = current.next
            return val
        }
    }
}
```

C-output — closure компилируется в struct на стеке, без heap:

```c
// for LinkedList<i32>
typedef struct {
    Node_i32* current;   // captured Ref<Node<i32>>
} LinkedList_i32_iter_t;

static int32_t* LinkedList_i32_iter_next(LinkedList_i32_iter_t* self) {
    if (self->current == NULL) return NULL;
    int32_t* val = &self->current->value;
    self->current = self->current->next;
    return val;
}
```

Работает на embedded — нет heap, нет ARC.

## Ошибки

### Замыкание пережило источник

```typescript
let fn: () => i32;
{
    const items = [1, 2, 3];
    fn = (): i32 => items.length;
}
fn();    // ошибка: items мёртв, borrow dangling
```

Исправление — move-захват:

```typescript
function makeFn(): () => i32 {
    const items = [1, 2, 3];
    return [items: i32[]](): i32 => items.length;    // move — ok
}
```

### Mut-closure через await

```typescript
async function bad() {
    let arr = [1, 2, 3]
    const fn = [arr: Mut<i32[]>]() => arr.push(1)
    await something()
    fn()
}
// error: closure with Mut<T> capture cannot live across await
//   hint: use owned capture [arr: i32[]] or complete closure before await
```

Исправления — см. раздел [Mut-closure через await](#mut-closure-через-await--запрещено) выше.

## Сводная таблица захвата

| Тип переменной | Захват по умолчанию | Явный захват | Через await? |
|----------------|--------------------|--------------|--------------|
| Примитив (`i32`, `f64`...) | copy | — | ✅ всегда |
| Сложный `let` / `const` | `Ref<T>` | `[x: T]` (move) | ❌ Ref через await |
| Сложный `let` | `Ref<T>` | `[x: Mut<T>]` (mut) | ❌ Mut через await |
| Сложный `let` | `Ref<T>` | `[x: T]` (owned) | ✅ owned через await |

## См. также

- [Правила Borrow Checker](./borrow-rules.md) — ограничения на одновременные borrow
- [Scope Constraint](./scope-constraint.md) — Ref/Mut через await
- [Auto Drop](./auto-drop.md) — drop captured owned значений
- [Стрелочные функции](../02-syntax/functions/arrow.md) — синтаксис замыканий
- [Async/Await](../07-concurrency/async-await.md) — state machines и capture
