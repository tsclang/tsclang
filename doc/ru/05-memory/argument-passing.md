# Передача аргументов в функции

[← Вверх](./index.md) | [Следующий →](./scope-constraint.md) | [Предыдущий ←](./borrow-rules.md)

---

Тип параметра в сигнатуре функции **полностью диктует семантику** на callsite. Явных `&` или `*` не нужно — компилятор определяет поведение по типу.

## Примитивы — всегда copy

Примитивные типы (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) **всегда копируются**, независимо от типа параметра:

```typescript
function foo(x: i32): void { /* ... */ }

let n = 42;
foo(n);     // copy — n жив после вызова
console.log(n);  // → 42
```

## Сложные типы — 4 варианта

```typescript
function toRef(x: Ref<User>): void { ... }        // immutable borrow
function toMut(x: Mut<User>): void { ... }        // mutable borrow
function toOwned(x: User): void { ... }           // move — ownership передан
function toShared(x: Shared<User>): void { ... }  // retain — refcount++
```

### Ref<T> — immutable borrow

Функция получает read-only доступ. Исходная переменная жива после вызова.

```typescript
class User { name: string; }

function getName(u: Ref<User>): string {
    return u.name;
}

let user = new User();
user.name = "Alice";
const n = getName(user);    // auto borrow: user → Ref<User>
console.log(n);             // → "Alice"
console.log(user.name);     // ok — user не тронут
```

C-output:

```c
String getName_ref_User(const User *u) {
    return u->name;
}

int main(void) {
    TSC_INIT();
    User user = {0};
    user.name = STR_LIT("Alice");
    const String n = getName_ref_User(&user);  // &user — const pointer
    printf("%s\n", n.data);
    return 0;
}
```

### Mut<T> — mutable borrow

Функция может изменять объект. Требует `let`-переменную на callsite.

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}

let nums: i32[] = [1, 2, 3];
fill(nums);               // auto mut borrow
console.log(nums[0]);     // → 99
```

C-output:

```c
void fill_mut_Array_i32(Array_i32 *arr) {
    arr->data[0] = 99;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    Array_i32 nums = {.data = _lit_0, .length = 3, .capacity = 3};
    fill_mut_Array_i32(&nums);     // &nums — read-write pointer
    printf("%d\n", nums.data[0]);
    return 0;
}
```

### T (owned) — move

Ownership передаётся функции. Исходная переменная **недоступна** после вызова.

```typescript
class Buffer { data: string; }

function consume(buf: Buffer): void {
    console.log(buf.data);
}

let b = new Buffer();
b.data = "hello";
consume(b);            // move — b больше не валидна
// console.log(b);     // error: use of moved value: "b"
```

C-output:

```c
void consume_Buffer(Buffer buf) {
    printf("%s\n", buf.data.data);
}

int main(void) {
    TSC_INIT();
    Buffer b = {0};
    b.data = STR_LIT("hello");
    consume_Buffer(b);           // struct copied by value — ownership transferred
    return 0;
}
```

### Shared<T> — retain

Refcount увеличивается. Работает только если переменная уже имеет тип `Shared<T>`.

```typescript
let s: Shared<Node> = new Node();
toShared(s);    // retain — refcount++
```

## Матрица совместимости

| Источник ↓ \ Параметр → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `let T`                  | ✅ auto borrow | ✅ auto mut | ✅ move | ❌ |
| `const T`                | ✅ auto borrow | ❌ | ❌ | ❌ |
| `Ref<T>`                 | ✅ re-borrow | ❌ | ❌ | ❌ |
| `Mut<T>`                 | ✅ понижение | ✅ re-borrow | ❌ | ❌ |
| `Shared<T>`              | ✅ borrow | ❌ | ❌ | ✅ retain |

### let → все варианты

```typescript
let u = new User();

toRef(u);      // ok — auto borrow
toMut(u);      // ok — auto mut borrow
toOwned(u);    // ok — move
toShared(u);   // ошибка: u не Shared<T>
```

### const → только Ref

```typescript
const u = new User();

toRef(u);      // ok — auto borrow
toMut(u);      // ошибка: cannot borrow "u" as mutable: it is a const binding
toOwned(u);    // ошибка: cannot move out of "const" binding
```

### Ref<T> → только re-borrow

```typescript
function bar(u: Ref<User>): void {
    toRef(u);      // ok — re-borrow
    toMut(u);      // ошибка: cannot create Mut<T> from Ref<T>
    toOwned(u);    // ошибка: cannot move out of "Ref<T>" borrow
}
```

> **Hint:** если нужно передать owned-значение из `Ref<T>` — используйте `clone()` (при условии что тип реализует `Clone`).

### Mut<T> → Ref или Mut

```typescript
function baz(u: Mut<User>): void {
    toRef(u);      // ok — Mut → Ref (понижение)
    toMut(u);      // ok — re-borrow как Mut
    toOwned(u);    // ошибка: cannot move out of Mut<T>
}
```

Понижение `Mut<T>` → `Ref<T>` безопасно: read-only доступ строго слабее read-write.

### Shared<T> → Ref или Shared

```typescript
function qux(u: Shared<User>): void {
    toRef(u);      // ok — borrow из Shared
    toMut(u);      // ошибка: Shared<T> не даёт Mut (нет эксклюзивного владения)
    toOwned(u);    // ошибка: нельзя move из Shared
    toShared(u);   // ok — retain (refcount++)
}
```

## Ошибки и исправления

### Mut из const

```typescript
function fill(arr: Mut<i32[]>): void { arr[0] = 99; }

const nums: i32[] = [1, 2, 3];
fill(nums);
// cannot borrow "nums" as mutable: it is a const binding
```

Исправление — использовать `let`:

```typescript
let nums: i32[] = [1, 2, 3];
fill(nums);    // ok
```

### Move из Ref

```typescript
class Obj { x: i32; }

function take(r: Ref<Obj>): void {
    const o: Obj = r;    // cannot move out of "Ref<T>" borrow
}
```

Исправление — `clone()`:

```typescript
function take(r: Ref<Obj>): void {
    const o: Obj = r.clone();    // ok — owned copy
}
```

### Move из const

```typescript
class Obj { x: i32; }

const o = new Obj();
const p = o;    // cannot move out of "const" binding
```

Исправление — использовать `let` для передачи ownership:

```typescript
let o = new Obj();
const p = o;    // ok — move из let
```

## См. также

- [Правила Borrow Checker](./borrow-rules.md) — ограничения на одновременные borrow
- [Scope Constraint](./scope-constraint.md) — ограничения lifetime
- [Замыкания](./closures.md) — захват Ref/Mut/owned
- [let](../02-syntax/variables/let.md) / [const](../02-syntax/variables/const.md) — влияние на передачу
