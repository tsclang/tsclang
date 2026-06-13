## Clone

`Clone` — интерфейс для deep copy. Два синтаксиса, одна семантика:

```typescript
interface Clone {
    clone(): this;
}

class User implements Clone {
    name: string;
    age: i32;

    clone(): User {
        return new User(this.name, this.age);
    }
}

let u1 = new User("Alice", 30);
let u2 = structuredClone(u1);  // функциональный стиль
let u3 = u1.clone();           // метод — то же самое
console.log(u1);               // ok — u1 жив
```

- Примитивы и `string` — auto-implement Clone
- Массивы — `clone()` / `structuredClone` работают если элементы реализуют `Clone`
- `Arc<T>` — `structuredClone` создаёт новый независимый объект (deep copy, не retain)
- Spread = всегда copy для всех типов (см. [08-spread-destructuring.md](../08-collections/08-spread-destructuring.md) — spread/destructuring/merge всегда copy)

```typescript
// массивы
let arr = [1, 2, 3];
let arr2 = arr.clone();           // ok — примитивы

let users = [user1, user2];
let users2 = users.clone();       // ok — User implements Clone

let items = [item1, item2];
let items2 = items.clone();       // ошибка: Item does not implement Clone
                                  // hint: implement Clone on Item
```

