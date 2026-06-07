## Массивы и коллекции

### Массивы

| Синтаксис | Тип | Память |
|-----------|-----|--------|
| `[1, 2, 3]` | литерал, динамический | heap |
| `i32[]` | тип динамического массива | heap |
| `i32[3]` | фиксированный, ровно 3 элемента | стек |

```typescript
let a = [1, 2, 3];               // динамический, из литерала
let b: i32[] = [];               // пустой динамический
let c: i32[3] = [1, 2, 3];       // фиксированный, ровно 3 элемента
let d: i32[] = new Array(100);   // capacity=100, length=0 (тип из аннотации)
let e = new Array<i32>(100);     // то же самое, без аннотации
// ВАЖНО: аргумент new Array(N) — это capacity, не length (расхождение с JS)
// Почему: в JS new Array(3) создаёт массив с length=3, заполненный undefined.
// В TSClang нет undefined — значит заполнять нечем.
// new Array(N) — это просто аллокация памяти под N элементов, length=0.
// Элементы появляются только через push() или fill().
```

Фиксированный массив `T[N]`:
- Размер известен на этапе компиляции, память на стеке
- Литерал инициализации должен содержать ровно N элементов — иначе ошибка компилятора
- `push`/`pop` недоступны — ошибка компилятора
- Передаётся в функции как `Ref<T[]>` / `Mut<T[]>` — фиксированный является подтипом динамического:
  ```typescript
  function sum(arr: Ref<i32[]>): i32 { ... }  // принимает любой i32 массив

  let fixed: i32[3] = [1, 2, 3];
  let dynamic: i32[] = [1, 2, 3, 4];

  sum(fixed);    // ok — автоматически как Ref<i32[]>
  sum(dynamic);  // ok
  ```

**Правило возврата методов:**
- Методы возвращающие данные (`pop`, `remove`) — возвращают данные (`T | null`, `T`)
- Мутирующие методы не возвращающие данных (`push`, `fill`, `resize`, `reallocate`, `sort`, `reverse`) — возвращают `Self` для чейнинга

```typescript
// чейнинг мутирующих методов
let arr: i32[] = new Array<i32>(100).resize(50, 0).fill(7, 0, 10)

// чейнинг трансформирующих (возвращают новый массив)
const result = arr
    .filter(x => x > 0)
    .map(x => x * 2)
    .slice(0, 10)
```

Методы и свойства динамического массива:
- `arr.push(item)` — move item в конец массива; бросает при OOM; возвращает `Self`
  ```typescript
  let arr: User[] = [];
  let user = new User();
  arr.push(user);        // move — arr владеет user
  console.log(user);     // ошибка: user перемещён
  ```
- `arr.pop()` — удалить и вернуть последний элемент как owned `T | null`; null если массив пустой
  ```typescript
  let last = arr.pop();  // User | null
  if (last != null) {
      last.doSomething(); // ok — last владеет объектом
  }
  // или короче:
  arr.pop()?.doSomething();           // ?. — только если не null
  const u = arr.pop() ?? defaultUser; // ?? — дефолт если null
  ```
- `arr.remove(i)` — удалить по индексу с возвратом ownership (`T`)
- `arr.fill(value)` — заполнить все слоты 0..capacity, length становится равным capacity; возвращает `Self`
- `arr.fill(value, start, end)` — заполнить индексы `start..end-1` в пределах `0..length`, length не меняется; возвращает `Self`:
  - `end > length` — ошибка компилятора (константы) или runtime error (переменные)
  ```typescript
  let arr: i32[] = new Array(100); // capacity=100, length=0
  arr.fill(0);                      // capacity=100, length=100, все слоты = 0
  arr.fill(5, 0, 10);               // индексы 0..9 = 5, length остаётся 100
  arr.fill(5, 90, 110);             // ошибка: end=110 > length=100
  ```
- `arr.resize(n)` — уменьшить length до n; если n > length — ошибка компилятора (используй `resize(n, value)`); возвращает `Self`
- `arr.resize(n, value)` — изменить length до n, новые слоты заполняются `value`; при уменьшении `value` игнорируется; возвращает `Self`. Capacity: если `n > capacity` — реаллоцирует, новый `capacity >= n` (сколько именно — implementation detail); если `n <= capacity` — capacity не меняется
  ```typescript
  arr.resize(10);       // ok — уменьшить, value не нужен
  arr.resize(50);       // ошибка компилятора: n > length, используй resize(n, value)
  arr.resize(200, 0);   // ok — увеличить, новые слоты = 0, реаллоцирует если нужно
  arr.resize(5, 0);     // ok — уменьшить, value игнорируется
  ```
- `arr.reallocate(n)` — изменить capacity до n; если `n < length` — length обрезается до n; возвращает `Self`
  ```typescript
  let arr: i32[] = new Array(100); // capacity=100, length=0
  arr.fill(0);                      // capacity=100, length=100

  arr.reallocate(200);              // capacity=200, length=100
  arr.reallocate(50);               // capacity=50,  length=50 (обрезано)
  ```
  присвоение `arr.capacity = n` — ошибка компилятора с подсказкой: `use arr.reallocate(n) instead`
- `arr.length` — number, readonly, количество элементов (доступны индексы `0..length-1`);
  присвоение `arr.length = n` — ошибка компилятора с подсказкой: `use arr.resize(n) instead`
  ```typescript
  let arr: i32[] = new Array(100); // capacity=100, length=0
  arr.push(1);
  arr.push(2);                      // capacity=100, length=2

  arr[0];   // ok → 1
  arr[1];   // ok → 2
  arr[2];   // runtime error: index 2 out of bounds (length=2)
  arr[99];  // runtime error: index 99 out of bounds (length=2)
  arr[-1];  // ok → 2 (последний элемент)
  arr[-3];  // runtime error: index -3 out of bounds (length=2)

  arr.length = 10; // ошибка компилятора: use arr.resize(10) instead
  ```
- `arr.capacity` — number, readonly, заранее выделенная память;
  присвоение `arr.capacity = n` — ошибка компилятора с подсказкой: `use arr.reallocate(n) instead`
- `arr.sort(cmp?: (Ref<T>, Ref<T>) => number)` — сортировка на месте; без аргумента — по умолчанию (`<`); возвращает `Self`
- `arr.reverse()` — разворот на месте; возвращает `Self`
- `arr.shift()` — удалить и вернуть первый элемент как owned `T | null`; O(n) — сдвигает остальные элементы
- `arr.unshift(item)` — добавить элемент в начало; move semantics; O(n); возвращает `Self`
- `arr.splice(start: number, deleteCount?: number, ...items: T[])` — удалить `deleteCount` элементов начиная с `start`, вставить `items`; возвращает удалённые элементы как owned `T[]`; отрицательный `start` — от конца
  ```typescript
  let arr: i32[] = [1, 2, 3, 4, 5]
  const removed = arr.splice(1, 2, 10, 20)  // removed = [2, 3], arr = [1, 10, 20, 4, 5]
  arr.splice(0, 0, 0)                        // вставка без удаления: arr = [0, 1, 10, 20, 4, 5]
  ```
- `arr.join(sep?: string): string` — объединить элементы в строку через разделитель; **требует `T implements { toString(): string }`**; все примитивы и `string` удовлетворяют автоматически
  ```typescript
  [1, 2, 3].join(", ")   // "1, 2, 3"
  [1, 2, 3].join()       // "1,2,3" — дефолтный разделитель ","
  ```
- `arr.set(src: Ref<T[]>, offset?: number)` — скопировать элементы из `src` в `arr` начиная с `offset`; C-output: `memcpy`; bounds check в runtime
- `arr.forEach(f: (Ref<T>) => void)` — итерация без результата; callback получает `Ref<T>`
- `arr.keys(): Iterator<number>` — итератор индексов
- `arr.values(): Iterator<Ref<T>>` — итератор значений (borrow)
- `arr.entries(): Iterator<[number, Ref<T>]>` — итератор пар [index, value]

**Статические:**
- `Array.from<T>(src: Iterable<T>): T[]` — создать из iterable; клонирует элементы если `T: Clone`
- `Array.of<T>(...items: T[]): T[]` — создать из аргументов; сахар над литералом

### Функциональные и поисковые методы

Callback получает `Ref<T>` — borrow элемента, не ownership. Элемент остаётся в массиве.

- `arr.map<U>(f: (Ref<T>) => U): U[]` — новый массив `U[]` (owned); callback не владеет элементом
- `arr.filter(f: (Ref<T>) => boolean): T[]` — новый массив из **клонов** совпавших элементов; **требует `T: Clone`**
- `arr.reduce<U>(f: (U, Ref<T>) => U, init: U): U` — аккумулятор `U` owned; callback получает `Ref<T>`
- `arr.find(f: (Ref<T>) => boolean): Ref<T> | null` — borrow первого совпадения; время жизни привязано к источнику
- `arr.findIndex(f: (Ref<T>) => boolean): number` — индекс первого совпадения, `-1` если не найден
- `arr.findLast(f: (Ref<T>) => boolean): Ref<T> | null` — borrow последнего совпадения; симметрично `find`
- `arr.findLastIndex(f: (Ref<T>) => boolean): number` — индекс последнего совпадения, `-1` если не найден
- `arr.some(f: (Ref<T>) => boolean): boolean` — `true` если хотя бы один элемент проходит фильтр
- `arr.every(f: (Ref<T>) => boolean): boolean` — `true` если все элементы проходят фильтр
- `arr.includes(item: Ref<T>): boolean` — поиск по значению через `==`
- `arr.indexOf(item: Ref<T>): number` — индекс первого вхождения, `-1` если не найден
- `arr.lastIndexOf(item: Ref<T>): number` — индекс последнего вхождения, `-1` если не найден
- `arr.slice(start?: number, end?: number): T[]` — новый массив из **клонов** элементов `start..end-1`; **требует `T: Clone`**; отрицательные индексы от конца; без аргументов — клон всего массива
- `arr.concat(other: Ref<T[]>): T[]` — новый массив = клон `arr` + клон `other`; **требует `T: Clone`**
- `arr.flat(): U[]` — разгладить вложенность на 1 уровень: `T[][]` → `T[]`; **требует `T: Clone`**; на embedded запрещён (heap)
- `arr.flatMap<U>(f: (Ref<T>) => U[]): U[]` — map + flat(1); эквивалент `arr.map(f).flat()`; на embedded запрещён
- `arr.toSorted(cmp?: (Ref<T>, Ref<T>) => number): T[]` — новый отсортированный массив; оригинал не меняется; **требует `T: Clone`**
- `arr.toReversed(): T[]` — новый перевёрнутый массив; оригинал не меняется; **требует `T: Clone`**
- `arr.toSpliced(start: number, deleteCount?: number, ...items: T[]): T[]` — новый массив с применённым splice; оригинал не меняется; **требует `T: Clone`**
- `arr.with(index: number, value: T): T[]` — новый массив с заменённым элементом по индексу; оригинал не меняется; **требует `T: Clone`**
- `arr.reduceRight<U>(f: (U, Ref<T>) => U, init: U): U` — то же, но справа налево

```typescript
const nums: i32[] = [1, 2, 3, 4, 5]

const doubled = nums.map(x => x * 2)               // i32[] — [2, 4, 6, 8, 10]
const evens   = nums.filter(x => x % 2 == 0)       // i32[] — [2, 4]
const sum     = nums.reduce((acc, x) => acc + x, 0) // i32 — 15
const found   = nums.find(x => x > 3)              // Ref<i32> | null
const idx     = nums.findIndex(x => x > 3)         // number — 3
const hasBig  = nums.some(x => x > 4)              // boolean — true
const allPos  = nums.every(x => x > 0)             // boolean — true
const has3    = nums.includes(3)                    // boolean — true
const pos     = nums.indexOf(3)                     // number — 2
const part    = nums.slice(1, 3)                   // i32[] — [2, 3] (clone)
const joined  = nums.concat([6, 7])                // i32[] — [1, 2, 3, 4, 5, 6, 7]
```

**Clone-требование:** примитивы (`i32`, `f64`, `boolean`, `u8` и т.д.) клонируются автоматически. Строки — Clone. Классы — через явный метод `clone()`. Если `T: Clone` не выполнено — ошибка компилятора при вызове `filter` / `slice` / `concat`.

**`find` возвращает borrow** — результат нельзя использовать дольше источника и нельзя мутировать:

```typescript
// ✅ borrow — только читаем
const r: Ref<User> | null = users.find(u => u.id == targetId)
if (r != null) console.log(r.name)

// ✅ owned-операции — через findIndex + доступ по индексу
const i = users.findIndex(u => u.id == targetId)
if (i >= 0) users[i].activate()   // Mut<User> через индекс
```

**Чейнинг:** `map` и `filter` возвращают новый массив, поэтому чейн `.filter(...).map(...)` создаёт промежуточный массив. Это ожидаемое поведение — нет lazy evaluation.

### Slice<T> — zero-copy view

`Slice<T>` — non-owning borrowed view в непрерывный участок массива или буфера. Создаётся через `.view()`. В отличие от `.slice()` (копирует), `.view()` не копирует данные.

```typescript
let arr: i32[] = [1, 2, 3, 4, 5, 6, 7, 8]

const s: Slice<i32> = arr.view(2, 6)   // элементы 2..5, zero-copy
s[0]       // 3
s[1]       // 4
s.length   // number — 4

s.view(1, 3)   // под-слайс: элементы 3..4
```

`Slice<T>` — borrow: borrow checker проверяет что источник не dropped пока слайс жив. Передаётся в функции как `Ref<T[]>`:

```typescript
function sum(data: Ref<i32[]>): i32 { ... }

sum(arr.view(0, 4))   // ✅ Slice<i32> совместим с Ref<i32[]>
sum(arr)              // ✅ тоже ok
```

Методы: `view(start?, end?)` — под-слайс; `[i]` — элемент; `.length` — длина. Мутабельный слайс — `MutSlice<T>` (из `.viewMut()`):

```typescript
const ms: MutSlice<u8> = buf.viewMut(0, 4)
ms[0] = 0xFF   // запись в оригинальный буфер
```

C-output:
```c
typedef struct { int32_t* ptr; size_t length; } Slice_i32;
typedef struct { int32_t* ptr; size_t length; } MutSlice_i32;
// .view(2, 6) → { .ptr = arr->data + 2, .length = 4 }  — без копирования
```

### Структуры данных под капотом

| Тип | Реализация в C | Ключи |
|-----|----------------|-------|
| `{}` объектный литерал | `typedef struct` (C) | известны на этапе компиляции |
| `Map<K, V>` | хеш-таблица | известны только в runtime |
| `Set<T>` | хеш-множество | известны только в runtime |

`Object.keys(obj)` — компилятор знает ключи статически и генерирует их как массив констант. В отличие от JS, `{}` в TSC **не является** хеш-таблицей.

### Map

Инициализация:
```typescript
// Универсальный — любой тип ключа
let m = new Map<string, i32>([["a", 1], ["b", 2]]);

// Объектный литерал — только string ключи
let m: Map<string, i32> = { "a": 1, "b": 2 };

// Пустая Map
let m = new Map<string, i32>();
```

Методы:
```typescript
m.set(key, value)   // key: move (сложный тип) / copy (примитив); value: move — Map владеет обоими
m.get(key)          // key: Ref<K>, возвращает Ref<V> | null (не V | undefined как в JS)
m.has(key)          // key: Ref<K>, boolean
m.delete(key)       // key: Ref<K>, возвращает V | null (owned) — элемент удалён из Map
m.clear()           // void
m.size              // number, readonly

// ?. и ?? с Map
const len = m.get("key")?.length ?? 0;   // Ref<string> | null → number
const val = m.delete("key") ?? fallback;  // V | null → V
```

Примеры ownership:
```typescript
let m = new Map<string, User>();
let user = new User();
m.set("alice", user);   // "alice" — литерал, копируется; user — move
console.log(user);      // ошибка: user перемещён

let key = "alice";
m.set(key, user2);      // key — move
console.log(key);       // ошибка: key перемещён

let u = m.get("alice");    // Ref<User> | null — borrow из Map
let u = m.delete("alice"); // User | null — owned, элемент удалён

// примитивы — всегда copy
let m = new Map<string, i32>();
m.set("x", 42);         // 42 скопирован
m.get("x");             // i32 | null — copy (примитив)
```

Итерация — `k: Ref<K>`, `v: Ref<V>` для сложных типов, copy для примитивов:
```typescript
for (const [k, v] of m) {
    v.doSomething();  // ok — immutable метод
    v.mutMethod();    // ошибка — v это Ref
    m.set("x", val);  // ошибка — m заимствован
}
m.forEach((k, v) => { ... });
for (const k of m.keys()) { ... }
for (const v of m.values()) { ... }
for (const [k, v] of m.entries()) { ... }
```

Статические методы:

```typescript
// Map.groupBy<K, T>(items, keyFn) — группировка элементов массива по ключу
Map.groupBy<K, T>(items: T[], keyFn: (Ref<T>) => K): Map<K, T[]>
```
- Вызывается на `Map`, не на экземпляре
- `keyFn` получает `Ref<T>` (заимствование элемента), возвращает ключ типа `K`
- Возвращает `Map<K, T[]>` — каждый ключ → массив элементов
- Элементы клонируются в группы; **требует `T: Clone`**
- На embedded — ошибка компиляции (требуется heap для массивов-значений)

```typescript
// Object.groupBy<T>(items, keyFn) — то же, но ключи всегда string
Object.groupBy<T>(items: T[], keyFn: (Ref<T>) => string): Map<string, T[]>
```
- Ключи всегда `string` (как в JS, где Object ключи — строки)
- В остальном аналогичен `Map.groupBy`
- На embedded — ошибка компиляции

Пример:
```typescript
const nums: i32[] = [1, 2, 3, 4, 5]
const groups = Map.groupBy(nums, x => x % 2 === 0 ? "even" : "odd")
// groups: Map<string, i32[]>
// groups.get("odd")  → [1, 3, 5]
// groups.get("even") → [2, 4]

const byFirstLetter = Object.groupBy(["apple", "banana", "apricot", "cherry"], s => s.charAt(0))
// byFirstLetter: Map<string, string[]>
// byFirstLetter.get("a") → ["apple", "apricot"]
// byFirstLetter.get("b") → ["banana"]
// byFirstLetter.get("c") → ["cherry"]
```

### Set

Инициализация:
```typescript
let s = new Set<i32>([1, 2, 3]);
let s = new Set<string>();
```

Методы:
```typescript
s.add(value)        // move — Set становится владельцем; бросает при OOM
s.has(value)        // Ref<T> — только для сравнения, владение не меняется; boolean
s.delete(value)     // Ref<T> для поиска, возвращает T | null (owned) — элемент удалён из Set
s.clear()           // void
s.size              // number, readonly

// ?. и ?? с Set
const deleted = s.delete(user);
deleted?.cleanup();                    // вызвать метод если элемент был в Set
const u = s.delete(user) ?? fallback; // дефолт если элемента не было
```

Примеры ownership:
```typescript
let s = new Set<User>();
let user = new User();
s.add(user);        // move — user перешёл во владение Set
console.log(user);  // ошибка: user перемещён

// примитивы — всегда copy
let s = new Set<i32>();
let x = 42;
s.add(x);           // copy
console.log(x);     // ok
```

Теоретико-множественные операции — доступны для примитивов, `string` и `Shared<T>`:
```typescript
s.union(other)               // новый owned Set — все элементы из s и other
s.intersection(other)        // новый owned Set — только общие элементы
s.difference(other)          // новый owned Set — элементы s которых нет в other
s.symmetricDifference(other) // новый owned Set — элементы только в одном из двух
s.isSubsetOf(other)          // boolean
s.isSupersetOf(other)        // boolean
s.isDisjointFrom(other)      // boolean
```

Для `Shared<T>` — union это просто retain на каждый элемент, без копирования объектов:
```typescript
let user1: Shared<User> = new User();
let user2: Shared<User> = new User();

let a = new Set<Shared<User>>([user1, user2]);
let b = new Set<Shared<User>>([user2]);
let c = a.union(b);  // ok — retain на элементы, refcount растёт
```

Для `string` — элементы клонируются в новый Set:
```typescript
let morphemes = new Set<string>(["бег", "ать"]);
let suffixes  = new Set<string>(["ать", "ить"]);
let common = morphemes.intersection(suffixes);  // new Set<string> {"ать"}
```

Для owned сложных типов — ошибка компилятора:
```typescript
let a = new Set<User>([user1, user2]);
let b = new Set<User>([user2]);
let c = a.union(b);
// ошибка: union requires Set<primitive>, Set<string> or Set<Shared<T>>
// hint: use Set<Shared<User>> instead
```

Итерация — `v` это `Ref<T>` для сложных типов, copy для примитивов:
```typescript
for (const v of s) {
    v.doSomething();  // ok — immutable метод
    v.mutMethod();    // ошибка — v это Ref
    s.add(other);     // ошибка — s заимствован
}
s.forEach((v) => { ... });
for (const v of s.values()) { ... }
for (const v of s.keys()) { ... }         // синоним values() — для совместимости с Map API
for (const [v, v2] of s.entries()) { ... } // пары [value, value] — для совместимости с Map API
```

#### Set на embedded

Аналогично `Map<K,V>`: на `allocator: "static"` обязателен compile-time capacity:

```typescript
// Работает на NES, ZX Spectrum, Arduino — с @static
@static const visitedTiles = new Set<u16>(256)   // 256 тайлов в BSS
@static const activeKeys   = new Set<u8>(8)      // 8 одновременно нажатых клавиш

visitedTiles.add(0x0102)        // добавить тайл
visitedTiles.has(0x0102)        // проверить
visitedTiles.delete(0x0102)     // удалить
```

```c
/* C-output — static hash set, всё в BSS */
typedef struct { uint16_t key; bool occupied; } _visitedTiles_Entry;
static _visitedTiles_Entry _visitedTiles_data[256];
static Set_u16 visitedTiles = { _visitedTiles_data, 256, 0 };
```

Переполнение → runtime panic: `set overflow: capacity 256 exceeded`.

### Object

Статические методы для работы с объектами. Ключи — compile-time константы, возвращаются как копии. Значения — Ref для сложных типов, copy для примитивов:

```typescript
const obj = { a: user1, b: user2 };
Object.keys(obj)    // string[]              — копии ключей
Object.values(obj)  // Ref<User>[]           — borrow значений
Object.entries(obj) // [string, Ref<User>][] — ключи copy, значения Ref

const obj = { x: 1, y: 2 };
Object.keys(obj)    // string[]          — копии ключей
Object.values(obj)  // number[]           — copy (примитивы)
Object.entries(obj) // [string, number][] — всё copy
```

Итерация:
```typescript
for (const k of Object.keys(obj)) { ... }
for (const v of Object.values(obj)) { ... }
for (const [k, v] of Object.entries(obj)) { ... }
```

### Object.fromEntries\<T\>

Обратная операция к `Object.entries` — создаёт структурный тип из массива пар `[key, value]`:

```typescript
const entries: [string, i32][] = [["a", 1], ["b", 2]]
const obj = Object.fromEntries<{ a: i32; b: i32 }>(entries)
obj.a  // 1
obj.b  // 2
```

Компилятор знает тип через дженерик-параметр (аналогично `JSON.parse<T>`):
- Если ключи — строковые литералы, компилятор проверяет соответствие набора ключей типу `T` в compile-time.
- Если ключи — переменные, проверка невозможна: несоответствие вызывает **runtime panic**.

```typescript
// Compile-time check — OK или ошибка:
const literal: [string, i32][] = [["a", 1], ["b", 2]]
Object.fromEntries<{ a: i32; b: i32 }>(literal)   // OK — ключи совпадают
Object.fromEntries<{ a: i32; c: i32 }>(literal)   // compile error — нет ключа "c"

// Runtime panic при несовпадении ключей:
const keys = getKeysFromSomewhere()
Object.fromEntries<{ a: i32; b: i32 }>(keys.map(k => [k, 0]))  // panic если ключ не "a" или "b"
```

