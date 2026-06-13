# TSClang — Spread, деструктуризация, merge: проектирование

> **СТАТУС: РЕШЕНО.**
>
> **Ключевое решение:** spread/destructuring/merge = **всегда copy**, source **всегда жив**. Move — только для прямого присваивания `let b = a`. `let`/`const` на source не влияет на copy/move. `let`/`const` на result — только про мутабельность результата.
>
> **Scope:** настоящее правило покрывает spread-оператор (`[...arr]`), деструктуризацию при присваивании (`const [a, b] = arr`, `const { x } = obj`), merge (`{...a, ...b}`) и деструктуризацию в паттерне `match`. Во всех случаях source жив, поля копируются.
>
> **Связь с for-of:** spread/destructuring использует **copy** для всех типов. For-of (см. [05-for-of-iteration.md](../05-control-flow/05-for-of-iteration.md)) использует **borrow** (pointer) для complex-типов. Разные операции = разная семантика: for-of = walk по существующим данным (zero-cost), spread = создание новых данных (safe copy). Это осознанный дизайн, не противоречие.
>
> **Обоснование:** П1 (кроссплатформенность) — copy безопасна на всех платформах, retain = no-op на embedded. П2 (TS compat) — идентичное поведение, source всегда жив. П3 (better than TS/C/Rust) — нет алиасинга (value types), нет скрытого move, предсказуемость.
>
> Опирается на: [04-primitives.md](../04-ownership/04-primitives.md) (владение), [05-for-of-iteration.md](../05-control-flow/05-for-of-iteration.md) (итерация).

---

## Базовое правило

Spread, destructuring, merge — **всегда создают независимые копии** элементов. Source никогда не умирает (нет E002). Move semantics для этих операций не применяется.

| Тип элемента | Copy-семантика | На embedded |
|-------------|---------------|-------------|
| Primitive | Copy (memcpy) | Copy (идентично) |
| string | Copy + `tsc_string_retain` | Copy + no-op retain |
| Class/struct | Struct copy + retain string-полей | Struct copy + no-op retain |
| Array\<U\> | Struct copy + retain string-полей | Struct copy + no-op retain |

`let`/`const` на **result** определяет только мутабельность результата:
- `let result = [...]` — result можно мутировать (push/pop/reassign)
- `const result = [...]` — result immutable

`let`/`const` на **source** не влияет на операцию — всегда copy.

---

## 1. Spread в массиве `[...arr, x]`

### 1.1 Примитивы

```typescript
// TSC
let nums: number[] = [1, 2, 3];
const result = [...nums, 4, 5];
console.log(nums.length);   // 3 — жив
console.log(result.length); // 5
```

```c
double _d0[] = {1, 2, 3};
Array_f64 nums = {.data = _d0, .length = 3, .capacity = 3};
double _d1[] = {nums.data[0], nums.data[1], nums.data[2], 4, 5};
Array_f64 result = {.data = _d1, .length = 5, .capacity = 5};
// nums untouched
```

```typescript
// TS/JS — идентично
let nums = [1, 2, 3];
const result = [...nums, 4, 5];
console.log(nums);   // [1, 2, 3] — жив
console.log(result); // [1, 2, 3, 4, 5]
```

### 1.2 String

```typescript
// TSC
let names: string[] = ["Alice", "Bob"];
const result = [...names, "Charlie"];
console.log(names[0]);   // "Alice" — жив
console.log(result[2]);  // "Charlie"
```

```c
String _d0[] = {STR_LIT("Alice"), STR_LIT("Bob")};
Array_string names = {.data = _d0, .length = 2, .capacity = 2};

tsc_string_retain(names.data[0]);
tsc_string_retain(names.data[1]);
String _d1[] = {names.data[0], names.data[1], STR_LIT("Charlie")};
Array_string result = {.data = _d1, .length = 3, .capacity = 3};
// names untouched
```

```typescript
// TS/JS — идентично
```

### 1.3 Class

```typescript
// TSC
class User { name: string; age: number; }
let users: User[] = [new User("Alice", 30), new User("Bob", 25)];
let result = [...users, new User("Charlie", 35)];
console.log(users[0].name);  // "Alice" — жив
console.log(result[0].name); // "Alice" — независимая копия
result[0].name = "NewName";
console.log(users[0].name);  // "Alice" — не изменилось!
```

```c
// retain string fields of copied Users (new owner)
tsc_string_retain(users.data[0].name);
tsc_string_retain(users.data[1].name);
User _d1[] = {users.data[0], users.data[1], User_new("Charlie", 35)};
Array_User result = {.data = _d1, .length = 3, .capacity = 3};
// users untouched
```

```typescript
// TS/JS
let users = [new User("Alice", 30), new User("Bob", 25)];
const result = [...users, new User("Charlie", 35)];
console.log(users[0].name);  // "Alice" — жив
console.log(result[0] === users[0]); // true — ТА ЖЕ ссылка (reference type)
result[0].name = "NewName";
console.log(users[0].name);  // "NewName" — изменилось! (aliased)
```

**Разница:** TS — shallow copy references (aliased). TSC — struct copy (value types, не aliased). Мутация result не влияет на source. Это фундаментальное отличие value types от reference types, не специфичное для spread.

---

## 2. Деструктуризация массива `const [a, b, ...rest] = arr`

### 2.1 Примитивы

```typescript
// TSC
let arr: number[] = [10, 20, 30];
const [first, ...rest] = arr;
console.log(arr[0]);  // 10 — жив
console.log(first);   // 10
console.log(rest[0]); // 20
```

```c
Array_f64 arr = ...;
double first = arr.data[0];                                        // copy
Array_f64 rest = tsc_array_slice_f64(arr, 1, arr.length); // deep copy
// arr untouched
```

```typescript
// TS/JS — идентично
```

### 2.2 String

```typescript
// TSC
let names: string[] = ["Alice", "Bob", "Charlie"];
const [first, ...rest] = names;
console.log(names[0]);  // "Alice" — жив
console.log(first);     // "Alice"
console.log(rest[0]);   // "Bob"
```

```c
tsc_string_retain(names.data[0]);
String first = names.data[0]; // copy
Array_string rest = tsc_array_slice_string(names, 1, names.length); // retain each
// names untouched
```

### 2.3 Class

```typescript
// TSC
let users: User[] = [new User("Alice", 30), new User("Bob", 25)];
const [first, ...rest] = users;
console.log(users[0].name);  // "Alice" — жив
console.log(first.name);     // "Alice" — независимая копия
```

```c
tsc_string_retain(users.data[0].name);
User first = users.data[0];  // struct copy
Array_User rest = tsc_array_slice_User(users, 1, users.length); // deep copy + retain strings
// users untouched
```

---

## 3. Spread в объекте `{ ...obj, extra: 42 }`

### 3.1 Примитивы

```typescript
// TSC
let obj = { x: 1, y: 2 };
const extended = { ...obj, z: 3 };
console.log(obj.x);     // 1 — жив
console.log(extended.z); // 3
```

```c
BaseType extended = {.x = obj.x, .y = obj.y, .z = 3};
// obj untouched
```

```typescript
// TS/JS — идентично
```

### 3.2 String-поля

```typescript
// TSC
let base = { name: "Alice", age: 30 };
const copy = { ...base, city: "NYC" };
console.log(base.name); // "Alice" — жив
```

```c
tsc_string_retain(base.name);
BaseType copy = {.name = base.name, .age = base.age, .city = STR_LIT("NYC")};
// base untouched
```

### 3.3 Class-поле

```typescript
// TSC
class Point { x: f64; y: f64; }
let container = { p: new Point(1.0, 2.0), label: "origin" };
const copy = { ...container };
console.log(container.p.x); // 1.0 — жив
```

```c
tsc_string_retain(container.label);
ContainerType copy = {.p = container.p, .label = container.label};
// container untouched
```

---

## 4. Деструктуризация объекта `const { name, age } = obj`

### 4.1 Всегда copy (без borrow)

```typescript
// TSC
const obj = { name: "Alice", age: 30 };
const { name, age } = obj;
console.log(obj.name); // "Alice" — жив
// name: string — независимая копия (retain → String in C)
// age: number — копия
```

```c
tsc_string_retain(obj.name);
String name = obj.name;
double age = obj.age;
// cleanup: tsc_string_release(name);
```

```typescript
// TS/JS
const obj = { name: "Alice", age: 30 };
const { name, age } = obj;
// name = "Alice" (copy), age = 30 (copy)
console.log(obj.name); // "Alice" — жив
```

**Разница с TS:** для объектов TS копирует ссылку (aliased), TSC копирует value (независимо). Для примитивов и строк — идентично.

### 4.2 С typeAnn — тоже copy

```typescript
// TSC
const user = { name: "Alice", age: 30 };
const { name, age }: User = user;
console.log(user.name); // "Alice" — жив
```

```c
tsc_string_retain(user.name);
String name = user.name;
double age = user.age;
// user untouched
```

Type annotation указывает тип source, но **не меняет** copy-семантику.

### 4.3 Безопасный return

```typescript
// TSC
function getName(): string {
    const obj = { name: "Alice" };
    const { name } = obj;  // copy: name — независимый владелец
    return name;           // безопасно
}
```

```c
String getName() {
    BaseType obj = {.name = STR_LIT("Alice")};
    tsc_string_retain(obj.name);
    String name = obj.name;
    // obj dies — name still valid
    return name;
}
```

---

## 5. Кортежи

### 5.1 Spread `[...pair, 3.0]`

```typescript
// TSC
let pair: [f64, f64] = [1.0, 2.0];
const triple: [f64, f64, f64] = [...pair, 3.0];
console.log(pair._0); // 1.0 — жив
```

```c
tuple_f64_f64_f64 triple = {._0 = pair._0, ._1 = pair._1, ._2 = 3.0};
// pair untouched
```

```typescript
// TS/JS — идентично
```

### 5.2 Деструктуризация `const [a, b] = tuple`

```typescript
// TSC
let t: [number, string] = [1, "hello"];
const [a, b] = t;
console.log(t._0); // 1 — жив
```

```c
double a = t._0;
tsc_string_retain(t._1);
String b = t._1;
// t untouched
```

```typescript
// TS/JS — идентично
```

### 5.3 Class-элемент

```typescript
// TSC
let t: [User, number] = [new User("Alice", 30), 42];
const [user, score] = t;
console.log(t._0.name); // "Alice" — жив
```

```c
tsc_string_retain(t._0.name);
User user = t._0;
double score = t._1;
// t untouched
```

---

## 6. Merge (несколько spread)

### 6.1 Объекты `{ ...a, ...b }`

```typescript
// TSC
let a = { name: "Alice", age: 30 };
let b = { name: "Bob", city: "NYC" };
const merged = { ...a, ...b };
console.log(a.name); // "Alice" — жив
console.log(b.name); // "Bob" — жив
console.log(merged.name); // "Bob" (b перезаписал a)
```

```c
// retain только полей, попадающих в результат
tsc_string_retain(b.name);   // b.name → merged.name (перезаписывает a.name)
tsc_string_retain(b.city);   // b.city → merged.city
// a.age — примитив, retain не нужен
ResultType merged = {.name = b.name, .age = a.age, .city = b.city};
// a, b untouched
```

```typescript
// TS/JS — идентично
const a = { name: "Alice", age: 30 };
const b = { name: "Bob", city: "NYC" };
const merged = { ...a, ...b };
console.log(merged); // { name: "Bob", age: 30, city: "NYC" }
console.log(a);      // { name: "Alice", age: 30 } — жив
```

**Перезапись string-полей:** `b.name` перезаписывает `a.name`. Retain `b.name` — новый владелец. `a.name` не попадает в результат — retain не нужен.

### 6.2 Массивы `[...arr1, ...arr2]`

```typescript
// TSC
let a: number[] = [1, 2];
let b: number[] = [3, 4];
const merged = [...a, ...b];
console.log(a.length); // 2 — жив
console.log(b.length); // 2 — жив
console.log(merged.length); // 4
```

```c
double _d[] = {a.data[0], a.data[1], b.data[0], b.data[1]};
Array_f64 merged = {.data = _d, .length = 4, .capacity = 4};
// a, b untouched
```

---

## 7. Сводка: Матрица Resource × Action × ElementType

### Единое правило: всегда copy

Для `Arc<T>` «copy» = retain (refcount++), для остальных — struct copy.

| Resource | Action | Element | TSC | TS/JS |
|----------|--------|---------|-----|-------|
| Array | Spread | Primitive | Copy, source жив | Идентично |
| Array | Spread | string | Copy + retain, source жив | Идентично |
| Array | Spread | Class | Struct copy + retain, source жив | Shallow copy refs (aliased) |
| Array | Destructure | Primitive | Copy, source жив | Идентично |
| Array | Destructure | string | Copy + retain, source жив | Идентично |
| Array | Destructure | Class | Struct copy + retain, source жив | Copy ref (aliased) |
| Object | Spread | Primitive | Copy, source жив | Идентично |
| Object | Spread | string | Copy + retain, source жив | Идентично |
| Object | Spread | Class | Struct copy + retain, source жив | Copy ref (aliased) |
| Object | Destructure | Primitive | Copy, source жив | Идентично |
| Object | Destructure | string | Copy + retain, source жив | Идентично |
| Object | Destructure | Class | Struct copy + retain, source жив | Copy ref (aliased) |
| Tuple | Spread | Any | Copy + retain, source жив | Идентично |
| Tuple | Destructure | Any | Copy + retain, source жив | Идентично |
| Any | Merge | Any | Copy + retain, все source живы | Идентично |

**Единственное расхождение с TS/JS:** class-элементы. TS = reference copy (aliased), TSC = struct copy (независимо). Это фундаментальное отличие value types от reference types.

### `Arc<T>` source — retain

| Action | Element | TSC |
|--------|---------|-----|
| Spread | Any | Retain каждого элемента (refcount++) |
| Destructure | Any | Retain каждого элемента |

### `Ref<T>` / `Mut<T>` source — copy

| Action | Element | TSC |
|--------|---------|-----|
| Spread | Any | Copy + retain string-полей (borrow source, нельзя move) |
| Destructure | Any | Copy + retain string-полей |

---

## 8. Принятые решения

### D1: Spread/destructuring/merge = всегда copy

Source всегда жив. Нет move, нет E002. `let`/`const` на source не влияет.

**Обоснование:**
- П2 (TS compat): идентичное observable behavior
- П3 (better): нет скрытого move, нет алиасинга
- П1 (embedded): retain = no-op, struct copy = дёшево
- Практика: `let` не означает «потреби» — функция, метод класса, все используют `let`

### D2: Деструктуризация объекта = copy (не borrow)

Даже без type annotation: `const { name } = obj` = copy + retain, не borrow pointer.

**Обоснование:**
- Borrow создаёт lifetime issues (return из функции = dangling pointer)
- Borrow создаёт aliasing (`let { name } = obj; obj.name = "x"` → name тоже изменился)
- retain/release = no-op на embedded, минимальная цена на desktop
- Консистентность: все операции = copy, нет исключений

### D3: `let`/`const` на result = только мутабельность

- `let result = [...]` — result можно мутировать
- `const result = [...]` — result immutable

Ортогонально copy/move. Move для этих операций не применяется.

### D4: Type annotation на деструктуризации = только указание типа

`const { name, age }: User = obj` — typeAnn указывает тип source. Не меняет copy-семантику. Source жив.

---

## 9. Текущее состояние impl

| Фича | Статус | Что нужно |
|------|--------|-----------|
| Spread массива примитивов | ✅ | — |
| Spread массива string | ⚠️ Нет retain | Добавить retain |
| Spread массива Class | ⚠️ Shallow copy, нет retain | Добавить retain string-полей |
| Spread объекта | ⚠️ (retain + move) | Убрать move, оставить copy + retain |
| Spread кортежа | ✅ | — |
| Деструктуризация массива | ✅ (copy + rest slice) | Убрать move для let source |
| Деструктуризация объекта | ⚠️ Borrow без typeAnn | Переключение на copy + retain |
| Деструктуризация объекта (typeAnn) | ⚠️ Move | Переключение на copy + retain |
| Деструктуризация кортежа | ✅ | Убрать move для let source |
| Rest tuple деструктуризация | ❌ Заглушка | Реализовать |
| Merge (несколько spread) | ⚠️ Частично | Убрать move |
| `Arc<T>` spread/retain | ❌ | Реализовать retain |

---

## 10. Влияние на 04-primitives.md

Решение «всегда copy» для spread/destructuring/merge **не отменяет** move semantics в 04-ownership для прямого присваивания. Move остаётся для:

- `let b = a` (class) → move + E002
- `let b = a` (array) → move + E002
- `foo(a)` (param: T) → move + E002
- Return value → ownership transfer
