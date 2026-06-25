## Type Aliases

`type` — compile-time алиас, не генерирует новый тип в C:

```typescript
// 1. Алиас примитива — читабельность
type UserId = i32;
type Timestamp = i64;

function getUser(id: UserId): User { ... }  // UserId = i32 в C

// 2. Алиас объекта — эквивалентен data-only interface, генерирует typedef struct
type Point = { x: f64, y: f64 };     // → typedef struct { double x; double y; } Point;
let p: Point = { x: 1.0, y: 2.0 };  // ok — Point struct

// 3. Nullable тип (единственный допустимый union)
type Nullable<T> = T | null;  // generic алиас

// ❌ ЗАПРЕЩЕНО: non-nullable union
// type StringOrInt = string | i32;       // ошибка компилятора
// function process(x: string | i32) {}  // ошибка компилятора

// ✅ Полиморфизм через interface:
interface Shape { area(): f64 }
class Circle implements Shape { r: f64; area(): f64 { return Math.PI * this.r * this.r; } }
class Rect implements Shape { w: f64; h: f64; area(): f64 { return this.w * this.h; } }
function process(x: Shape): void { ... }

// 4. Тип функции — для колбэков
type Callback = (x: i32) => void;
type Comparator<T> = (a: Ref<T>, b: Ref<T>) => number;

function sort(arr: Mut<i32[]>, cmp: Comparator<i32>): void { ... }
```

- `type Point = { ... }` — гарантированно `typedef struct`, методы запрещены; `interface Point { ... }` без методов — тоже `typedef struct`, но методы можно добавить позже
- `type UserId = i32` — compile-time алиас примитива, нового C типа нет; `UserId` и `i32` взаимозаменяемы
- `T | null` — единственный допустимый runtime union; любой non-nullable runtime union (`string | i32`, `A | B`) — **ошибка компилятора**
- Для полиморфизма — class-иерархия (`abstract class`) или discriminated union через enum

## String Literal Union

String literal union — **compile-time концепция**. В runtime не существует — компилируется в C enum.

```typescript
type Dir = "north" | "south" | "east" | "west"
type Status = "ok" | "error" | "pending"

let d: Dir = "north"   // ok
d = "up"               // ошибка компилятора: "up" не входит в Dir
```

```c
typedef enum { Dir_north, Dir_south, Dir_east, Dir_west } Dir;

static const char* const Dir_values[] = {
    [Dir_north] = "north",
    [Dir_south] = "south",
    [Dir_east]  = "east",
    [Dir_west]  = "west"
};
```

**Конверсия в string — явная:**

```typescript
const s1 = d.toString()   // "north" — читаемо
const s2 = d as string    // "north" — кратко
```

Автоконверт запрещён — в C это скрытый `Dir_values[d]`, overhead должен быть виден в коде.

**Где разрешён string literal union:**

| Позиция | Разрешено |
|---------|-----------|
| `type` alias | ✅ |
| Тип параметра функции | ✅ |
| Generic параметр (`keyof`, `Pick`, `Record`) | ✅ |
| Runtime union с другим типом (`Dir \| i32`) | ❌ |
| Автоконверт в `string` | ❌ |

## Utility Types

Utility types — **compile-time type operators**. В C не существуют: компилятор разворачивает их в конкретные struct/enum на этапе type checking.

### Generic functions — правило А+Б

```typescript
// ✅ А: type alias — всегда разрешён
type UserName = Pick<User, "name">
type PartialConfig = Partial<Config>

// ✅ Б: utility type в позиции параметра generic function
function log<T>(obj: Pick<T, "name">): void {
    print(obj.name)
}
function merge<T>(base: T, patch: Partial<T>): T { ... }

// ❌ utility type в return type generic function
function pick<T, K extends keyof T>(obj: T, key: K): Pick<T, K>
// ошибка: Pick с runtime-key в return type невозможен в C
```

Запрет на return type с generic key — потому что `{ [key]: obj[key] }` невозможно в C (нет динамического доступа к полям).

### keyof

`keyof T` — compile-time оператор, возвращает string literal union ключей типа. Работает только внутри utility types и type aliases.

```typescript
type User = { name: string; age: i32 }

keyof User  // → "name" | "age"
```

Не может использоваться в runtime выражениях.

### Partial\<T\>

Все поля становятся optional.

```typescript
type User = { name: string; age: i32 }
type PartialUser = Partial<User>
// → { name?: string; age?: i32 }
```

```c
typedef struct {
    opt_string name;  // bool has_value + string
    opt_i32    age;
} PartialUser;
```

### Required\<T\>

Все поля становятся обязательными. Обратный к `Partial`.

```typescript
type User = { name?: string; age?: i32 }
type RequiredUser = Required<User>
// → { name: string; age: i32 }
```

### Readonly\<T\>

Все поля становятся константными.

```typescript
type User = { name: string; age: i32 }
type ReadonlyUser = Readonly<User>
```

```c
typedef struct {
    const char* const name;
    const int32_t     age;
} ReadonlyUser;
```

### NonNullable\<T\>

Убирает `null` из типа.

```typescript
type T  = string | null
type NN = NonNullable<T>  // → string
```

### Pick\<T, K\>

Выбирает подмножество полей. `K` — string literal или literal union (не переменная).

```typescript
type User = { name: string; age: i32; email: string }
type UserName    = Pick<User, "name">
// → { name: string }

type UserContact = Pick<User, "name" | "email">
// → { name: string; email: string }
```

### Omit\<T, K\>

Исключает поля. Обратный к `Pick`.

```typescript
type UserPublic  = Omit<User, "passwordHash">
type UserMinimal = Omit<User, "age" | "email">
```

### Record\<K, V\>

| K | Результат |
|---|-----------|
| Literal union (`"x" \| "y"`) | `typedef struct` |
| `enum` | `typedef struct` |
| `string` | `Map<string, V>` (runtime) |

```typescript
type Coords  = Record<"x" | "y", f64>       // → struct { f64 x; f64 y; }
type Point3D = Record<Axis, f64>             // → struct по enum Axis
type StrMap  = Record<string, i32>           // → Map<string, i32>
```

```c
// Record<"x" | "y", f64>
typedef struct { double x; double y; } Coords;

// Record<Axis, f64>  (enum Axis { X, Y, Z })
typedef struct { double x; double y; double z; } Point3D;
```

### ReturnType\<T\>

Извлекает return type функции. `T` — function type или `typeof function`.

```typescript
function foo(): string { ... }
type R = ReturnType<typeof foo>  // → string
```

### Parameters\<T\>

Параметры функции как tuple.

```typescript
function foo(x: i32, y: string): void { ... }
type P = Parameters<typeof foo>  // → [i32, string]
```

### Awaited\<T\>

Unwrap async/Promise типа (рекурсивно).

```typescript
async function fetchData(): Promise<User> { ... }
type U = Awaited<ReturnType<typeof fetchData>>  // → User
type B = Awaited<Promise<Promise<i32>>>         // → i32
```

### Не поддерживаемые

| Utility | Причина |
|---------|---------|
| `Extract<T, U>` | Требует conditional types |
| `Exclude<T, U>` | Требует conditional types |
| `InstanceType<T>` | Нет constructor type concept |
| `ThisParameterType<T>` | Нет OOP `this` semantics |
| `Uppercase<T>` / `Lowercase<T>` | Template literal types |

### Примеры

```typescript
// Partial для конфигурации со значениями по умолчанию
type Config = { host: string; port: i32; timeout: i32 }

function createConfig(overrides: Partial<Config>): Config {
    return {
        host:    overrides.host    ?? "localhost",
        port:    overrides.port    ?? 8080,
        timeout: overrides.timeout ?? 30000
    }
}

// Pick для публичного API
type User = { id: i32; name: string; email: string; passwordHash: string }
type PublicUser = Pick<User, "id" | "name" | "email">

function getUser(id: i32): PublicUser { ... }

// Record для векторов
type Vec3 = Record<"x" | "y" | "z", f64>

function normalize(v: Vec3): Vec3 {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
    return { x: v.x / len, y: v.y / len, z: v.z / len }
}

// Utility type в параметре generic function (Вариант Б)
function merge<T>(base: T, patch: Partial<T>): T {
    // компилятор знает конкретный T на call site
    ...
}
```

