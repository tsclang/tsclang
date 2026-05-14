# Ref\<T\> — неизменяемый заём

[← Вверх](./index.md) | [Следующий →](./mut.md) | [Предыдущий ←](./owner.md)

---

`Ref<T>` — **immutable borrow** (неизменяемый заём). Позволяет читать данные без владения, без модификации и без перемещения. Владелец остаётся доступен после вызова.

## Объявление в параметрах

```typescript
function sum(arr: Ref<i32[]>): i32 {
    let total: i32 = 0;
    for (let i: i32 = 0; i < arr.length; i++) {
        total = total + arr[i];
    }
    return total;
}
const data: i32[] = [1, 2, 3];
console.log(sum(data));    // 6
console.log(data.length);  // 3 — data жива
```

`let`-переменная автоматически заимствуется как `Ref<T>` при передаче в функцию. `const`-переменная тоже — но только как `Ref<T>` (никак как `Mut<T>`).

## Borrow из массива

`arr[i]` для сложных типов — только через `Ref<T>`. Move по индексу запрещён:

```typescript
const u: Ref<User> = users[0];     // ✅ borrow
const u = users[0];                // ❌ E009: cannot move out of array by index
const u = users.remove(0);         // ✅ move + удаление из массива
```

> **Примечание:** borrow на коллекции блокирует мутацию только до конца `{}`-scope, в котором создана переменная-borrow. После выхода из блока мутация снова разрешена.

## Несколько Ref одновременно

Несколько неизменяемых заёмов **разрешены** — они не конфликтуют:

```typescript
function len(arr: Ref<i32[]>): i32 {
    return arr.length as i32;
}
const nums: i32[] = [1, 2, 3, 4];
const a = len(nums);   // Ref #1
const b = len(nums);   // Ref #2 — ok
console.log(a + b);    // 8
```

## Чтение полей через Ref

```typescript
class User {
    name: string;
}
function getName(u: Ref<User>): string {
    return u.name;       // ok — read-only доступ
}
let user = new User();
user.name = "Alice";
const n = getName(user);
console.log(n);          // "Alice"
```

## Ограничения

### Нельзя move из Ref

Заём не даёт права на перемещение (move):

```typescript
class Obj { x: i32; }
function take(r: Ref<Obj>): void {
    const o: Obj = r;    // error: cannot move out of "Ref<T>" borrow
}
```

### Нельзя модифицировать

```typescript
function bad(arr: Ref<i32[]>): void {
    arr[0] = 99;         // error: cannot mutate through Ref<T>
}
```

### Нельзя заимствовать поле объекта

`Ref<T>` от поля класса (`obj.field`) — **не поддерживается**. Компилятор не может отследить lifetime поля без аннотаций:

```typescript
const u: Ref<User> = container.user;  // ❌ ошибка: Cannot borrow a class field
```

**Паттерн:** передавать весь объект как `Ref<Container>`:

```typescript
function getName(c: Ref<Container>): string {
    return c.user.name;   // ✅ доступ внутри функции
}
```

### Нельзя вернуть borrow из функции

Возврат `Ref<T>` на элемент массива или поле объекта из функции — запрещён (lifetime не может быть выражен без аннотаций):

```typescript
function first(arr: Ref<User[]>): Ref<User> {
    return arr[0];   // ❌ ошибка: Cannot return borrow to array element
}
```

### Нельзя хранить в полях класса

`Ref<T>` **запрещён** как поле класса — lifetime заёмщика не может пережить владельца:

```typescript
class Container {
    ptr: Ref<i32[]>;     // error: "Ref<T>" cannot be stored in a class field
}
```

**Причина:** компилятор не может гарантировать, что заёмщик не переживёт владельца, если ссылка хранится в поле. Это привело бы к dangling pointer.

### Нельзя мутабельно заимствовать при активном Ref

```typescript
let users: User[] = [new User()];
let u: Ref<User> = users[0];
users.push(new User());  // error: cannot mutate 'users' while a borrow is active
```

## Альтернативы Ref\<T\> в полях

Если нужен «вид» на данные внутри объекта:

1. **Передавайте `Ref<T>` через параметры методов** — auto-borrow делает это удобным
2. **Используйте `{}`-блоки** для тонкого контроля lifetime заёмов
3. **Используйте `Shared<T>`** (desktop only) — разделяемое владение через ARC
4. **Owned-поле** — данные принадлежат объекту (владелец = объект)

## C-output

`Ref<T>` компилируется в `const T*` — указатель на константу:

```typescript
function sum(data: Ref<i32[]>): i32 {
    let total: i32 = 0;
    for (let i: i32 = 0; i < data.length; i++) {
        total = total + data[i];
    }
    return total;
}
const data: i32[] = [1, 2, 3];
console.log(sum(data));
```

```c
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int32_t sum_ref_Array_i32(const Array_i32 *data) {
    int32_t total = 0;
    for (int32_t i = 0; i < data->length; i++) {
        total = total + data->data[i];
    }
    return total;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 data = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%d\n", sum_ref_Array_i32(&data));
    return 0;
}
```

Суффикс `_ref_` в имени функции указывает на immutable borrow. Вызов передаёт `&data` (адрес).

## Ошибки компилятора

| Код | Ошибка | Решение |
|-----|--------|---------|
| `const o: Obj = r` (где `r: Ref<Obj>`) | `cannot move out of "Ref<T>" borrow` | Используйте `let`, а не `const` для owned |
| `arr[0] = 99` (где `arr: Ref<i32[]>`) | `cannot mutate through Ref<T>` | Используйте `Mut<T>` |
| `class C { ptr: Ref<i32[]> }` | `"Ref<T>" cannot be stored in a class field` | Owned-поле или `Shared<T>` |
| `users.push(x)` при активном `Ref` | `cannot mutate 'users' while a borrow is active` | Ограничьте scope заёма блоком `{}` |
| `return arr[0]` (return type `Ref<T>`) | `Cannot return borrow to array element from function` | Возврат borrow на элемент невозможен |
| `const u: Ref<User> = container.user` | `Cannot borrow a class field` | Передайте объект целиком как `Ref<Container>` |

## См. также

- [Mut\<T\>](./mut.md) — мутабельный заём
- [Shared\<T\>](./shared.md) — разделяемое владение (ARC)
- [Weak\<T\>](./weak.md) — слабая ссылка для разрыва циклов
- [let / const](../02-syntax/variables/index.md) — влияние на borrow-семантику
- [Функции: передача аргументов](../02-syntax/functions/declaration.md) — правила передачи Ref/Mut/owned
