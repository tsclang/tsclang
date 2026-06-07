## Tuples

Tuple — фиксированный кортеж с известным количеством элементов и их типами. В отличие от массива, каждый элемент может иметь свой тип.

```typescript
let pair: [i32, string] = [1, "hello"]
let triple: [i32, string, f64] = [1, "hello", 3.14]

pair[0]  // 1 — i32
pair[1]  // "hello" — string

const [a, b] = pair       // a: i32, b: string
const [x, , z] = triple   // x: i32, z: f64 (пропуск элемента)
```

**C-output:** struct с полями `_0`, `_1`, `_2`:

```c
typedef struct {
    int32_t _0;
    String  _1;
} tuple_i32_string;

tuple_i32_string pair = {
    ._0 = 1,
    ._1 = (String){ .data = "hello", .length = 5, .capacity = 0 }
};
```

*Note:* Internal iterator-возвращаемые кортежи (entries, map pairs) используют `Tuple_` (uppercase) — например `Tuple_i32_string` для `Array.entries()`.

### Labeled Tuples

Labels дают имена элементам и разрешают dot-access наравне с индексным:

```typescript
type Point = [x: f64, y: f64]

let p: Point = [1.0, 2.0]
p[0]  // ok — 1.0
p.x   // ok — сахар над p[0], компилируется в p._0
```

`p.x` и `p[0]` генерируют одинаковый C-код.

**Ограничения:**
- Labels либо у всех элементов, либо ни у кого — `[x: f64, f64]` ошибка
- Label не должен совпадать со встроенными свойствами (`length`)
- Labels улучшают сообщения об ошибках: `missing element 'port' at index 1`

### Readonly Tuples

```typescript
let t: readonly [i32, string] = [1, "hello"]
t[0] = 5  // ошибка: cannot assign to readonly tuple element
```

```c
typedef struct {
    const int32_t _0;
    const String  _1;
} readonly_tuple_i32_string;
```

### Optional Elements

Optional элементы (`?`) разрешены только в конце:

```typescript
type Config = [string, i32?]

let a: Config = ["localhost"]         // ok — i32 отсутствует
let b: Config = ["localhost", 8080]   // ok
a[1]  // i32 | null
```

```typescript
type Good = [i32, string?, f64?]  // ok
type Bad  = [i32?, string, f64]   // ошибка: optional element must be at end
```

```c
typedef struct {
    String  _0;
    opt_i32 _1;  // bool has_value + int32_t value
} tuple_string_opt_i32;
```

### Rest Elements

`...T[]` — произвольное количество элементов в конце. Один rest, только в конце, несовместим с optional.

```typescript
type Strings = [string, ...string[]]

let a: Strings = ["first"]
let b: Strings = ["first", "second", "third"]
```

**C-output:** `pointer + length`, не growable array:

```c
typedef struct {
    String  _0;
    String* tail;
    usize   tail_len;
} tuple_string_rest_string;
```

Rest-часть требует heap. На embedded — те же правила что и `Array`.

Spread из runtime-массива в rest-tuple разрешён:

```typescript
function wrap(items: string[]): [i32, ...string[]] {
    return [0, ...items]  // ok — items.length становится tail_len
}
```

Spread из runtime-массива в фиксированный tuple — ошибка компилятора:

```typescript
let t: [i32, string, string] = [1, ...runtimeArray]
// ошибка: cannot spread runtime-length array into fixed tuple
```

### Spread в tuple-литералах

Spread tuple-специфичные случаи. Для spread в массивах — см. [08-spread-destructuring.md](08-spread-destructuring.md).

```typescript
// Копирование tuple
const p: [f64, f64, f64] = [1.0, 2.0, 3.0]
const copy: [f64, f64, f64] = [...p]

// Spread фиксированного tuple — размер известен статически
const pair: [f64, f64] = [1.0, 2.0]
const triple: [f64, f64, f64] = [...pair, 3.0]  // ok
```

### Ownership

```typescript
let t: [User, string] = [new User(), "test"]

// Destructuring = copy (см. 08-spread-destructuring.md — spread/destructuring всегда copy)
const [user, name] = t  // user: User, name: string; t жив (copy)
console.log(t[0].name)  // ok — t жив

// Borrow — передай как Ref параметром
function process(t: Ref<[User, string]>): void {
    const [user, name] = t  // user: Ref<User>, name: Ref<string>
}
```

### Tuple vs Array

| Свойство | Tuple `[A, B]` | Array `A[]` |
|----------|----------------|-------------|
| Размер | Фиксирован на compile-time | Динамический |
| Типы элементов | Разные | Одинаковые |
| C-output | Struct | Dynamic array struct |
| `.length` | Compile-time константа | Runtime значение |

