# Массивы — динамические T[] и фиксированные T[N]

[← Вверх](./index.md) | [Следующий →](./map-set.md) | [Предыдущий ←](./null.md)

---

Два вида массивов: динамические (`T[]`, heap) и фиксированные (`T[N]`, стек). Максимальное покрытие JS/TS API с учётом ownership-модели.

| Синтаксис | Тип | Память | Мутабельный размер |
|-----------|-----|--------|--------------------|
| `[1, 2, 3]` / `T[]` | динамический | heap | да (push, pop, resize) |
| `T[3]` | фиксированный | стек | нет |

---

## Динамические массивы

### Создание

```typescript
let a = [1, 2, 3];                // литерал, heap
let b: i32[] = [];                // пустой динамический
let d: i32[] = new Array(100);    // capacity=100, length=0
let e = new Array<i32>(100);      // то же, без аннотации типа
```

**Важно:** аргумент `new Array(N)` — это **capacity**, не length (расхождение с JS). В TSClang нет `undefined`, поэтому заполнять нечем. Элементы появляются через `push()` или `fill()`.

### C-output

```c
typedef struct {
    int32_t *data;
    size_t   length;
    size_t   capacity;
} Array_i32;

// Литерал
int32_t _lit_0[] = {1, 2, 3};
Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};

// new Array(100) — capacity=100, length=0
```

### length и capacity (readonly)

```typescript
let arr: i32[] = new Array(100);   // capacity=100, length=0
arr.push(1);
arr.push(2);                       // capacity=100, length=2

arr.length                         // 2 — количество элементов
arr.capacity                       // 100 — выделенная память

arr.length = 10;       // ошибка: use arr.resize(10) instead
arr.capacity = 200;    // ошибка: use arr.reallocate(200) instead
```

### Индексация

```typescript
arr[0]    // 1 — O(1)
arr[-1]   // 2 — последний элемент
arr[2]    // runtime error: index 2 out of bounds (length=2)
arr[-3]   // runtime error: index -3 out of bounds (length=2)
```

---

## Мутирующие методы

### push / pop / remove

```typescript
arr.push(item)     // move item в конец; бросает при OOM; возвращает Self
arr.pop()          // → T | null — owned последний элемент; null если пустой
arr.remove(i)      // → T — owned элемент по индексу; O(n) сдвиг
```

Ownership при `push` — move:

```typescript
let arr: User[] = [];
let user = new User();
arr.push(user);         // move — arr владеет user
// console.log(user);   // ошибка: user перемещён
```

`pop` — возвращает owned значение:

```typescript
let last = arr.pop();          // User | null
if (last != null) {
    last.doSomething();        // ok — last владеет объектом
}
arr.pop()?.doSomething();      // ?. — только если не null
const u = arr.pop() ?? fallback; // ?? — дефолт если null
```

### fill / resize / reallocate

```typescript
arr.fill(value)                    // заполнить все слоты 0..capacity, length = capacity; → Self
arr.fill(value, start, end)        // заполнить start..end-1 в пределах 0..length; → Self

arr.resize(n)                      // уменьшить length до n; n > length — ошибка; → Self
arr.resize(n, value)               // изменить length до n, новые слоты = value; → Self

arr.reallocate(n)                  // изменить capacity; n < length → length обрезается; → Self
```

Пример `fill`:

```typescript
let arr: i32[] = new Array(100);  // capacity=100, length=0
arr.fill(0);                       // capacity=100, length=100, все = 0
arr.fill(5, 0, 10);                // индексы 0..9 = 5, length=100
arr.fill(5, 90, 110);              // ошибка: end=110 > length=100
```

Пример `resize`:

```typescript
arr.resize(10);        // ok — уменьшить, value не нужен
arr.resize(50);        // ошибка: n > length, используй resize(n, value)
arr.resize(200, 0);    // ok — увеличить, новые слоты = 0, реаллоцирует если нужно
arr.resize(5, 0);      // ok — уменьшить, value игнорируется
```

### sort / reverse / shift / unshift / splice / join / set

```typescript
arr.sort()                              // по умолчанию (<); → Self
arr.sort((a, b) => a - b)              // с компаратором (Ref<T>, Ref<T>) => i32; → Self
arr.reverse()                           // разворот на месте; → Self
arr.shift()                             // → T | null — удалить и вернуть первый; O(n)
arr.unshift(item)                       // добавить в начало; O(n); → Self
arr.splice(start, deleteCount?, ...items)  // → T[] — удалённые элементы
arr.join(", ")                          // → string — объединить через разделитель
arr.set(src, offset?)                   // memcpy из src в arr начиная с offset
```

### Чейнинг мутирующих методов

```typescript
let arr: i32[] = new Array<i32>(100).resize(50, 0).fill(7, 0, 10);
```

---

## Фиксированные массивы T[N]

Размер известен на этапе компиляции, память на стеке.

```typescript
let c: i32[3] = [1, 2, 3];  // фиксированный, ровно 3 элемента
```

### C-output

```c
int32_t arr[3] = {10, 20, 30};
```

### Ограничения

- Литерал должен содержать **ровно N** элементов — иначе ошибка компилятора
- `push` / `pop` / `resize` / `reallocate` — ошибка компилятора
- Передаётся в функции как `Ref<T[]>` / `Mut<T[]>` — фиксированный является подтипом динамического:

```typescript
function sum(arr: Ref<i32[]>): i32 { ... }

let fixed: i32[3] = [1, 2, 3];
let dynamic: i32[] = [1, 2, 3, 4];

sum(fixed);    // ok — автоматически как Ref<i32[]>
sum(dynamic);  // ok
```

---

## Функциональные и поисковые методы

Callback получает `Ref<T>` — borrow элемента, не ownership. Элемент остаётся в массиве.

### Трансформации (возвращают новый массив)

```typescript
const nums: i32[] = [1, 2, 3, 4, 5];

nums.map(x => x * 2)                         // i32[] — [2, 4, 6, 8, 10]
nums.filter(x => x % 2 == 0)                 // i32[] — [2, 4]
nums.reduce((acc, x) => acc + x, 0)          // i32 — 15
nums.reduceRight((acc, x) => acc + x, 0)     // i32 — 15 (справа налево)
nums.slice(1, 3)                              // i32[] — [2, 3] (clone)
nums.concat([6, 7])                           // i32[] — [1, 2, 3, 4, 5, 6, 7]
nums.flat()                                   // T[][] → T[] (1 уровень)
nums.flatMap(x => [x, x * 2])                // map + flat
nums.toSorted()                               // новый отсортированный
nums.toReversed()                             // новый перевёрнутый
nums.toSpliced(1, 2, 10, 20)                 // новый с splice
nums.with(0, 99)                              // новый с заменённым элементом
nums.groupBy(x => x % 2 == 0 ? "even" : "odd") // Map<string, i32[]>
```

### Поиск

```typescript
nums.find(x => x > 3)             // Ref<i32> | null — borrow первого совпадения
nums.findIndex(x => x > 3)        // i32 — 3, -1 если не найден
nums.findLast(x => x > 3)         // Ref<i32> | null — borrow последнего
nums.findLastIndex(x => x > 3)    // i32 — 3, -1 если не найден
nums.some(x => x > 4)             // bool — true
nums.every(x => x > 0)            // bool — true
nums.includes(3)                   // bool — true
nums.indexOf(3)                    // i32 — 2, -1 если не найден
nums.lastIndexOf(3)                // i32 — 2, -1 если не найден
```

### Итерация

```typescript
arr.forEach(x => console.log(x))     // (Ref<T>) => void
arr.keys()                            // Iterator<usize> — индексы
arr.values()                          // Iterator<Ref<T>> — значения (borrow)
arr.entries()                         // Iterator<[usize, Ref<T>]> — пары
```

### Статические методы

```typescript
Array.from<T>(src: Iterable<T>): T[]   // создать из iterable
Array.of<T>(...items: T[]): T[]        // создать из аргументов
```

---

## Clone-требование

`filter`, `slice`, `concat`, `flat`, `flatMap`, `toSorted`, `toReversed`, `toSpliced`, `with`, `groupBy` — создают новый массив через **клонирование** элементов. Требуют `T: Clone`.

- Примитивы (`i32`, `f64`, `bool`, `u8`...) — auto-implement Clone
- `string` — Clone
- Классы — через явный метод `clone()`
- Если `T: Clone` не выполнено — ошибка компилятора

---

## find возвращает Ref\<T\> (borrow)

Результат `find` — borrow, привязанный к источнику. Нельзя использовать дольше источника и нельзя мутировать:

```typescript
// ✅ borrow — только читаем
const r: Ref<User> | null = users.find(u => u.id == targetId)
if (r != null) console.log(r.name)

// ✅ owned-операции — через findIndex + индекс
const i = users.findIndex(u => u.id == targetId)
if (i >= 0) users[i].activate()   // Mut<User> через индекс
```

### C-output

```c
typedef struct { bool has_value; int32_t *value; } opt_ref_i32;

opt_ref_i32 found = tsc_array_find_i32(arr, _lambda_0_bool);
printf("%d\n", found.has_value ? *found.value : -1);
```

---

## Slice\<T\> / MutSlice\<T\> — zero-copy view

`Slice<T>` — non-owning borrowed view на непрерывный участок массива или буфера. Создаётся через `.view()`, не копирует данные.

```typescript
let arr: i32[] = [1, 2, 3, 4, 5, 6, 7, 8];

const s: Slice<i32> = arr.view(2, 6)   // элементы 2..5, zero-copy
s[0]       // 3
s[1]       // 4
s.length   // 4

s.view(1, 3)   // под-слайс: элементы 3..4
```

Мутабельный слайс — `MutSlice<T>` (из `.viewMut()`):

```typescript
const ms: MutSlice<u8> = buf.viewMut(0, 4)
ms[0] = 0xFF   // запись в оригинальный буфер
```

`Slice<T>` совместим с `Ref<T[]>` для передачи в функции:

```typescript
function sum(data: Ref<i32[]>): i32 { ... }
sum(arr.view(0, 4))   // ✅ Slice<i32> совместим с Ref<i32[]>
```

### C-output

```c
typedef struct { const int32_t *ptr; size_t length; } Slice_i32;
typedef struct { int32_t *ptr; size_t length; } MutSlice_i32;

// .view(1, 4)
Slice_i32 s = (Slice_i32){ .ptr = arr.data + (1), .length = (size_t)(4) - (1) };
```

---

## Правило возврата методов

| Тип метода | Возвращает | Пример |
|------------|-----------|--------|
| Мутирующие без данных | `Self` (чейнинг) | `push`, `fill`, `resize`, `sort`, `reverse` |
| Возвращающие данные | `T \| null` или `T` | `pop` → `T \| null`, `remove` → `T` |
| Функциональные | Новый `U[]` | `map`, `filter`, `slice`, `concat` |
| Поисковые | `Ref<T> \| null` или `i32` | `find` → borrow, `indexOf` → индекс |

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `use arr.resize(10) instead` | Попытка присвоить `arr.length = n` |
| `use arr.reallocate(200) instead` | Попытка присвоить `arr.capacity = n` |
| `T does not implement Clone` | Вызов `filter`/`slice`/`concat` для non-Clone типа |
| `cannot move out of array by index` | `arr[i]` для owned-типа без `.remove()` |
| `fixed array literal must have exactly N elements` | Несовпадение размера литерала и типа |
| `index N out of bounds (length=M)` | Runtime error — выход за границы |

---

## См. также

- [Null (T | null)](./null.md) — `pop()`, `find()` возвращают `T | null`
- [Map и Set](./map-set.md) — хеш-таблицы и множества
- [Модель памяти — Slice\<T\>](../05-memory/ownership-types.md) — zero-copy view
- [Модель памяти — Owner](../05-memory/owner.md) — move из массива
- [Clone](../../spec/03-types.md) — интерфейс клонирования
