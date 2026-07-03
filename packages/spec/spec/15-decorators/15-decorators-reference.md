## Built-in decorators — quick reference

Для каждого декоратора: что делает, где применяется, и что происходит **без** него.

---

### 1. `@static`

**Что:** Размещает переменную/функцию в BSS (статическая память), не на стеке/heap.

**Применяется к:** `let`, `const`, `function`, `async function`, `function*`, `async function*`

```typescript
@static let counter: i32 = 0;             // → static int32_t counter = 0;
@static const arr = new Array<i32>(64);   // → static i32 arr_data[64]; + struct wrapper
@static async function task(): void { }   // → static task_state _task_instance; + cooperative scheduler
@static function* gen(): Generator<void> { yield; }  // → static gen_state _gen_instance;
```

**Без `@static`** — локальная переменная или heap:

```typescript
let counter: i32 = 0;                     // → int32_t counter = 0; внутри функции
const arr = new Array<i32>(64);           // → heap allocation
async function task(): void { }           // → heap allocation для state machine
function* gen(): Generator<void> { yield; }  // → heap allocation для state
```

См. [04-borrow.md](../04-ownership/04-borrow.md), [10-async.md](../10-async/10-async.md), [06-functions.md](../06-functions/06-functions.md).

---

### 2. `@readonly`

**Что:** Поле класса становится `const` в C struct. Запрет записи вне constructor.

**Применяется к:** поля класса (на method — error)

```typescript
class Entity {
    @readonly id: i32 = 1;    // → typedef struct { const int32_t id; } Entity;
}
```

**Без `@readonly`** — mutable поле:

```typescript
class Entity {
    id: i32 = 1;              // → typedef struct { int32_t id; } Entity;
}
```

См. [07-classes-ownership.md](../07-classes/07-classes-ownership.md#readonly-class-field).

---

### 3. `@packed`

**Что:** Убирает padding между полями struct.

**Применяется к:** `class`. Несовместимо с `@align`.

```typescript
@packed
class Packet { type: u8; length: u16; checksum: u32; }
// → typedef struct __attribute__((packed)) { uint8_t type; uint16_t length; uint32_t checksum; } Packet;
// sizeof = 7
```

**Без `@packed`** — стандартный C padding:

```typescript
class Packet { type: u8; length: u16; checksum: u32; }
// → typedef struct { uint8_t type; uint16_t length; uint32_t checksum; } Packet;
// sizeof = 12 (padding после type и после length)
```

См. [07-packed-align.md](../07-classes/07-packed-align.md).

---

### 4. `@align(N)`

**Что:** Гарантированное выравнивание struct в памяти. N = степень двойки.

**Применяется к:** `class`. Несовместимо с `@packed`.

```typescript
@align(16)
class SimdVector { x: f32; y: f32; z: f32; w: f32; }
// → typedef struct __attribute__((aligned(16))) { float x, y, z, w; } SimdVector;
```

**Без `@align`** — выравнивание по умолчанию (по размеру наибольшего поля):

```typescript
class SimdVector { x: f32; y: f32; z: f32; w: f32; }
// → typedef struct { float x, y, z, w; } SimdVector;  alignment = 4
```

См. [07-packed-align.md](../07-classes/07-packed-align.md).

---

### 5. `@platform("target")`

**Что:** Условная компиляция — функция/метод попадает в выход только для указанной платформы.

**Применяется к:** `function`, `method` (внутри class)

```typescript
@platform("avr")
function initHardware(): void { ... }    // отсутствует в desktop-билде

@platform("desktop")
function networkCall(): void { ... }     // отсутствует в avr-билде
```

**Без `@platform`** — компилируется на всех платформах:

```typescript
function init(): void { console.log("init"); }  // есть везде
```

См. [12-platform.md](../12-modules/12-modules.md).

---

### 6. `@struct`

**Что:** Value type на стеке, без указателей и vtable. Нельзя иметь методы с телом (только пустые/constructor).

**Применяется к:** `class`

```typescript
@struct class Vec2 { x: i32; y: i32; }
let v = new Vec2();                       // → Vec2 v = {0}; (стек)
function shift(p: Vec2, dx: i32): Vec2 { ... }  // pass by value
```

**Без декоратора** — value type на стеке (default), но с методами и constructor:

```typescript
class Vec2 { x: i32; y: i32; constructor(x: i32, y: i32) { ... } move() { ... } }
let v = new Vec2(1, 2);                   // → Vec2 v = Vec2_new(1, 2); (стек)
function shift(p: Vec2, dx: i32): Vec2 { ... }  // pass by pointer (Mut<Vec2>)
```

> Классы в TSClang — **value types по умолчанию** (stack struct). `@struct` добавляет ограничения:
> нет методов, нет vtable, нет inheritance — чистый C struct. Для heap-аллокации используйте `@heap`.

См. [07-classes-ownership.md](../07-classes/07-classes-ownership.md#struct--value-type-class).

---

### 7. `@heap`

**Что:** Heap-аллокация через `malloc`/`free`. Класс становится pointer type.

**Применяется к:** `class`. Несовместимо с `@struct`, `@pool`. Запрещён при `allocator: "static"`.

```typescript
@heap class Node { value: i32; next: Node | null; constructor(v: i32) { ... } }
let n = new Node(42);                     // → Node* n = Node_new(42); (malloc)
// auto-free при выходе из scope (destructor)
```

**Без `@heap`** — value type на стеке:

```typescript
class Node { value: i32; next: Node | null; constructor(v: i32) { ... } }
let n = new Node(42);                     // → Node n = Node_new(42); (стек)
```

> `@heap` — единственный способ получить heap-аллокированный класс. Используется для динамических
> структур (деревья, графы, циклические ссылки).

См. [07-classes-ownership.md](../07-classes/07-classes-ownership.md#heap--heap-аллокация-классов).

---

### 8. `@pool(N)`

**Что:** Статический пул на N экземпляров в BSS. `new` берёт слот, auto-drop при выходе из scope.

**Применяется к:** `class` (N ≤ 64). Несовместимо с `@heap`, `@struct`. Работает на всех платформах.

```typescript
@pool(4) class Gem { value: i32; constructor(v: i32) { this.value = v; } }
function create(): Gem throws Error {
    const g = new Gem(42);               // alloc из pool + constructor
    return g;
}                                        // auto-drop если не return → слот освобождается
// pool full → throws Error
```

**Без `@pool`** — value type на стеке:

```typescript
class Gem { value: i32; constructor(v: i32) { ... } }
let g = new Gem(42);                     // → Gem g = Gem_new(42); (стек)
```

> `@pool` даёт pointer-семантику (`opt_ref_Gem`) без heap — для embedded, где malloc недоступен,
> но нужен shared mutable доступ. На desktop даёт pool-аллокацию для частых alloc/dealloc.

См. [07-classes-ownership.md](../07-classes/07-classes-ownership.md#pooln--статический-пул-объектов).

---

### 9. `@isr("VECTOR")`

**Что:** Обработчик прерывания. Без `async`, без `throw`. Embedded only.

**Применяется к:** `function`

```typescript
@isr("TIMER1_COMPA")
function onTimer(): void { /* ... */ }
// → ISR(TIMER1_COMPA_vect) { /* ... */ }
```

**Без `@isr`** — обычная функция, вызывается вручную:

```typescript
function onTimer(): void { /* ... */ }
// → void onTimer(void) { /* ... */ }
```

См. [11-concurrency.md](../11-concurrency/11-concurrency.md).

---

### 10. `@stack("name", N)`

**Что:** Static stack-массивы в BSS + макросы `push`/`pop`/`empty` из `std/stack`.

**Применяется к:** `function`

```typescript
import { push, pop, empty } from "std/stack";

@stack("items", 16)
function process(): void {
    push("items", 42);
    const val = pop<i32>("items");
    if (empty("items")) { /* ... */ }
}
// → static uintptr_t items_stack[16]; static uint8_t items_stack_top = 0;
```

**Без `@stack`** — `Array` на heap:

```typescript
function process(): void {
    const items = new Array<i32>(16);    // heap allocation
    items.push(42);
    const val = items.pop();
}
```

> `@stack` — для async-рекурсии на embedded (обход деревьев, DFS, парсинг), где heap недоступен.

См. [10-async.md](../10-async/10-async.md).

---

### Сводная таблица

| # | Декоратор | К чему | Платформа | Эффект |
|---|-----------|--------|-----------|--------|
| 1 | `@static` | let, const, function, async fn, fn* | все | BSS storage |
| 2 | `@readonly` | class field | все | `const` qualifier |
| 3 | `@packed` | class | все | `__attribute__((packed))` |
| 4 | `@align(N)` | class | все | `__attribute__((aligned(N)))` |
| 5 | `@platform` | function, method | все | conditional compilation |
| 6 | `@struct` | class | все | value type, no methods/vtable |
| 7 | `@heap` | class | desktop | `malloc`/`free`, pointer type |
| 8 | `@pool(N)` | class | все | static pool, `opt_ref_T` |
| 9 | `@isr` | function | embedded | ISR handler |
| 10 | `@stack` | function | все | BSS stack arrays + macros |
