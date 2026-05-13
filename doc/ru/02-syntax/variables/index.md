# Переменные: let и const

[← Вверх](../index.md) | [Следующий →](./let.md)

---

В TSClang две формы объявления переменных: `let` (мутабельная) и `const` (иммутабельная). Ключевое отличие от TypeScript — выбор между `let` и `const` влияет не только на возможность переприсвоения, но и на **ownership-семантику**: `const` запрещает move, передачу как `Mut<T>` и вызов `mut`-методов.

## Краткая сводка

| Свойство | `let` | `const` |
|----------|-------|---------|
| Переприсвоение | ✅ | ❌ |
| Вызов `mut`-методов | ✅ | ❌ |
| Передача как `Mut<T>` | ✅ | ❌ |
| Передача как `Ref<T>` | ✅ auto borrow | ✅ auto borrow |
| Move (передача как `T`) | ✅ | ❌ |
| Spread на сложных типах | ✅ move | ❌ (только примитивы — copy) |

## Объявление

```typescript
let counter: i32 = 0         // mutable
const name: string = "Alice" // immutable

// type inference
let x = 42        // i32
const s = "hello"  // string
```

## Ownership-различия

### mut-методы и Mut\<T\>

`const`-переменную нельзя передать в функцию, принимающую `Mut<T>`, и нельзя вызывать на ней `mut`-методы:

```typescript
function foo(c: Mut<Counter>) { c.increment(); }

const c = new Counter();
foo(c);   // error: const cannot be passed as Mut

let c2 = new Counter();
foo(c2);  // ok
```

### Move из const запрещён

Нельзя переместить значение из `const`-переменной — это нарушило бы гарантию иммутабельности:

```typescript
const arr = [user1, user2];
let b = arr;       // error: cannot move out of const
                   // hint: use Shared<T> if shared ownership is needed

const arr2: Shared<User[]> = [user1, user2];
let b2 = arr2;     // ok — retain (refcount++), не move
```

### Матрица передачи аргументов

| Источник ↓ \ Параметр → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `let T` | ✅ auto borrow | ✅ auto mut borrow | ✅ move | ❌ |
| `const T` | ✅ auto borrow | ❌ | ❌ | ❌ |
| `Shared<T>` | ✅ borrow | ❌ | ❌ | ✅ retain |

## For-of и let/const

Поведение `for-of` зависит от объявления loop-переменной:

- `for (const item of arr)` — `Ref<T>` (только чтение)
- `for (let item of arr)` — `Mut<T>`, но **только если источник `let`**

```typescript
const arr = [obj1, obj2];
for (const item of arr) { /* item: Ref<Obj> */ }  // ok
for (let item of arr) { }   // error: источник const
```

## Spread на const

Spread на `const` работает только если элементы — примитивы (copy). Для сложных типов — ошибка:

```typescript
const nums: i32[] = [1, 2, 3];
const copy = [...nums, 4, 5];  // ok — примитивы копируются

const users: User[] = [user1, user2];
const all = [...users];  // error: cannot spread const array of non-primitive type
```

Обходной путь — `Shared<T>`, `let` или `clone()`.

## Подробные страницы

- [let](./let.md) — мутабельные переменные: переприсвоение, mut-методы, Mut\<T\>, for-of
- [const](./const.md) — иммутабельные переменные: ограничения, Shared\<T\>, spread

## См. также

- [Модель памяти](../../05-memory/index.md) — Ownership, borrow checker, Shared\<T\>
- [For-of](../loops/for-of.md) — итерация по коллекциям
- [Spread](../operators/optional.md) — spread-оператор и ownership
