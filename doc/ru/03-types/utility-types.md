# Utility Types — утилитарные типы

[← Вверх](./index.md) | [Следующий →](./date.md) | [Предыдущий ←](./type-aliases.md)

---

Utility types — **compile-time type operators**. В C не существуют: компилятор разворачивает их в конкретные struct/enum на этапе type checking.

## Обзор

| Utility | Назначение | Пример |
|---------|-----------|--------|
| `keyof T` | Ключи типа как string literal union | `keyof User` → `"name" \| "age"` |
| `Partial<T>` | Все поля optional | `{ name?: string; age?: i32 }` |
| `Required<T>` | Все поля обязательные | Обратный к `Partial` |
| `Readonly<T>` | Все поля константные | `const` поля в C |
| `NonNullable<T>` | Убрать `null` из типа | `string \| null` → `string` |
| `Pick<T, K>` | Выбрать подмножество полей | `Pick<User, "name">` |
| `Omit<T, K>` | Исключить поля | Обратный к `Pick` |
| `Record<K, V>` | Объект с ключами K и значениями V | `Record<"x" \| "y", f64>` |
| `ReturnType<T>` | Return type функции | `typeof foo` → return type |
| `Parameters<T>` | Параметры функции как tuple | `[i32, string]` |
| `Awaited<T>` | Unwrap Promise (рекурсивно) | `Promise<User>` → `User` |

## keyof

`keyof T` — compile-time оператор, возвращает string literal union ключей типа. Работает только внутри utility types и type aliases.

```typescript
type User = { name: string; age: i32 }

keyof User  // → "name" | "age"
```

Не может использоваться в runtime выражениях.

## Partial\<T\>

Все поля становятся optional:

```typescript
type User = { name: string; age: i32 }
type PartialUser = Partial<User>
// → { name?: string; age?: i32 }
```

### C-output

```c
typedef struct {
    opt_string name;  // bool has_value + string
    opt_i32    age;   // bool has_value + int32_t
} PartialUser;
```

### Пример: конфигурация с дефолтами

```typescript
type Config = { host: string; port: i32; timeout: i32 }

function createConfig(overrides: Partial<Config>): Config {
    return {
        host:    overrides.host    ?? "localhost",
        port:    overrides.port    ?? 8080,
        timeout: overrides.timeout ?? 30000
    }
}
```

## Required\<T\>

Все поля становятся обязательными. Обратный к `Partial`:

```typescript
type User = { name?: string; age?: i32 }
type RequiredUser = Required<User>
// → { name: string; age: i32 }
```

## Readonly\<T\>

Все поля становятся константными:

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

## NonNullable\<T\>

Убирает `null` из типа:

```typescript
type T  = string | null
type NN = NonNullable<T>  // → string
```

## Pick\<T, K\>

Выбирает подмножество полей. `K` — string literal или literal union (не переменная):

```typescript
type User = { name: string; age: i32; email: string }

type UserName    = Pick<User, "name">
// → { name: string }

type UserContact = Pick<User, "name" | "email">
// → { name: string; email: string }
```

### Пример: публичный API

```typescript
type User = { id: i32; name: string; email: string; passwordHash: string }
type PublicUser = Pick<User, "id" | "name" | "email">

function getUser(id: i32): PublicUser { ... }
```

## Omit\<T, K\>

Исключает поля. Обратный к `Pick`:

```typescript
type UserPublic  = Omit<User, "passwordHash">
type UserMinimal = Omit<User, "age" | "email">
```

## Record\<K, V\>

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

### Пример: векторы

```typescript
type Vec3 = Record<"x" | "y" | "z", f64>

function normalize(v: Vec3): Vec3 {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
    return { x: v.x / len, y: v.y / len, z: v.z / len }
}
```

## ReturnType\<T\>

Извлекает return type функции. `T` — function type или `typeof function`:

```typescript
function foo(): string { ... }
type R = ReturnType<typeof foo>  // → string
```

## Parameters\<T\>

Параметры функции как tuple:

```typescript
function foo(x: i32, y: string): void { ... }
type P = Parameters<typeof foo>  // → [i32, string]
```

## Awaited\<T\>

Unwrap async/Promise типа (рекурсивно):

```typescript
async function fetchData(): Promise<User> { ... }

type U = Awaited<ReturnType<typeof fetchData>>  // → User
type B = Awaited<Promise<Promise<i32>>>         // → i32
```

## Правило А+Б для generic functions

Utility types в generic functions имеют ограничения:

### А: type alias — всегда разрешён

```typescript
type UserName = Pick<User, "name">       // ✅ ok
type PartialConfig = Partial<Config>     // ✅ ok
```

### Б: utility type в параметре generic function — разрешён

```typescript
function log<T>(obj: Pick<T, "name">): void {  // ✅ ok
    print(obj.name)
}

function merge<T>(base: T, patch: Partial<T>): T {  // ✅ ok
    // компилятор знает конкретный T на call site
}
```

### Запрещено: utility type в return type generic function

```typescript
function pick<T, K extends keyof T>(obj: T, key: K): Pick<T, K>
// ❌ ошибка: Pick с runtime-key в return type невозможен в C
```

**Причина:** `{ [key]: obj[key] }` невозможно в C — нет динамического доступа к полям struct.

## Не поддерживаемые utility types

| Utility | Причина |
|---------|---------|
| `Extract<T, U>` | Требует conditional types |
| `Exclude<T, U>` | Требует conditional types |
| `InstanceType<T>` | Нет constructor type concept |
| `ThisParameterType<T>` | Нет OOP `this` semantics |
| `Uppercase<T>` / `Lowercase<T>` | Template literal types |

## Ошибки

| Код | Ошибка | Решение |
|-----|--------|---------|
| `Pick<User, varName>` | `K must be a string literal or literal union, not a variable` | Используйте строковый литерал |
| `function f<T>(): Pick<T, "x">` | `Pick with runtime-key in return type is not supported in C` | Возвращайте конкретный type alias |
| `Extract<string, "a">` | `Extract is not supported: requires conditional types` | Используйте `Pick` или type alias |

## См. также

- [Type Aliases](./type-aliases.md) — `type`, `keyof`, string literal union
- [Интерфейсы](../04-classes/index.md) — структурная типизация
- [Generics](../04-classes/index.md) — монорфизация дженериков
