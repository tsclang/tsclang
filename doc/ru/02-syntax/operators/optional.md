# Опциональные операторы

[← Вверх](./index.md) | [Следующий →](./precedence.md) | [Предыдущий ←](./bitwise.md)

---

Специальные операторы для безопасной работы с nullable-значениями и создания новых коллекций.

## Операторы

| Оператор | Описание |
|----------|----------|
| `?.` | Optional chaining — безопасный доступ к полю/методу |
| `??` | Nullish coalescing — дефолтное значение при `null` |
| `...` | Spread — развёртывание массивов и объектов |

---

## Optional chaining `?.`

Позволяет безопасно обращаться к свойствам и методам nullable-объектов. Если любой элемент в цепочке равен `null`, весь результат — `null`:

```typescript
const name = user?.profile?.name;              // string | null
const len  = user?.tags?.length;               // i32 | null
const upper = user?.getName()?.toUpperCase();  // string | null
```

Тип результата `?.` всегда nullable — `T | null`:

```typescript
let user: User | null = getUser();
const name: string | null = user?.name;   // string | null, не string

// без ?. нужен явный null-check:
if (user !== null) {
    const name = user.name;               // string
}
```

`?.` работает с:

- Свойствами: `obj?.field`
- Методами: `obj?.method()`
- Индексацией: `arr?.[index]`

```typescript
const items: i32[] | null = getItems();
const first: i32 | null = items?.[0];     // i32 | null

const fn: (() => void) | null = getCallback();
fn?.();                                   // вызов только если fn не null
```

### C-output для `?.`

```c
// const name = user?.profile?.name;
String* name = (user != NULL && user->profile != NULL)
    ? user->profile->name
    : NULL;
```

---

## Nullish coalescing `??`

Возвращает правый операнд, если левый равен `null`. Подробное описание — в разделе [Логические операторы](./logical.md).

```typescript
const name = user?.name ?? "Anonymous";       // string
const age  = user?.age ?? 0;                  // i32
const city = user?.address?.city ?? "Unknown"; // string
```

---

## Spread `...`

Spread развёртывает элементы массива или поля объекта. **Spread потребляет источник** (move).

### Массивы

```typescript
let a: i32[] = [1, 2, 3];
let b: i32[] = [4, 5];

const combined: i32[] = [...a, ...b, 6];   // [1, 2, 3, 4, 5, 6]
// a — перемещена, использовать нельзя

// вставка в середину
let prefix: i32[] = [1, 2];
let suffix: i32[] = [5, 6];
const full = [...prefix, 3, 4, ...suffix]; // [1, 2, 3, 4, 5, 6]
```

### Объекты

```typescript
let base = { x: 1, y: 2, name: "origin" };
const extended = { ...base, z: 3 };        // { x: 1, y: 2, name: "origin", z: 3 }
// base — перемещён
```

Поздние поля перезаписывают ранние:

```typescript
let defaults = { timeout: 3000, retries: 3 };
const config = { ...defaults, retries: 5 };  // timeout: 3000, retries: 5
```

### Spread и `const`

Spread на `const` разрешён **только если элементы — примитивы** (копируются). Для сложных типов — ошибка:

```typescript
// примитивы — const ok (copy)
const nums: i32[] = [1, 2, 3];
const copy = [...nums, 4];         // ok — i32 копируется
console.log(nums.length);          // ok — nums жив

// сложные типы — const ошибка (move невозможен)
const admins: User[] = [user1, user2];
const all = [...admins, guest];    // error: cannot spread const array of non-primitive type
                                   // hint: use let, Shared<T>, or [...admins.clone()]
```

### Spread и `Shared<T>`

`Shared<T>` (ARC) — retain при spread, не move. Можно спредить из `const`:

```typescript
const base: Shared<Item[]> = [item1, item2];
const listA = [...base, itemA];    // ok — retain
const listB = [...base, itemB];    // ok — retain
```

---

## C-output для spread

```c
// const combined = [...a, ...b, 6];
Array_i32 combined = tsc_array_new_i32(6);
tsc_array_push_i32(&combined, a.data[0]);
tsc_array_push_i32(&combined, a.data[1]);
tsc_array_push_i32(&combined, a.data[2]);
tsc_array_push_i32(&combined, b.data[0]);
tsc_array_push_i32(&combined, b.data[1]);
tsc_array_push_i32(&combined, 6);
tsc_array_drop(&a);   // source consumed
tsc_array_drop(&b);   // source consumed
```

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot spread const array of non-primitive type` | Spread `const` со сложными элементами |
| `cannot spread const object` | Spread `const`-объекта |
| `use of moved variable` | Использование источника после spread |
| `Object possibly null` | Вызов метода через `.` на nullable без `?.` |

## См. также

- [Логические операторы](./logical.md) — `??`, `&&`, `||`
- [Truthy / Falsy](../truthy-falsy.md) — nullable-типы и сужение
- [Модель памяти](../../05-memory/index.md) — ownership, move, `Shared<T>`
