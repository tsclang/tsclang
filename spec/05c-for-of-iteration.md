# TSClang — Итерация: for..of, Iterable\<T\>, семантика item

> **ПРИОРИТЕТ:** при конфликте с другими разделами spec (02-syntax.md, 03-types.md, 04-classes.md, 05b-ownership.md) — доминирует этот файл. Решения здесь зафиксированы после аудита impl/spec/tests и являются окончательными.
>
> **Связь с 05d:** for-of использует **borrow** (pointer) для complex-типов — zero-cost итерация без создания новых данных. Spread/destructuring (см. `spec/05d-spread-destructuring-merge.md`) использует **copy** (struct copy + retain) — создание нового контейнера. Разные операции = разная семантика. Это осознанный дизайн, не противоречие.
>
> **Связь с 05e:** итераторы (`iter()`) возвращают closure — capture model определена в `spec/05e-closures.md`. Complex types (Node, LinkedList) захватываются по reference (pointer).

---

## 1. Зафиксированные решения

### Q4: Где живут интерфейсы Iterable и Iterator

**Решение: Built-in (compiler-known).**

Интерфейсы `Iterable<T>`, `Iterator<T>`, `IteratorResult<T>` встроены в компилятор — аналог `Array<T>`, `Record<K,V>` в TypeScript.

- Пользователю **не нужно ничего импортировать**
- Как только компилятор видит `class MyClass implements Iterable<int>`, он автоматически сопоставляет это со своей внутренней декларацией
- Текст интерфейсов неявно вшит в глобальную область видимости (pre-defined)

### Q5: IteratorResult\<T\> — struct или type alias

**Решение: Анонимный тип (type alias), генерируемый компилятором «на лету» (Monomorphized Struct).**

`IteratorResult<T>` завязан на дженерик T — в runtime.h его жестко прописать нельзя.

На уровне TSClang:
```typescript
type IteratorResult<T> = { value: T; done: boolean };
```

На уровне C-вывода — мономорфизация (P2: borrow pointer для complex types):
```c
// Iterable<i32> (примитив):
typedef struct { bool has_value; int32_t value; } opt_i32;

// Iterable<User> (class — pointer):
typedef struct { bool has_value; User *value; } opt_User;

// Iterable<String> (ARC Copy — value):
typedef struct { bool has_value; String value; } opt_String;
```

Генерацией занимается компилятор в процессе мономорфизации дженериков (emit-helpers.js).

### Q6: Кто владеет итератором и как работает очистка

**Решение: Итератор живёт на C-стеке (Value type), очистка через RAII (Scope Drop).**

Развёртка `for..of` в C неявно создаёт scope-переменную для итератора:
```c
{
    LinkedListIterator it = LinkedList_iterator_impl(list_instance);

    while (1) {
        IteratorResult_int res = LinkedListIterator_next_impl(&it);
        if (res.done) break;
        int item = res.value;
        // ... тело цикла ...
    }

    // ВЫХОД ИЗ СКОУПА: auto-drop если у класса есть поля, требующие очистки
    _ts_drop_LinkedListIterator(&it);
}
```

Если в TSClang заложен механизм RAII / Auto-drop для локальных переменных при выходе из блока `{}` — итератор подчиняется общему правилу. Он — обычная локальная переменная C-функции.

### Q7: Async iteration (AsyncIterator\<T\> и for await...of)

**Решение: Проектируем концептуально, реализуем во вторую очередь.**

Концепт:
- Интерфейс `AsyncIterator<T>` возвращает `Promise<IteratorResult<T>>`
- `for await` разворачивается не в `while(1)`, а в шаги state machine, которые делают yield при каждом `await iterator.next()`
- Async цикл = конечный автомат внутри другого конечного автомата — высокая сложность, откладываем

### Q8: Синтаксис [Symbol.iterator] в парсере

**Решение: Вариант A — Symbol.iterator как специальный токен/идентификатор.**

Полная поддержка динамических вычисляемых имен свойств (`[{getFieldName()}]: value`) не нужна — в системном языке имена полей структур должны быть известны в compile-time.

Реализация:
1. Парсер видит `[Symbol.iterator]` — это не выражение в квадратных скобках, а единый встроенный литерал (hardcoded token)
2. В AST метод регистрируется со специальным флагом `isIterator: true` или с фиксированным внутренним именем `__ts_iterator`
3. При проверке `implements Iterable<T>` компилятор ищет этот метод
4. Для пользователя — 100% честный TypeScript; для компилятора — быстрый dispatch без усложнения грамматики

> Пользователь может написать метод итератора двумя способами: `[Symbol.iterator]()` (TS-стандарт) или `iter()` (короткая форма). Парсер распознаёт оба и маппит в `iter` + `isIterator: true`. В примерах ниже используется `iter()`.

---

## 2. Базовое правило: const / let = как везде в языке

**Никаких специальных правил для for-of.** `const` и `let` означают то же самое, что и в любом другом месте TSClang:

- `const item` — нельзя менять `item`
- `let item` — можно менять `item`

Что происходит при мутации — определяется **типом элемента**, не циклом:

| Тип | `item` в C | Мутация влияет на массив? |
|-----|-----------|--------------------------|
| Primitive | Copy (копия на стеке) | Нет — это копия |
| String | ARC Copy (копия struct) | Нет — это копия |
| Class | Borrow (`const T*` или `T*`) | **Да** — pointer в массив |
| Array\<U\> | Borrow (`const T*` или `T*`) | **Да** — pointer в массив |

### const vs let для классов — честнее чем TypeScript

В TypeScript `const item` для объектов позволяет мутировать поля (`item.age = 99` ✅). `const` запрещает только reassignment, не мутацию. Это ловушка.

В TSClang `const item` = `const T*` — **полная** защита:

```typescript
// TypeScript — const не защищает от мутации
for (const item of users) {
    item.age = 99;     // ✅ OK в TS — меняет элемент массива!
}

// TSClang — const честный
for (const item of users) {
    item.age = 99;     // ❌ compile error: const pointer, field mutation forbidden
}
```

**Обоснование (П3 — better than TS):** `const` означает «не менять» — и это правило соблюдается честно, без исключений.

### const source + let binding — зависит от типа

Не специальное правило for-of — следствие общей модели владения:

**Copy-типы (примитивы, String):** ✅ разрешено. `let item` = локальная копия, источник не затронут.
```typescript
const scores = [10, 20, 30];
for (let item of scores) {
    item = item * 2;     // ✅ локальная копия, arr не затронут
    console.log(item);   // 20, 40, 60
}
console.log(scores[0]);  // 10 — массив не изменился
```

**Complex-типы (class, Array\<U\>):** ❌ ошибка. `let item` = `Mut<T>` pointer, мутация через pointer меняет const источник.
```typescript
const users = [user1, user2];
for (let item of users) {    // ❌ error: cannot obtain Mut<T> from const source
    item.age = 99;           //    hint: use 'const item' or change source to 'let'
}
```

| Тип элемента | `const arr` + `let item` | Причина |
|-------------|------------------------|---------|
| Primitive | ✅ Разрешено | Copy, источник не затронут |
| String | ✅ Разрешено | ARC Copy, источник не затронут |
| Class | ❌ Ошибка | Mut\<T\> из const запрещён |
| Array\<U\> | ❌ Ошибка | Mut\<T\> из const запрещён |

### for-of на raw objects/structs = запрещён

```typescript
const obj = { x: 1, y: 2 };
for (const k of obj) { ... }    // ❌ error: object is not iterable
```

Использовать `Object.keys()`, `Object.values()`, `Object.entries()`:
```typescript
for (const k of Object.keys(obj)) { ... }         // ✅
for (const [k, v] of Object.entries(obj)) { ... } // ✅
```

**Обоснование**: согласуется с TypeScript; системный язык не может итерировать произвольный struct по полям без детерминированного порядка.

---

## 3. Классификация типов для for-of

Из `spec/05b-ownership.md`:

| Категория | Типы | arr[i] семантика |
|-----------|------|-------------------|
| **Primitive** | `i8..i64, u8..u64, f32, f64, bool, usize, isize` | Copy (побитовая) |
| **String** | `string` | ARC Copy (retain + release) |
| **Class** | `User`, любой `class` | **Только Borrow** (`Ref<T>`) — move по индексу запрещён (E009) |
| **Array\<U\>** | `i32[]`, `User[]` | **Только Borrow** (`Ref<T[]>`) — move по индексу запрещён |

---

## 4. Fast Path — Array\<T\>, Set\<T\>, Map\<K,V\>

Текущий код: `control-flow.js:675-679` — всегда struct copy (баг для complex types).

### 4.1 Примитивы в Array\<T\> — Copy (РЕШЕНО)

Примитивы: `i8..i64, u8..u64, f32, f64, bool, usize, isize`, `enum`.

Семантика: **Copy** — копирование значения. Поведение копии строго зависит от `const` / `let`.

**`const item` — только чтение:**
```typescript
const temperatures: int[] = [21, 23, 25, 20];
for (const temp of temperatures) {
    const fahrenheit = (temp * 9) / 5 + 32;
    // temp = 30; // ОШИБКА: Cannot assign to 'temp' because it is a constant
}
```
```c
int32_t temperatures[] = {21, 23, 25, 20};
uint32_t len = 4;
for (uint32_t i = 0; i < len; i++) {
    const int32_t temp = temperatures[i];
    int32_t fahrenheit = (temp * 9) / 5 + 32;
}
```

**`let item` — локальная мутация:**
```typescript
const scores: int[] = [10, 20, 30];
for (let score of scores) {
    score = score * 2;     // Разрешено — let
    console.log(score);    // 20, 40, 60
}
console.log(scores[0]);    // 10 — исходный массив НЕ изменился
```
```c
int32_t scores[] = {10, 20, 30};
uint32_t len = 3;
for (uint32_t i = 0; i < len; i++) {
    int32_t score = scores[i];    // локальная копия
    score = score * 2;            // меняется только копия
    _ts_log_int(score);
}
// scores[0] гарантированно остался равен 10
```

**Для мутации примитивов прямо в массиве** — классический `for`:
```typescript
for (let i = 0; i < arr.length; i++) {
    arr[i] = arr[i] * 2;  // мутация массива
}
```

Итого для примитивов:

| Binding | Семантика | C-вывод | Мутация item |
|---------|-----------|---------|-------------|
| `const item` | Copy → local const | `const T item = arr.data[i]` | Запрещена (compile error) |
| `let item` | Copy → local mutable | `T item = arr.data[i]` | Разрешена, локальна, массив не затронут |

### 4.2 String (итерация по байтам) — Copy (РЕШЕНО, следует из 4.1)

Байт строки = u8 (примитив). String immutable. Copy — единственный правильный вариант.

| `const ch` | `let ch` |
|-----------|---------|
| `const char ch = str.data[i]` — Copy | `char ch = str.data[i]` — Copy, mutable local |

### 4.3 String как элемент массива (Array\<string\>) — ARC Copy (РЕШЕНО)

String — immutable + ARC. `arr[i]` для строк = ARC Copy (spec/05b-ownership.md:630-634).

**`const name` — только чтение:**
```typescript
const names: string[] = ["Alice", "Bob"];
for (const name of names) {
    console.log(name);       // ✅ чтение — ок
    // name += "!";          // ❌ compile error: cannot assign to const
}
console.log(names[0]);       // "Alice" — массив не изменился
```
```c
// Desktop:
for (size_t i = 0; i < names.length; i++) {
    tsc_string_retain(names.data[i]);
    const String name = names.data[i];
    // ... тело ...
    tsc_string_release(name);  // cleanup
}
// Embedded: retain/release = no-ops, просто struct copy (16 байт)
```

**`let name` — локальная мутация:**
```typescript
const names: string[] = ["Alice", "Bob"];
for (let name of names) {
    name += "!";              // ✅ создаёт новую строку в name, старая release
    console.log(name);        // "Alice!", "Bob!"
}
console.log(names[0]);        // "Alice" — массив не изменился
```
```c
for (size_t i = 0; i < names.length; i++) {
    tsc_string_retain(names.data[i]);
    String name = names.data[i];                           // ARC copy
    String _tmp = tsc_string_concat(name, STR_LIT("!"));   // новая строка
    tsc_string_release(name);                               // release старой
    name = _tmp;
    _ts_log_string(name);
    tsc_string_release(name);                               // cleanup
}
```

| Binding | Семантика | C-вывод | Мутация name |
|---------|-----------|---------|-------------|
| `const name` | ARC Copy → local const | `const String name = arr.data[i]` + retain/release | Запрещена (compile error) |
| `let name` | ARC Copy → local mutable | `String name = arr.data[i]` + retain/release | Разрешена (`+=`), локальна, массив не затронут |

### 4.4 Классы как элементы массива (Array\<User\>) — Borrow (РЕШЕНО)

Классы — move semantics, но `arr[i]` = только borrow (Ref\<T\>, E009 при move по индексу).
В for-of `item` = pointer на элемент массива.

**`const item` — immutable borrow (`const T*`):**
```typescript
let users: User[] = [new User("Alice", 30), new User("Bob", 25)];

for (const item of users) {
    console.log(item.name);      // ✅ чтение — ок
    // item.age = 99;            // ❌ compile error: const pointer, field mutation forbidden
    // item = new User("", 0);   // ❌ compile error: cannot assign to const
}
console.log(users[0].age);       // 30 — массив не изменился
```
```c
for (size_t i = 0; i < users.length; i++) {
    const User *item = &users.data[i];    // const pointer — immutable borrow
    _ts_log_string(item->name);           // ✅ чтение ок
    // item->age = 99;                    // C compile error: const pointer
}
```

**`let item` — mutable borrow (`T*`), мутация полей меняет массив:**
```typescript
for (let item of users) {
    item.age = 99;               // ✅ мутирует users.data[i].age напрямую!
    console.log(item.age);       // 99, 99
    // item = new User("", 0);   // ✅ переприсваивает pointer, элемент массива НЕ затронут
}
console.log(users[0].age);       // 99 — массив ИЗМЕНИЛСЯ через pointer
console.log(users[1].age);       // 99 — этот тоже
```
```c
for (size_t i = 0; i < users.length; i++) {
    User *item = &users.data[i];          // mutable pointer
    item->age = 99;                        // мутирует элемент массива!
    _ts_log_int(item->age);
}
// users.data[0].age == 99, users.data[1].age == 99
```

**Для замены элемента целиком** — классический `for`:
```typescript
for (let i = 0; i < users.length; i++) {
    users[i] = new User("New", 0);  // move в массив
}
```

| Binding | Семантика | C-вывод | Мутация полей |
|---------|-----------|---------|--------------|
| `const item` | Borrow → `const T*` | `const User *item = &arr.data[i]` | Запрещена (compile error) |
| `let item` | Borrow → `T*` | `User *item = &arr.data[i]` | Разрешена, **меняет массив** |

### 4.5 Вложенные массивы (Array\<Array\<U\>\>) — Borrow (РЕШЕНО)

Как классы — `arr[i]` = только borrow. `item` = pointer на вложенный массив.

**`const group` — immutable borrow:**
```typescript
let groups: i32[][] = [[1, 2], [3, 4, 5]];

for (const group of groups) {
    console.log(group.length);    // ✅ чтение — ок
    // group.push(99);            // ❌ compile error: const pointer
}
```
```c
for (size_t i = 0; i < groups.length; i++) {
    const Array_i32 *group = &groups.data[i];   // const pointer
    _ts_log_int(group->length);
}
```

**`let group` — mutable borrow, push/pop меняет подмассив:**
```typescript
for (let group of groups) {
    group.push(99);               // ✅ мутирует groups.data[i] напрямую!
}
console.log(groups[0]);           // [1, 2, 99] — массив ИЗМЕНИЛСЯ
```
```c
for (size_t i = 0; i < groups.length; i++) {
    Array_i32 *group = &groups.data[i];          // mutable pointer
    tsc_array_push_i32(group, 99);                // мутирует подмассив в groups
}
```

| Binding | Семантика | C-вывод | Мутация (push/pop) |
|---------|-----------|---------|-------------------|
| `const group` | Borrow → `const T*` | `const Array_i32 *group = &arr.data[i]` | Запрещена (compile error) |
| `let group` | Borrow → `T*` | `Array_i32 *group = &arr.data[i]` | Разрешена, **меняет подмассив** |

### 4.6 Set\<T\> (index loop over `_vals[i]`)

Те же правила, что и Array\<T\> — элемент копируется или заимствуется в зависимости от типа.

### 4.7 Map\<K,V\> (index loop over `_keys[i]` / `_vals[i]`)

Ключ и значение независимо — Copy для примитивов/String, Borrow для классов.

---

## 5. Protocol Path — Iterable\<T\> — Borrow Protocol (РЕШЕНО)

**Решение: P2 — Protocol Path = borrow pointer для complex types.**

Полная согласованность с Fast Path: `for..of` по массиву и `for..of` по кастомной коллекции работают идентично. Мутация `item.field = 42` всегда меняет данные внутри источника.

### 5.1 opt_T — раздельная мономорфизация

Компилятор генерирует `opt_T` по-разному в зависимости от типа элемента (три варианта):

```c
// Примитив (int, bool, char, f64):
typedef struct { bool has_value; int32_t value; } opt_i32;        // T value — Copy

// String (ARC copy):
typedef struct { bool has_value; String value; } opt_String;      // String value — ARC Copy

// Complex (class, nested array):
typedef struct { bool has_value; User *value; } opt_User;          // T *value — Borrow
```

Три категории: primitive (copy), String (ARC copy), complex (borrow pointer). Согласовано с таблицей в §5.4.

### 5.2 Пример: LinkedList\<User\>

```typescript
class LinkedList implements Iterable<User> {
    head: Node | null;
    iter() {
        let current = this.head;
        return () => {
            if (!current) return null;
            const val = current.value;
            current = current.next;
            return val;
        };
    }
}

let list = new LinkedList(...);

for (let item of list) {
    item.age = 99;           // мутирует узел списка!
    console.log(item.age);   // 99
}
// list.head.value.age == 99 — мутация видна
```

C-вывод (complex type):
```c
// Iterator struct
typedef struct { Node *current; } LinkedList_iter_t;

// next() возвращает POINTER на value внутри узла
static opt_User LinkedList_iter_next(LinkedList_iter_t *_self) {
    if (!_self->current) return (opt_User){false};
    User *val = &_self->current->value;            // pointer в узел
    _self->current = _self->current->next;
    return (opt_User){true, val};                   // return pointer
}

// Desugared loop — RAII scope isolation
{
    LinkedList_iter_t iter = LinkedList_iter(&list);
    opt_User elem;
    while ((elem = LinkedList_iter_next(&iter)).has_value) {
        User *item = elem.value;    // pointer на узел списка
        item->age = 99;             // мутирует узел!
        _ts_log_int(item->age);
    }
    _ts_drop_LinkedListIterator(&iter);
}
```

C-вывод (примитив):
```c
// Для Iterable<i32> — value, не pointer
typedef struct { bool has_value; int32_t value; } opt_i32;

static opt_i32 Range_iter_next(Range_iter_t *_self) {
    if (_self->i >= _self->e) return (opt_i32){false};
    int32_t val = _self->i++;                      // Copy — примитив
    return (opt_i32){true, val};
}

// Desugared loop
{
    Range_iter_t iter = Range_iter(&range);
    opt_i32 elem;
    while ((elem = Range_iter_next(&iter)).has_value) {
        int32_t item = elem.value;    // копия
        _ts_log_int(item);
    }
}
```

### 5.3 Защита от dangling pointer

Два механизма обеспечивают безопасность P2:

**1. Контейнер заморожен (A.3):** на время итерации структура контейнера неизменна. Pointer, выданный `next()`, гарантированно валиден в рамках тела цикла.

**2. Borrow checker:** `item` = `User*` (borrow). Присвоить в `User` (owned) без `.clone()` — ошибка типов. Это не новое правило — это уже существующая модель владения.

```typescript
let globalUser: User;
for (let item of myLinkedList) {
    globalUser = item;        // ❌ borrow checker: cannot assign borrow to owned without .clone()
    globalUser = item.clone(); // ✅ явное клонирование
}
```

### 5.4 Сводка Protocol Path

| Тип элемента | opt_T.value | `const item` | `let item` | Мутация полей влияет на источник? |
|-------------|------------|-------------|-----------|----------------------------------|
| Primitive | `T value` | `const T item = elem.value` | `T item = elem.value` | Нет (копия) |
| String | `String value` | `const String item = elem.value` | `String item = elem.value` | Нет (ARC copy) |
| Class | `T *value` | `const T *item = elem.value` | `T *item = elem.value` | **Да** (pointer) |
| Array\<U\> | `T *value` | `const T *item = elem.value` | `T *item = elem.value` | **Да** (pointer) |

---

## 6. Открытые вопросы

### A.1: String в for-of — copy или pointer?

**Решение: Copy.** Байт строки = u8 (примитив). Copy — единственный правильный вариант. Следует из решения 4.1 (примитивы = Copy).

**Статус: ✅ Решено.**

### A.2: Вложенные массивы — pointer?

**Решение: Borrow pointer.** `Array<U>` — complex type, `arr[i]` = только borrow. `item` = `const Array_U*` (const) или `Array_U*` (let). Мутация через `let item` меняет подмассив.

**Статус: ✅ Решено.** (секция 4.5)

### A.3: Мутация источника во время итерации — Borrow Check (РЕШЕНО)

**Решение: Borrow check — источник заимствован на время итерации.**

Любая мутация источника (`arr.push()`, `arr.pop()`, `arr.remove()`, `arr[i] = x`) внутри `for..of arr` = compile error. Модель Rust.

```typescript
let arr: User[] = [user1, user2];

for (let item of arr) {
    item.field = 42;    // ✅ мутация через СУЩЕСТВУЮЩИЙ mutable borrow (item)
    arr.push(user3);    // ❌ error: cannot mutate 'arr' — already borrowed during iteration
    arr[0] = user3;     // ❌ error: cannot mutate 'arr' — already borrowed during iteration
}

for (const item of arr) {
    item.field = 42;    // ❌ const pointer — field mutation forbidden
    arr.push(user3);    // ❌ error: cannot mutate 'arr' — already borrowed during iteration
}
```

**Обоснование:**
- `const item` → immutable borrow источника → нельзя менять ничего
- `let item` → mutable borrow источника → можно мутировать через `item`, но нельзя взять другой borrow на источник
- П3 (безопасность): мутация источника в for-of = баг в 99% случаев
- Применимо к Fast Path (Array, Set, Map, String). Для Protocol Path (user-defined Iterable) — на совести автора итератора

**Статус: ✅ Решено.**

---

## 7. Embedded: Escape-анализ для динамических строк

На embedded (target `avr` и др.) String struct = 16 байт (`data`, `length`, `capacity`), без `_refcount`. Динамические строки (конкатенация, format) аллоцируются в ring buffer (`_tsc_str_pool`, 256 байт по умолчанию). Ring buffer — «создал → сразу использовал → забыл». Но если указатель на ring buffer переживает scope — данные перезапишутся.

### Проблема

```typescript
String global_device_status;

function process_event(event_name: string) {
    // Ring buffer allocation — данные могут быть перезаписаны
    global_device_status = event_name + ": OK";  // ❌ dangling pointer!
}
```

### Решение: Compile-time escape-анализ + static buffer

Компилятор отслеживает, какие выражения порождают ring buffer строки (`concat`, `format`, `toString`), и обнаруживает когда результат «убегает» из текущего scope:

**Escape = присваивание в:**
- Глобальную переменную
- Поле глобальной структуры / класса
- Элемент глобального массива (`global_array[i] = str`)
- Return из функции (если результат переживает caller)

**При обнаружении escape** компилятор генерирует копирование в static buffer:

```typescript
// TSClang
global_device_status = event_name + ": OK";
```

```c
// Generated C (embedded)
static char _sbuf_0[64];  // размер = stringBufferSize (дефолт 64) или оценка компилятора
String _tmp = tsc_string_concat(event_name, STR_LIT(": OK"));
size_t _copy_len = _tmp.length > 63 ? 63 : _tmp.length;
memcpy(_sbuf_0, _tmp.data, _copy_len);
_sbuf_0[_copy_len] = '\0';
global_device_status = (String){ .data = _sbuf_0, .length = _copy_len, .capacity = 0 };
```

### Управление размером буфера

Компилятор **оценивает верхнюю границу** где возможно:
- `literal + literal` → точный размер
- `dynamic + literal` → fallback к дефолту
- `dynamic + dynamic` → fallback к дефолту

Дефолт настраивается в `tsc.package.json`:

```json
{
  "builds": {
    "avr": {
      "target": "avr",
      "stringBufferSize": 64
    }
  }
}
```

| Уровень приоритета | Источник | Значение |
|--------------------|----------|----------|
| 1 (высший) | Оценка компилятора | Точный размер для literal + literal |
| 2 | `"stringBufferSize"` в build config | Дефолт 64 |
| 3 (базовый) | Hardcoded default | 64 |

### Нюансы

1. **Buffer overflow protection**: всегда `min(tmp.length, bufSize - 1)` — safe truncation, не UB
2. **Один static buffer на escape-точку**: `_sbuf_0`, `_sbuf_1`, ... — каждый привязан к конкретному присваиванию, не к переменной. Множественные записи в одну глобальную переменную из разных мест → разные буферы
3. **Косвенный escape через функцию**: компилятор помечает функцию как `_escapes: true` если параметр записывается в нелокальную переменную. На call site генерируется static buffer
4. **Цепочки конкатенаций**: `a + b + c` → три ring buffer аллокации, static buffer только для финального результата
5. **На desktop — не применяется**: ARC справляется, escape-анализ не нужен, C-вывод не меняется

---

## 7.1. Embedded: graphemes() и codePoints() — не работают

`runtime.h:2857-2867` — две проблемы на embedded (target `avr`):

**Проблема 1: `malloc` вместо ring buffer**

```c
static inline bool tsc_graphemes_next(TscGraphemeIter *it, String *out) {
    // ...
    char *buf = (char *)malloc(len + 1);    // ← malloc на embedded!
    memcpy(buf, start, len);
    *out = _tsc_str_make(buf, len, len + 1);
}
```

На embedded нет heap (или крайне ограничен). Должно быть `_tsc_str_alloc` (ring buffer).

**Проблема 2: PROGMEM на AVR**

Оба метода (`tsc_codepoints_next`, `tsc_graphemes_next`) читают `*it->_p` напрямую. На AVR строки с `capacity == 0` лежат в PROGMEM (flash) — прямой доступ даёт мусор. Нужен `pgm_read_byte`.

**Что не работает на embedded:**

| Метод | Проблема | Статус |
|-------|----------|--------|
| `.graphemes()` | `malloc` + PROGMEM | ❌ Не работает |
| `.codePoints()` | PROGMEM (прямой byte read) | ❌ Не работает на AVR |
| `for (const ch of str)` (байты) | Использует `TSC_STRING_GET_CHAR` — PROGMEM-aware | ✅ Работает |

**Исправление:** `#ifdef TSC_EMBEDDED` обёртки:
- `tsc_codepoints_next` → PROGMEM-aware byte read через `pgm_read_byte` для `capacity == 0`
- `tsc_graphemes_next` → `_tsc_str_alloc` вместо `malloc` + PROGMEM-aware memcpy

---

## 8. Баги impl, подлежащие исправлению

После принятия всех решений:

| Файл | Строка | Баг | Исправление |
|------|--------|-----|-------------|
| `control-flow.js` | 675-679 | Struct copy для всех типов | Pointer для complex types (class, nested array) в Fast Path |
| `control-flow.js` | 385 | `qual` = `'const '` или `''` — нет `' '` для let | Аккуратная генерация const/mut pointer для complex types |
| `match.js` | 346 | Range `<=` (inclusive end) | `<` (exclusive end) |

---

## 9. План реализации

**Step 1: For-of Fast Path fix**
1. `control-flow.js`: struct copy → pointer для complex types (class, nested array) в Fast Path
2. `control-flow.js:385`: переписать qual логику — для complex types генерировать `const T*` / `T*`
3. `match.js:346`: range `<=` → `<`
4. Тесты: pointer-семантика для классов и вложенных массивов

**Step 2: Borrow check для итерации**
1. Помечать iterable символ как `_borrowed: true` при входе в for-of
2. При генерации push/pop/remove/index assign — проверять `_borrowed` → compile error
3. Снимать `_borrowed` при выходе из цикла
4. Тесты: mutate-source-push-error, mutate-source-index-assign-error

**Step 3: Protocol Path P2**
1. `emit-helpers.js`: генерация `opt_T` — primitive → `T value` (copy), String → `String value` (ARC copy + retain), complex → `T *value` (borrow pointer)
2. `emit-helpers.js`: `next()` body — для complex types pointer на value
3. `control-flow.js`: Protocol Path desugaring — complex types `T *item = elem.value`
4. Тесты: iterable/linked-list-class (complex type, P2 pointer)

**Step 4: Embedded fixes + [Symbol.iterator]**
1. `runtime.h`: PROGMEM-aware codepoints/graphemes + `_tsc_str_alloc` вместо malloc
2. `parser.js`: `[Symbol.iterator]` special token → `isIterator: true`
3. `class.js`: поиск метода с `isIterator: true` при `implements Iterable<T>`
4. Тесты: phase12 string/graphemes, phase12 string/codepoints
