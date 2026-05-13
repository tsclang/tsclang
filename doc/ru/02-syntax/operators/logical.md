# Логические операторы

[← Вверх](./index.md) | [Следующий →](./bitwise.md) | [Предыдущий ←](./comparison.md)

---

Логические операторы `&&`, `||` и `??` ведут себя как в JavaScript — возвращают **сам операнд**, а не `boolean`. Исключение: `!` всегда возвращает `bool`.

## Операторы

| Оператор | Описание | Возвращает |
|----------|----------|------------|
| `&&` | Логическое И — первый falsy или последний | Тип операнда |
| `\|\|` | Логическое ИЛИ — первый truthy или последний | Тип операнда |
| `!` | Логическое НЕ — инвертирует truthiness | `bool` |
| `??` | Nullish coalescing — правый если левый `null` | Тип операнда |

---

## `&&` — логическое И

Возвращает **первый falsy** операнд или **последний**, если все truthy:

```typescript
const a: string = "hello";
const b: string = "";

a && "exists"         // "exists" — a truthy, возвращается правый
b && "exists"         // "" — b falsy, возвращается b
"" && 0 && null       // "" — первый falsy
"yes" && 42           // 42 — все truthy, возвращается последний
```

Type narrowing после `&&`:

```typescript
let s: string | null = getValue();
if (s && s.length > 0) {
    // s: string — после && компилятор знает что s не null
}
```

## `||` — логическое ИЛИ

Возвращает **первый truthy** операнд или **последний**, если все falsy:

```typescript
const name: string = "";
const port: i32 = 0;

name || "Anonymous"    // "Anonymous" — "" falsy
port || 8080           // 8080 — 0 falsy
"hello" || "fallback"  // "hello" — первый truthy
null || 0 || false     // false — все falsy, последний
```

## `!` — логическое НЕ

Унарный оператор, возвращает `bool`. Инвертирует truthiness:

```typescript
const flag: bool = true;
!flag                  // false

const s: string = "";
!s                     // true — "" falsy, инверсия = true

const n: i32 = 42;
!n                     // false — 42 truthy, инверсия = false
```

## `??` — nullish coalescing

Возвращает правый операнд, если левый равен `null`. **Не реагирует** на `0`, `""`, `false` — в отличие от `||`:

```typescript
let val: i32 | null = null;
val ?? 99              // 99 — val is null

let count: i32 | null = 0;
count ?? 99            // 0 — count is not null, even though 0 is falsy

let label: string | null = "";
label ?? "default"     // "" — empty string is not null
```

### `??` vs `||`

```typescript
// || — реагирует на все falsy (0, "", false, null)
let port: i32 | null = 0;
port || 8080           // 8080 — 0 is falsy
port ?? 8080           // 0    — 0 is not null

// ?? — реагирует только на null
let name: string | null = "";
name || "default"      // "default" — "" is falsy
name ?? "default"      // ""        — "" is not null
```

### Borrow checker и `??`

После `lhs ?? rhs` переменная `lhs` сужается до `null` — либо была null, либо была moved в результат. Использование `lhs` после `??` — ошибка:

```typescript
let s: string | null = getString();
const result = s ?? "default";
// s сужена до null

s.length              // error: s is null
if (s !== null) {}    // warning: condition always false
```

Для повторного использования — клонируйте до `??`:

```typescript
const result = s.clone() ?? "default";
// s жива, result — отдельная копия
```

---

## Смешивание `??` с `&&` / `||`

`??` нельзя смешивать с `||` или `&&` без явных скобок — ошибка компилятора:

```typescript
a || b ?? c           // error: mixing || and ?? requires parentheses
a && b ?? c           // error: mixing && and ?? requires parentheses

(a || b) ?? c         // ok
a || (b ?? c)         // ok
```

Это предотвращает неоднозначность: `a || b ?? c` может означать и `a || (b ?? c)`, и `(a || b) ?? c` — результаты различаются.

---

## C-output

```c
// a || b (complex type — pointer)
String result = (a != NULL) ? a : b;

// a || b (primitive)
int32_t result = (a != 0) ? a : b;

// a && b
String result = (a != NULL) ? b : a;

// !a (string — non-nullable)
bool result = !(a->length > 0);

// a ?? b (primitive — struct)
int32_t result = a.has_value ? a.value : b;

// a ?? b (complex type — pointer, move)
String result = (s != NULL) ? *s : (String){ "default", 7, 0 };
s = NULL;
```

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `mixing \|\| and ?? without parentheses` | `\|\|` и `??` без скобок |
| `mixing && and ?? without parentheses` | `&&` и `??` без скобок |
| `use of moved variable` | Использование после `??` (move) |

## См. также

- [Операторы сравнения](./comparison.md) — `===`, `!==`, `<`, `>`
- [Опциональные операторы](./optional.md) — `?.`, `??`, spread
- [Truthy / Falsy](../truthy-falsy.md) — правила truthiness
