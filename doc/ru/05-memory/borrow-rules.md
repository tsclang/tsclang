# Правила Borrow Checker

[← Вверх](./index.md) | [Следующий →](./argument-passing.md) | [Предыдущий ←](./weak.md)

---

Borrow checker гарантирует безопасность памяти на этапе компиляции. Три правила контролируют, как `Ref<T>` и `Mut<T>` могут сосуществовать.

## Правило 1: Нельзя два Mut одновременно

На один объект может быть активен только **один** `Mut<T>` за раз. Это исключает data races и aliasing-баги.

```typescript
class Box {
    x: i32;
}

let b = new Box();
b.x = 1;

function take(m: Mut<Box>): void { m.x = 2; }
function take2(m: Mut<Box>): void { m.x = 3; }

take(b);
take2(b);   // error: sequential calls ok — borrow released after take()
```

Ошибка возникает при **одновременном** существовании двух `Mut<T>`:

```typescript
let b = new Box();
b.x = 1;

function take(m: Mut<Box>): void { m.x = 2; }
function take2(m: Mut<Box>): void { m.x = 3; }

take(b);
take2(b);   // TypeError: Cannot create two simultaneous mutable borrows of 'b'
```

> **Примечание:** последовательные вызовы `take(b)`, затем `take2(b)` — допустимы. Borrow живёт только на время вызова функции, после чего освобождается.

### C-output: последовательные Mut-вызовы

```typescript
class Box { x: i32; }
function mutate(m: Mut<Box>): void { m.x = 2; }
let b = new Box();
b.x = 1;
mutate(b);
mutate(b);
console.log(b.x);
```

```c
#include "runtime.h"

typedef struct { int32_t value; } Box;

void mutate_mut_Box(Box *m) {
    m->x = 2;
}

int main(void) {
    TSC_INIT();
    Box b = {0};
    b.x = 1;
    mutate_mut_Box(&b);
    mutate_mut_Box(&b);
    printf("%d\n", b.x);    // 2
    return 0;
}
```

Каждый вызов передаёт `&b` — указатель на один и тот же объект. Между вызовами borrow неактивен.

## Правило 2: Нельзя Mut + Ref одновременно

Пока существует `Ref<T>`, создать `Mut<T>` на тот же объект нельзя — и наоборот.

```typescript
class Box {
    x: i32;
}

let b = new Box();
b.x = 1;

function mutate(m: Mut<Box>): void { m.x = 2; }
function read(r: Ref<Box>): i32 { return r.x; }

const r = read(b);
mutate(b);          // TypeError: Cannot create mutable borrow of 'b'
                    //         while immutable borrow is active
console.log(r);
```

Ошибка: `r` держит `Ref<Box>` (результат `read` может ссылаться на `b`), а `mutate(b)` пытается создать `Mut<Box>`.

### Исправление: использовать borrow до мутации

```typescript
let b = new Box();
b.x = 1;

function mutate(m: Mut<Box>): void { m.x = 2; }
function read(r: Ref<Box>): i32 { return r.x; }

console.log(read(b));    // Ref-borrow: создан и отпущен
mutate(b);               // Mut-borrow: ok — нет активных Ref
```

### C-output: Ref и Mut по очереди

```typescript
class Counter { value: i32; }
function increment(c: Mut<Counter>): void { c.value += 1; }
function read(c: Ref<Counter>): i32 { return c.value; }

let cnt = new Counter();
cnt.value = 0;
increment(cnt);
increment(cnt);
console.log(read(cnt));
```

```c
#include "runtime.h"

typedef struct { int32_t value; } Counter;

void increment_mut_Counter(Counter *c) {
    c->value += 1;
}

int32_t read_ref_Counter(const Counter *c) {
    return c->value;
}

int main(void) {
    TSC_INIT();
    Counter cnt = {0};
    cnt.value = 0;
    increment_mut_Counter(&cnt);    // Mut — read-write pointer
    increment_mut_Counter(&cnt);
    printf("%d\n", read_ref_Counter(&cnt));  // Ref — const pointer
    return 0;
}
```

Name mangling: `_mut_` для `Mut<T>`, `_ref_` для `Ref<T>`.

## Правило 3: Можно несколько Ref одновременно

Несколько `Ref<T>` на один объект — безопасно, потому что все они read-only.

```typescript
function len(arr: Ref<i32[]>): i32 {
    return arr.length as i32;
}

const nums: i32[] = [1, 2, 3, 4];
const a = len(nums);    // Ref-borrow #1
const b = len(nums);    // Ref-borrow #2 — ok
console.log(a + b);     // → 8
```

### C-output: несколько Ref

```c
#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int32_t len_ref_Array_i32(const Array_i32 *arr) {
    return (int32_t)arr->length;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4};
    const Array_i32 nums = {.data = _lit_0, .length = 4, .capacity = 4};
    const int32_t a = len_ref_Array_i32(&nums);   // &nums — const pointer
    const int32_t b = len_ref_Array_i32(&nums);   // &nums — ещё один const pointer
    printf("%d\n", a + b);
    return 0;
}
```

Оба вызова передают `&nums` (const pointer). Чтение не меняет данные — конфликтов нет.

## Мутация коллекции при активном borrow

Borrow элемента = borrow всей коллекции. Мутация коллекции пока жив хотя бы один `Ref<T>` — ошибка.

```typescript
class User { name: string; }

let users: User[] = [new User()];
let u: Ref<User> = users[0];   // borrow на users
users.push(new User());         // cannot mutate 'users' while a borrow is active
```

### Исправление: ограничить scope borrow'а

```typescript
let users: User[] = [new User()];
{
    let u: Ref<User> = users[0];   // borrow начинается
    console.log(u.name);
}                                  // borrow заканчивается
users.push(new User());            // ok — нет активных borrow
```

## Сводная таблица

| Ситуация | Разрешено? |
|----------|-----------|
| Один `Mut<T>` | ✅ |
| Два `Mut<T>` одновременно | ❌ |
| Один `Ref<T>` | ✅ |
| Несколько `Ref<T>` одновременно | ✅ |
| `Mut<T>` + `Ref<T>` одновременно | ❌ |
| `Ref<T>` на коллекцию + мутация коллекции | ❌ |
| Последовательные borrow (один отпущен, другой создан) | ✅ |

## См. также

- [Передача аргументов](./argument-passing.md) — как Ref/Mut/owned передаются в функции
- [Scope Constraint](./scope-constraint.md) — ограничения lifetime для Ref/Mut
- [Auto Drop](./auto-drop.md) — автоматическое освобождение памяти
- [Замыкания](./closures.md) — захват Ref/Mut в замыканиях
- [let / const](../02-syntax/variables/let.md) — влияние на borrow-правила
