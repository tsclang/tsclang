# 08 — Кортежи: ownership и семантика присваивания

Кортеж — фиксированный struct с полями `_0`, `_1`, `_2`... Каждый элемент может быть своего типа. Не массив, не класс — отдельный тип.

C-output: struct с именованными полями:

```c
typedef struct {
    int32_t _0;
    String  _1;
} tuple_i32_string;
```

### Обычные переменные

Семантика зависит от типов элементов:

| Паттерн | Элементы | Семантика | C-вывод |
|---------|----------|-----------|---------|
| `let b = a` | Все примитивы | Copy struct | `tuple_i32_f64 b = a;` |
| `let b = a` | Есть string/класс | Move + zero-out | `tuple_i32_string b = a; a = (tuple_i32_string){0};` |
| `const b = a` | Все примитивы | Copy struct (const) | `const tuple_i32_f64 b = a;` |
| `const b = a` | Есть string/класс | Move + zero-out | `const tuple_i32_string b = a; a = (tuple_i32_string){0};` |
| `b = a` (reassign) | Есть string/класс | Move + zero-out | `b = a; a = (tuple_i32_string){0};` |

Кортеж со сложными элементами ведёт себя как класс: move + zero-out. Кортеж со всеми примитивами — как примитив: copy.

### Ref\<T\> / Mut\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<[User, string]> = a` | Borrow всей struct | `const tuple_User_string *b = &a;` |
| `const b: Mut<[User, string]> = a` | Mutable borrow | `tuple_User_string *b = &a;` |

### Shared\<T\> / Weak\<T\>

Аналогично классам — нельзя создать `Shared<tuple>` из owned. Tuple — value type, как класс.

### Доступ к элементам

```typescript
let pair: [number, string] = [1, "hello"];
pair[0]    // 1 — number (copy, примитив)
pair[1]    // "hello" — string (ARC Copy, retain)
pair._0    // сахар над pair[0]
```

Labeled tuples — dot-access:

```typescript
type Point = [x: f64, y: f64];
let p: Point = [1.0, 2.0];
p.x   // сахар над p._0
p.y   // сахар над p._1
```

### Readonly кортежи

```typescript
let t: readonly [number, string] = [1, "hello"];
t[0] = 5  // ❌ cannot assign to readonly tuple element
```

```c
typedef struct {
    const double _0;
    const String  _1;
} readonly_tuple_f64_string;
```

### Optional элементы

Optional (`?`) разрешены только в конце:

```typescript
type Config = [string, number?];
let a: Config = ["localhost"];         // ok — number отсутствует
let b: Config = ["localhost", 8080];   // ok
a[1]  // number | null
```

```c
typedef struct {
    String  _0;
    opt_f64 _1;  // bool has_value + double value
} tuple_string_opt_f64;
```

### Rest-элементы

`...T[]` — произвольное количество элементов в конце. Один rest, только в конце, несовместим с optional.

```typescript
type Strings = [string, ...string[]];
let a: Strings = ["first"];
let b: Strings = ["first", "second", "third"];
```

```c
typedef struct {
    String  _0;
    String* tail;
    usize   tail_len;
} tuple_string_rest_string;
```

Rest-часть требует heap. На embedded — те же правила что и `Array`.

### Spread в tuple-литералах

Spread фиксированного tuple — размер известен статически:

```typescript
const pair: [number, number] = [1.0, 2.0];
const triple: [number, number, number] = [...pair, 3.0];  // ok — compile-time размер
const copy: [number, number, number] = [...pair];              // copy
```

Spread runtime-массива в rest-tuple — разрешён:

```typescript
function wrap(items: string[]): [number, ...string[]] {
    return [0, ...items];  // ok — items.length становится tail_len
}
```

Spread runtime-массива в фиксированный tuple — **ошибка**:

```typescript
let t: [number, string, string] = [1, ...runtimeArray];
// ❌ error: cannot spread runtime-length array into fixed tuple
```

### Деструктуризация

Деструктуризация кортежа **всегда copy** — source жив, нет move, нет E002. `let`/`const` на source не влияет.

| Паттерн | Семантика |
|---------|-----------|
| `const [a, b] = pair` | Copy элементов + retain string-полей, tuple жив |
| `let [a, b] = pair` | Copy элементов + retain string-полей, tuple жив |
| `const [x, , z] = triple` | Copy указанных + retain string-полей |
| `const [user, name] = t` (owned) | Struct copy + retain string-полей, t жив |
| `const [user, name] = t` (Ref\<tuple\>) | Copy + retain string-полей, t жив |

```typescript
let t: [User, string] = [new User(), "test"];

// Copy — tuple жив
const [user, name] = t;  // user: User (struct copy), name: string (retain); t жив
console.log(t._0.name);  // ok

// Borrow — через Ref
function process(t: Ref<[User, string]>): void {
    const [user, name] = t;  // copy + retain, t жив
}
```

**string-элементы при деструктуризации** — retain при извлечении, release в cleanup (как при деструктуризации объекта).

### Поведение внутри функций

**Передача по значению** — copy (примитивы) или move (сложные элементы):

```typescript
function swap(t: [number, string]): [string, number] {
    return [t[1], t[0]];
}
```

**Ref\<tuple\>** — borrow, деструктуризация даёт `Ref<T>` для каждого элемента.

**Замыкания с tuple capture** — как класс: reference (pointer в env), source жив. См. [06-closures.md](../06-functions/06-closures.md).

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| Fixed tuple struct | На стеке, как любой struct | Аналогично |
| Rest tuple `tail` | `malloc` для tail-массива | Статический буфер или фиксированный массив |
| string-элементы | ARC retain/release | No-op (rodata) |
| Optional элементы | `opt_T` struct (bool + value) | Аналогично |
| Spread fixed tuple | Copy элементов + retain string-полей, source жив | Copy элементов (string — no-op retain), source жив |
| Деструктуризация | Copy элементов + retain string-полей, source жив | Copy элементов (string — no-op), source жив |

**Ключевое отличие:** rest tuple (`...T[]`) требует heap на desktop. На embedded — статический буфер с фиксированной ёмкостью, как `Array`.

### Почему так

Кортеж — value type: spread и деструктуризация **всегда copy** (см. [08-spread-destructuring.md](08-spread-destructuring.md), D1). Source жив, нет move, нет E002. string-элементы — retain при copy (новый владелец), release в cleanup.

```typescript
// всегда copy + retain
let pair: [number, string] = [1, "hello"];
const [a, b] = pair;  // b: retain("hello"), pair жив
console.log(pair._1);  // ok

// const source — тоже copy
const pair2: [number, string] = [2, "world"];
const [c, d] = pair2;  // d: retain("world"), pair2 жив
```

Move для кортежей — **только при прямом присваивании** (`let b = a`), не при spread/деструктуризации.
