# 08 — Массивы: ownership и семантика присваивания

Массивы — **move semantics**, как классы. Присваивание передаёт ownership, оригинал обнуляется.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | Move + zero-out | `Array_i32 b = a; a = (Array_i32){0};` |
| `const b = a` | Move + zero-out | `const Array_i32 b = a; a = (Array_i32){0};` |
| `b = a` (reassign) | Move + zero-out | `b = a; a = (Array_i32){0};` |

После move `a` обнуляется, доступ к `a` — ошибка компиляции (`E002: use after move`).

### Передача в функцию

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `foo(a)` (param: `T[]`) | Move + zero-out после вызова | `foo(a); a = (Array_i32){0};` (через `_postStmtCleanups`) |

```typescript
function sum(arr: number[]): number { ... }
let data = [1, 2, 3];
sum(data);
console.log(data.length);  // ❌ E002: use after move
```

```c
double sum_Array_f64(Array_f64 arr) { ... }
Array_f64 data = ...;
sum_Array_f64(data);
memset(&data, 0, sizeof(Array_f64));  // zero-out после вызова
```

### Ref\<T\> / Mut\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<number[]> = a` | Immutable borrow всей коллекции | `const Array_f64 *b = &a;` + borrow tracking |
| `const b: Mut<number[]> = a` | Mutable borrow всей коллекции | `Array_f64 *b = &a;` + borrow tracking |

Borrow на коллекцию **блокирует мутацию** (`push`, `pop`, `remove`) пока borrow жив. Borrow отпускается при выходе из scope.

### Shared\<T\> / Weak\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Shared<i32[]> = a` | **Ошибка** — `a` не является `Shared<T>` | Нельзя создать Shared из owned |
| `const b: Weak<i32[]> = a` | **Ошибка** — `a` не является `Shared<T>` | Weak только из Shared |

### Borrow из массива

`arr[i]` для сложных типов — только borrow (`Ref<T>`), move по индексу запрещён:

```typescript
const u: Ref<User> = users[0];     // ✅ borrow
const u = users[0];                // ❌ E009: cannot move out of array by index
const u = users.remove(0);         // ✅ move + удаление из массива
```

`arr[i]` для примитивов — copy (возвращает значение, не borrow):

```typescript
const val = arr[0];  // ✅ copy (i32 — примитив)
```

`arr[i]` для строк — copy (возвращает String struct, implicit ARC):

```typescript
const s = arr[0];  // ✅ ARC Copy (string → String struct in C)
```

### Массивы строк

`Array<string>` — при уничтожении массива освобождается каждая строка через `tsc_array_free_string` (макрос, принимает `Array_string *`):

```c
// runtime macro (simplified):
#define tsc_array_free_string(arr) do { \
    Array_string *_a_ = (arr); \
    for (size_t _i_ = 0; _i_ < _a_->length; _i_++) \
        tsc_string_release(_a_->data[_i_]); \
    free(_a_->data); \
    _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; \
} while(0)
```

### Поведение внутри функций

**Обычные функции** — передача массива по значению = move всего массива:

```typescript
function process(arr: number[]): void { /* владеет arr */ }
function view(arr: Ref<number[]>): void { /* borrow */ }
```

```c
void process_Array_f64(Array_f64 arr) { /* arr перемещён, caller обнулён */ }
void view_Array_f64(const Array_f64 *arr) { /* borrow pointer */ }
```

**Замыкания с array capture** — implicit **reference** (pointer на source):

```typescript
let data: number[] = [1, 2, 3];
const fn = (): number => data.length;
```

```c
typedef struct { Array_f64 *data; } _closure_0_env;  // pointer — reference
```

Массив захватывается **по ссылке** (pointer). Source жив, mutations visible. См. [06-closures.md](../06-functions/06-closures.md).

### Spread массивов

Spread **копирует** элементы — source жив. Move semantics для spread не применяется. `let`/`const` на source не влияет — всегда copy.

**Массивы примитивов — copy (source жив):**

```typescript
const nums: number[] = [1, 2, 3];
const copy = [...nums, 4, 5];  // copy — примитивы копируются
console.log(nums.length);      // 3 — nums жив
```

Примитивы — copy by value. Spread не потребляет источник.

**Массивы сложных типов — copy + retain (source жив):**

```typescript
const admins: Admin[] = [admin1, admin2];
const users = [...admins, ...guests];  // copy + retain, admins жив
console.log(admins[0].name);           // ok
```

```c
// struct copy каждого элемента + retain string-полей
Admin _d0[] = {admins.data[0], admins.data[1], guests.data[0], ...};
tsc_string_retain(admins.data[0].name);
tsc_string_retain(admins.data[1].name);
Array_Admin users = {.data = _d0, .length = 4, .capacity = 4};
// admins untouched
```

**Массивы из `Shared<T[]>` — retain:**

```typescript
const base: Shared<Item[]> = [item1, item2];
const listA = [...base, itemA];  // ok — retain, base жив
const listB = [...base, itemB];  // ok — retain, base жив
```

**Массивы строк — ARC Copy при spread:**

```typescript
let names: string[] = ["Alice", "Bob"];
const copy = [...names, "Charlie"];
// Каждый элемент: tsc_string_retain → копия struct
// names жив, строки живы (refcount++)
console.log(names[0]);  // "Alice" — жив
```

### Деструктуризация массивов

Деструктуризация **копирует** элементы — source жив. Move semantics для деструктуризации не применяется.

**Полная деструктуризация — copy всех элементов:**

```typescript
let arr: number[] = [1, 2, 3];
const [a, b, c] = arr;  // copy трёх элементов
console.log(arr[0]);     // 1 — arr жив
```

**Rest в деструктуризации — copy первого + deep copy rest:**

```typescript
let arr = [10, 20, 30];
const [first, ...rest] = arr;  // copy first + deep copy rest
console.log(arr[0]);           // 10 — arr жив
```

```c
double first = arr.data[0];       // copy (примитив)
Array_f64 rest = tsc_array_slice_f64(arr, 1, (int32_t)arr.length);  // deep copy
// arr untouched
```

Rest-часть — **независимая копия** через `tsc_array_slice_*`: malloc + memcpy. Source остаётся живым, cleanup source и rest независимы. Для `Array<string>` — `tsc_array_slice_string` делает `tsc_string_retain` каждого элемента.

**Деструктуризация массива объектов — copy + retain:**

```typescript
let users = [user1, user2];
const [first, ...rest] = users;  // copy: struct copy + retain string-полей
console.log(users[0].name);      // ok — users жив
```

**Деструктуризация массива строк — ARC Copy:**

```typescript
let names = ["Alice", "Bob"];
const [first, ...rest] = names;
// first: tsc_string_retain → ARC Copy
// rest: каждый элемент retain → ARC Copy
// names жив, строки живы (refcount++)
console.log(names[0]);  // "Alice" — жив
```

### Array `capacity` — owning vs non-owning

`Array<T>` struct имеет три поля: `data`, `length`, `capacity`. Значение `capacity` определяет owning semantics:

| `capacity` | Семантика | Кто освобождает `data` |
|------------|-----------|----------------------|
| `> 0` | **Owning** — массив владеет `data` | `tsc_array_free_*` при cleanup |
| `= 0` | **Non-owning** — `data` указывает на чужую память | Никто — `tsc_array_free_*` пропускает |

**Источники `capacity = 0` (non-owning):**

1. **Array range expression** (`arr[1..3]`): `{.data = arr.data + 1, .length = 2, .capacity = 0}` — view в оригинальный массив
2. **Async array literals**: в async-функциях данные литерала размещаются как `static` (переживают poll-цикл), struct = `{.data = static_arr, .length = N, .capacity = 0}`

**`tsc_array_free_*` guard:**

```c
#define tsc_array_free_i32(arr) do { \
    Array_i32 *_a_ = (arr); \
    if (_a_->data && _a_->capacity > 0) free(_a_->data); \
    _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; \
} while(0)
```

Проверка `capacity > 0` гарантирует что non-owning arrays не вызовут `free` на чужую память.

**Мутация non-owning array = UB:** `push`, `pop`, `resize` на массиве с `capacity = 0` приведут к `realloc` на чужом указателе. Для мутации — используйте `.clone()` сначала.

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `Array<T>` | Heap, динамический рост через `realloc` | Фиксированный `T[capacity]` (статический или стековый) |
| `new Array<T>(100)` | `Array_i32 arr = tsc_array_create_i32(100);` (stack struct, heap data buffer) | `Array_i32 arr = {.data = buf, .capacity = 100, .length = 0};` |
| Move (zero-out) | `memset(&src, 0, sizeof(Array_i32))` | Аналогично |
| Ref/Mut borrow | Pointer (`const Array_i32*` / `Array_i32*`) | Pointer (идентично) |
| `arr.push(val)` | `realloc` при росте | Только если `length < capacity`, иначе ошибка |
| `tsc_array_free_string` | release каждого элемента | release = no-op (строки rodata) |
| Spread массива | Copy (retain для string-элементов), source жив | Copy (no-op retain для string-элементов), source жив |
| Деструктуризация массива | Copy элементов (retain для string), source жив | Copy элементов (no-op retain для string), source жив |
| Замыкания с array capture | Reference (pointer в env), source жив | Reference (pointer, идентично) |
| Деструктор | `free(arr.data)` + string cleanup | No-op или static reset |

**Ключевое отличие:** на embedded массивы — фиксированной ёмкости (`capacity` задана при создании, не растёт). `push` работает только если `length < capacity`. Нет `realloc`, нет heap. Деструктор — no-op (нечего освобождать).

### Почему так

Массивы — как классы: move semantics, zero-cost abstraction. Один владелец = один destructor call. Borrow (Ref/Mut) = pointer — блокирует мутацию пока жив. На embedded — фиксированная ёмкость, предсказуемое использование памяти.

### Срезы

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

Срез `arr[1..3]` создаёт Array struct с `capacity = 0` (non-owning view) — см. раздел «Array `capacity` — owning vs non-owning» выше.
