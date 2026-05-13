# Clone — глубокое копирование

[← Вверх](./index.md) | [Следующий →](./type-aliases.md) | [Предыдущий ←](./tuples.md)

---

`Clone` — интерфейс для явного глубокого копирования (deep copy) owned-значений. TSClang не копирует сложные типы автоматически — нужен явный вызов `clone()` или `structuredClone()`.

## Интерфейс Clone

```typescript
interface Clone {
    clone(): this;
}
```

Тип реализует `Clone` явно через `implements`:

```typescript
class User implements Clone {
    name: string;
    age: i32;

    clone(): User {
        return new User(this.name, this.age);
    }
}
```

## Использование

Два синтаксиса, одна семантика:

```typescript
let u1 = new User("Alice", 30);

// Метод — OOP-стиль
let u2 = u1.clone();

// Функция — функциональный стиль
let u3 = structuredClone(u1);

console.log(u1.name);  // ok — u1 жив
console.log(u2.name);  // ok — u2 независимая копия
console.log(u3.name);  // ok — u3 независимая копия
```

### C-output

```c
User* User_clone(const User* self) {
    User* copy = User_new();
    copy->name = String_clone(self->name);
    copy->age = self->age;
    return copy;
}

// u2 = u1.clone()
User* u2 = User_clone(u1);

// u3 = structuredClone(u1) — генерирует тот же вызов
User* u3 = User_clone(u1);
```

## Авто-реализация для примитивов и string

Примитивы (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) и `string` автоматически реализуют `Clone` — вызывать `implements Clone` не нужно:

```typescript
let s: string = "hello";
let s2 = s.clone();    // ok — string auto-implements Clone

let x: i32 = 42;
let y = x.clone();     // ok — примитив auto-implements Clone (возвращает copy)
```

> **Примечание:** для примитивов `clone()` — просто копирование значения (они и так copy-семантика). Для `string` — heap-allocation нового буфера и `memcpy`.

## Массивы

`clone()` на массиве работает если элементы реализуют `Clone`:

```typescript
// Примитивы — auto-Clone
let arr = [1, 2, 3];
let arr2 = arr.clone();           // ok — i32 auto-Clone

// Пользовательский тип с Clone
let users = [user1, user2];
let users2 = users.clone();       // ok — User implements Clone

// Без Clone — ошибка
let items = [item1, item2];
let items2 = items.clone();
// ошибка: Item does not implement Clone
// hint: implement Clone on Item
```

### C-output

```c
// arr.clone() — массив примитивов
Array_i32 arr2 = Array_i32_clone(&arr);
// → malloc + memcpy

// users.clone() — массив объектов с Clone
Array_User users2 = Array_User_clone(&users);
// → malloc + clone каждого элемента
```

## Shared\<T\>

`structuredClone` на `Shared<T>` создаёт **полный независимый deep copy** — не retain:

```typescript
let arc: Shared<Node> = new Node();
arc.value = 42;

let deep = structuredClone(arc);  // новый объект, refcount = 1
// arc.refcount остаётся 1, deep.refcount = 1
// это не retain — это настоящая deep copy
```

`clone()` на `Shared<T>` делает retain (как обычно):

```typescript
let arc2 = arc.clone();  // retain — refcount = 2
```

| Метод | Поведение | refcount |
|-------|-----------|----------|
| `arc.clone()` | Retain (ARC) | +1 |
| `structuredClone(arc)` | Deep copy (новый объект) | новый объект = 1 |

## Ошибки

| Код | Ошибка | Решение |
|-----|--------|---------|
| `items.clone()` без `Clone` на `Item` | `Item does not implement Clone` | Добавьте `implements Clone` и метод `clone()` |
| `structuredClone(x)` где `x: Ref<T>` | `cannot clone borrowed value` | Владейте значением (`let x = ...`) или сначала получите owned |
| `obj.clone()` на классе без `Clone` | `Class 'Foo' does not implement Clone` | Реализуйте интерфейс `Clone` |

## См. также

- [Owner (T)](../05-memory/owner.md) — move vs clone
- [Shared\<T\>](../05-memory/shared.md) — ARC и deep copy через structuredClone
- [Массивы](./index.md) — clone на массивах
- [Type Aliases](./type-aliases.md) — `type` с structural Clone
