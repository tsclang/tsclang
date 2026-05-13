# const — иммутабельные переменные

[← Вверх](./index.md) | [Предыдущий ←](./let.md)

---

Ключевое слово `const` объявляет **иммутабельную** переменную. Значение нельзя переприсвоить, а для сложных типов дополнительно запрещены: вызов `mut`-методов, передача как `Mut<T>` и move.

## Объявление

```typescript
const x: i32 = 42
const name = "Alice"       // type inference: string
const arr: i32[] = [1, 2, 3]
const user = new User("Bob")
```

`const` обязателен с инициализатором — нельзя объявить без значения:

```typescript
const x: i32           // error: const declaration requires initializer
const x: i32 = 0       // ok
```

## Чего нельзя с const

### Переприсвоение

```typescript
const x = 10
x = 20    // error: cannot assign to const variable
```

### Вызов mut-методов

```typescript
class Counter {
    private val: i32 = 0
    mut increment(): void { this.val++ }
    get(): i32 { return this.val }
}

const c = new Counter()
c.increment()    // error: cannot call mut method on const variable
c.get()          // ok — immutable method
```

### Передача как Mut\<T\>

```typescript
function increment(c: Mut<Counter>): void {
    c.increment()
}

const c = new Counter()
increment(c)    // error: const cannot be passed as Mut<Counter>

let c2 = new Counter()
increment(c2)   // ok
```

### Move из const

Нельзя передать `const`-переменную как owned (`T`) — это потребовало бы move:

```typescript
function process(data: User[]): void { /* consumes data */ }

const users = [user1, user2]
process(users)    // error: cannot move out of const

let users2 = [user1, user2]
process(users2)   // ok — move, users2 недоступна после
```

Нельзя также присвоить `const` в `let`-переменную для сложных типов:

```typescript
const arr = [user1, user2]
let b = arr       // error: cannot move out of const
                   // hint: use Shared<T> if shared ownership is needed
```

## Что можно с const

### Чтение полей

```typescript
const user = new User("Alice", 30)
console.log(user.name)    // ok — Ref<string> (borrow)
console.log(user.age)     // ok — i32 (copy)
```

### Передача как Ref\<T\>

`const` автоматически заимствуется как `Ref<T>`:

```typescript
function logName(u: Ref<User>): void {
    console.log(u.name)
}

const user = new User("Alice")
logName(user)    // ok — auto immutable borrow
console.log(user) // ok — user жива
```

### Вызов immutable методов

```typescript
const arr = [1, 2, 3]
arr.length       // ok — 3
arr[0]           // ok — 1 (Ref<i32> для сложных, copy для примитивов)
```

## Spread на const

Spread **потребляет** источник (move). Для `const` это разрешено только если элементы — примитивы (copy):

### Примитивы — разрешено (copy)

```typescript
const nums: i32[] = [1, 2, 3]
const copy = [...nums, 4, 5]   // ok — i32 is Copy
console.log(nums)              // ok — nums жив
```

C-output:

```c
int32_t* nums = /* ... */;
int32_t copy[] = { nums[0], nums[1], nums[2], 4, 5 };
// nums not consumed — elements are copied
```

### Сложные типы — запрещено (move невозможен)

```typescript
const admins: Admin[] = [admin1, admin2]
const users = [...admins]
// error: cannot spread const array of non-primitive type
// hint: use let, Shared<T>, or [...admins.clone()] if Admin implements Clone
```

### Объекты — запрещено

```typescript
const base = { x: 1, name: "Alice" }
const extended = { ...base, extra: 42 }
// error: cannot spread const object
// hint: use let, Shared<T>, or { ...base.clone(), extra: 42 } if type implements Clone
```

## Shared\<T\> — обход ограничения

Если нужно, чтобы несколько переменных ссылались на одни данные, используйте `Shared<T>` (ARC):

```typescript
const arr: Shared<User[]> = [user1, user2]
let b = arr       // ok — retain (refcount++), не move

const listA = [...arr, userA]   // ok — retain
const listB = [...arr, userB]   // ok — retain

console.log(arr)   // ok — Shared жива пока refcount > 0
```

C-output для `Shared<T>` retain:

```c
UserArray* arr = /* ... */;
RC_retain(arr);      // refcount++
UserArray* b = arr;  // same pointer
// arr and b share ownership — freed when refcount hits 0
```

> `Shared<T>` доступна только на desktop (требует heap и ARC). На embedded — используйте `Ref<T>` через параметры функций.

## C-output: объявление const

```typescript
const x: i32 = 42
const name: string = "Alice"
const user = new User("Bob")
```

```c
const int32_t x = 42;
const String name = { .data = "Alice", .length = 5, .capacity = 0 };
// user — const pointer, mut methods compile-time blocked
User* const user = User_new(&(String){ .data = "Bob", .length = 3, .capacity = 0 });
```

## Ошибки компилятора

| Код | Ошибка | Подсказка |
|-----|--------|-----------|
| `const c = new Counter(); foo(c)` | `const cannot be passed as Mut` | Используйте `let` |
| `const arr = [...]; let b = arr` | `cannot move out of const` | Используйте `Shared<T>` |
| `const arr = [...obj];` | `cannot spread const array of non-primitive type` | Используйте `let`, `Shared<T>` или `clone()` |
| `const x: i32` | `const declaration requires initializer` | Добавьте инициализатор |

## См. также

- [let](./let.md) — мутабельные переменные
- [Модель памяти](../../05-memory/index.md) — Shared\<T\>, ARC, Weak\<T\>
- [Spread](../operators/optional.md) — spread-оператор и ownership
- [For-of](../loops/for-of.md) — семантика `const` в циклах
