# Truthy / Falsy

[← Вверх](./index.md) | [Следующий →](./variables/index.md) | [Предыдущий ←](./formatting.md)

Правила приведения значений к `bool` — как в JavaScript, но **без** `undefined` и `NaN`:

| Тип | Falsy | Truthy |
|-----|-------|--------|
| `boolean` | `false` | `true` |
| numeric (`i8`..`f64`) | `0` | any non-zero |
| `string` | `""` (пустая) | любая непустая |
| `T \| null` (complex type) | `null` | non-null |
| `T \| null` (primitive) | `null` **или** falsy-значение | non-null **и** truthy |
| class / type / interface | никогда (всегда truthy) | всегда |
| array / Set / Map | никогда (всегда truthy, даже пустые) | всегда |

## Примеры

```typescript
if ("")    { }  // falsy
if ("hi")  { }  // truthy
if (0)     { }  // falsy
if (42)    { }  // truthy
if (null)  { }  // falsy

// string | null — truthy если не null И не ""
let s: string | null = getValue();
if (s) {
    // s: string (not null and not empty)
}

// i32 | null — truthy если не null И не 0
let n: i32 | null = getValue();
if (n) {
    // n: i32 (not null and not 0)
}

// class — всегда truthy (non-null by definition)
let u = new User("Alice");
if (u) { }  // always truthy — compiler warning: condition always true

// array / Set / Map — всегда truthy, даже пустые
let arr: i32[] = [];
if (arr) { }  // truthy — warning: condition always true
              // to check emptiness use arr.length === 0
```

## Narrowing через truthy/falsy

Проверка в `if` сужает тип:

```typescript
let s: string | null = getValue();
if (s) {
    console.log(s.length);  // s: string — not null, not ""
} else {
    // s: string | null, but definitely null or ""
}
```

## C-output для truthy-проверок

```c
// string | null
if (s != NULL && s->length > 0) { ... }

// i32 | null (struct)
if (x.has_value && x.value != 0) { ... }

// string (non-nullable)
if (s->length > 0) { ... }
```

---

## Nullable-типы

### Синтаксис `T | null`

Любой тип может быть помечен как nullable через объединение с `null`:

```typescript
let name: string | null = null;
let age: i32 | null = null;
let user: User | null = null;
```

Представление в C зависит от категории типа:

- **Complex types** (строки, классы, интерфейсы) → указатель `T*`, `NULL` означает `null`. Бесплатно.
- **Primitives** (`i32`, `f64`, `bool`, …) → структура `struct { bool has_value; T value; }`.

> **Overhead:** `i32 | null` занимает 8 байт вместо 4 из-за выравнивания. Для горячих путей с большими массивами nullable-примитивов используйте sentinel-значения вручную.

### Сахар `?`

Суффикс `?` эквивалентен `| null`:

```typescript
let name: string? = null;       // string | null
let age: i32? = null;           // i32 | null
let items: string[]? = null;    // string[] | null
function find(id: i32): User? { /* ... */ }
```

### Сужение типа после null-проверки

```typescript
let s: string | null = getValue();
if (s != null) {
    console.log(s.length);  // s: string
} else {
    // s: null
}
```

---

## Optional chaining `?.`

Позволяет безопасно обращаться к свойствам и методам nullable-объектов. Если любой элемент в цепочке равен `null`, результат всего выражения — `null`.

```typescript
const name = user?.profile?.name;         // string | null
const len  = user?.tags?.length;          // i32 | null
const upper = user?.getName()?.toUpperCase();
```

Тип результата `?.` всегда nullable: `T | null`.

## Nullish coalescing `??`

Оператор `??` возвращает правый операнд, если левый равен `null`:

```typescript
const name = user.name ?? "Anonymous";   // string
const age  = user.age ?? 0;              // i32
const city = user?.address?.city ?? "Unknown";
```

Правый операнд `??` должен иметь тип `T` в выражении `T | null`.

### Borrow checker и `??`

После `lhs ?? rhs` тип `lhs` сужается до `null`. Использование `lhs` после `??` как non-null — ошибка.

```typescript
let s: string | null = getString()
const result = s ?? "default"
// after: s is null, result: string (owned)

s.length          // error: s is null
if (s != null) {} // compiler warns: always false
```

Для повторного использования значения — клонируйте до `??`:

```typescript
const result = s.clone() ?? "default"
```

### C-output для `??`

```c
// Primitive (struct):
int32_t y = x.has_value ? x.value : 0;

// Complex type (pointer) — move:
String result = s != NULL ? *s : (String){ "default", 7, 0 };
s = NULL;
```

---

## См. также

- [Логические операторы](./operators/logical.md) — `&&`, `||`, `!`
- [Опциональные операторы](./operators/optional.md) — `?.`, `??`, spread
- [Модель памяти](../../05-memory/index.md) — ownership и borrow checker
