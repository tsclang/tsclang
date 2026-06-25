## For-of цикл

> **Подробная спецификация for-of** — в [05-for-of-iteration.md](05-for-of-iteration.md).

`const`/`let` в for-of означают то же, что и везде в языке:

- `const item` — нельзя менять `item`
- `let item` — можно менять `item`

Семантика `item` зависит от типа элемента (Copy vs Borrow), не от цикла:

| Тип элемента | `item` в C | `const item` | `let item` |
|-------------|-----------|-------------|-----------|
| Primitive | Copy | `const T item = arr.data[i]` | `T item = arr.data[i]` (mutable local) |
| String | ARC Copy | `const String item = arr.data[i]` | `String item = arr.data[i]` (mutable local) |
| Class | Borrow | `const T *item = &arr.data[i]` | `T *item = &arr.data[i]` (mutable pointer) |
| Array\<U\> | Borrow | `const T *item = &arr.data[i]` | `T *item = &arr.data[i]` (mutable pointer) |

```typescript
let arr = [obj1, obj2, obj3];

for (const item of arr) {    // ok — item: const T* (immutable borrow)
    item.doSomething();       // ok — чтение
    item.mutMethod();         // ошибка — const pointer
}

for (let item of arr) {      // ok — item: T* (mutable borrow)
    item.mutMethod();         // ok — изменения попадают в arr
    arr.push(obj4);           // ошибка — arr заимствован во время итерации
}
```

`const` честнее чем TypeScript — для классов `const item` запрещает мутацию полей (в TS разрешает):

```typescript
for (const item of users) {
    item.age = 99;     // ❌ compile error: const pointer, field mutation forbidden
    // В TypeScript этот код бы работал — TSClang строже
}
```

**const source + let binding — зависит от типа:**

```typescript
const scores = [10, 20, 3];
for (let item of scores) {    // ✅ ok — item = Copy, arr не затронут
    item = item * 2;
}

const users = [user1, user2];
for (let item of users) {     // ❌ error: cannot obtain Mut<T> from const source
    item.age = 99;            //    hint: use 'const item' or change source to 'let'
}
```

**Мутация через `let item` для классов — попадает в массив:**

```typescript
let arr = [obj1, obj2, obj3];
for (let item of arr) {
    item.field = 42;   // ok — мутирует элемент массива через pointer
}
```

**Примитивы — `item` всегда копия, мутация локальна:**

```typescript
let nums = [1, 2, 3];
for (let item of nums) {
    item = item * 2;   // ok — меняет локальную копию, nums не затронут
}

// чтобы изменить элементы массива — используй индекс:
for (let i = 0; i < nums.length; i++) {
    nums[i] = nums[i] * 2;  // ok — мутирует массив
}
```

