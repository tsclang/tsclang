# Руководство по borrow: Ref<T> и Mut<T>

[← Вверх](./index.md)

---

Это практическое руководство по заимствованию (borrow) в TSClang. Здесь — рабочие примеры, типичные ошибки и как их исправить.

## Что такое borrow

**Borrow** — временный доступ к чужим данным без передачи владения.

- `Ref<T>` — только чтение
- `Mut<T>` — чтение и запись (только один за раз)

```typescript
function printName(u: Ref<User>): void {
    console.log(u.name);   // читаем, но не владеем
}

let user = new User();
user.name = "Alice";
printName(user);           // ✅ borrow — user остаётся валидным
console.log(user.name);    // ✅ можно использовать дальше
```

## Borrow из массива

### ✅ Правильно: borrow элемента

```typescript
const users: User[] = [new User()];
const u: Ref<User> = users[0];   // borrow первого элемента
console.log(u.name);             // ✅ чтение через borrow
```

### ❌ Ошибка: move из массива по индексу

```typescript
const users: User[] = [new User()];
const u = users[0];              // ❌ E009: cannot move out of array by index
```

**Исправление:** используйте `Ref<T>` для borrow или `.remove()` для move:

```typescript
const u: Ref<User> = users[0];   // ✅ borrow
const u = users.remove(0);       // ✅ move + удаление из массива
```

### ❌ Ошибка: мутация массива при активном borrow

```typescript
const users: User[] = [new User()];
const u: Ref<User> = users[0];
users.push(new User());          // ❌ cannot mutate 'users' while borrow is active
```

**Исправление:** ограничьте scope borrow блоком `{}`:

```typescript
const users: User[] = [new User()];
{
    const u: Ref<User> = users[0];
    console.log(u.name);
}   // borrow отпускается
users.push(new User());          // ✅ ok
```

> **Примечание:** borrow на коллекции блокирует мутацию только до конца `{}`-scope, в котором создана переменная-borrow. После выхода из блока мутация снова разрешена.

## Borrow полей объектов

### ❌ Ошибка: borrow поля напрямую

```typescript
class Container {
    user: User;
}
const c = new Container();
const u: Ref<User> = c.user;     // ❌ Cannot borrow a class field
```

**Исправление:** передавайте весь объект в функцию:

```typescript
function getName(c: Ref<Container>): string {
    return c.user.name;          // ✅ доступ внутри функции
}
```

## Возврат borrow из функции

### ❌ Ошибка: возврат borrow на элемент массива

```typescript
function first(arr: Ref<User[]>): Ref<User> {
    return arr[0];               // ❌ Cannot return borrow to array element
}
```

**Причина:** lifetime borrow не может быть выражен без аннотаций (`'a`). Компилятор не может гарантировать, что массив переживёт возвращённый borrow.

**Исправление:** верните owned копию или передайте массив и индекс отдельно:

```typescript
function getName(arr: Ref<User[]>, i: i32): string {
    return arr[i].name;          // ✅ возвращаем строку, не borrow
}
```

## Mut<T>: mutable borrow

### ✅ Правильно: mutable borrow параметра

```typescript
function increment(c: Mut<Counter>): void {
    c.value += 1;
}

let cnt = new Counter();
cnt.value = 0;
increment(cnt);                  // ✅ cnt мутирован
console.log(cnt.value);          // 1
```

### ❌ Ошибка: два Mut одновременно

```typescript
let cnt = new Counter();
const m1: Mut<Counter> = cnt;
const m2: Mut<Counter> = cnt;    // ❌ уже есть активный Mut
```

**Исправление:** используйте один Mut в scope:

```typescript
let cnt = new Counter();
{
    const m: Mut<Counter> = cnt;
    m.value += 1;
}
// m отпущен
```

## Замыкания и borrow

### ✅ Правильно: захват переменной

```typescript
let prefix = "Hello";
const greet = (name: string): string => {
    return prefix + ", " + name; // prefix захвачен как Ref<string>
};
console.log(greet("World"));     // "Hello, World"
```

### ⚠️ Ограничение: замыкание — стековое

```typescript
let greet: (name: string) => string;
{
    let prefix = "Hello";
    greet = (name) => prefix + name;
}   // prefix освобождён
greet("World");                  // ❌ UB: dangling pointer
```

**Как захватываются переменные:**

| Тип переменной | Как захватывается | C-representation |
|---------------|-------------------|------------------|
| Примитив (`i32`, `bool`) | Copy-by-value | `int32_t x;` |
| `string` | Shallow copy (`String` struct) | `String s;` |
| `Ref<T>` / `Mut<T>` | Copy pointer | `const User *u;` / `User *m;` |
| Array / Object | Copy struct | `Array_i32 arr;` |

## Async и borrow

### ❌ Ошибка: borrow через await

```typescript
async function bad(arr: Ref<i32[]>): Promise<void> {
    const r: Ref<i32> = arr[0];
    await sleep(10);             // ❌ Ref<T> cannot live across await
    console.log(r);
}
```

**Исправление:** скопируйте значение перед await:

```typescript
async function ok(arr: Ref<i32[]>): Promise<void> {
    const val: i32 = arr[0];     // ✅ копия примитива
    await sleep(10);
    console.log(val);
}
```

### Сводная таблица поведения borrow по контекстам

| Контекст | Borrow отпускается? | Примечание |
|----------|---------------------|------------|
| Конец `{}` scope | ✅ Да | `_scopeBorrowStack` + `_refBorrowCount` в `pushScope`/`popScope` |
| Конец функции | ✅ Да | Cleanup + отпускание |
| Конец arrow function | ✅ Да | Env struct умирает на стеке |
| Callback после `await` | ❌ Запрещён | `err-ref-across-await` |
| Отложенный callback | ❌ Запрещён по дизайну | Closure — стековое |
| Захват в closure | Copy struct/pointer | Lifetime не отслеживается (ограничение) |

## Сводная таблица ошибок

| Ошибка | Причина | Исправление |
|--------|---------|-------------|
| `cannot move out of array by index` | `arr[i]` без `Ref<T>` | `Ref<T>` или `.remove()` |
| `cannot mutate while borrow is active` | Мутация при активном borrow | Ограничить scope `{}` |
| `Cannot borrow a class field` | `Ref<T>` от `obj.field` | Передать объект целиком |
| `Cannot return borrow to array element` | `return arr[i]` как `Ref<T>` | Вернуть owned значение |
| `already borrowed as Mut` | Два `Mut<T>` одновременно | Один Mut за раз |
| `Ref<T> cannot live across await` | Borrow через await | Скопировать перед await |

## См. также

- [Ref<T>](./ref.md) — immutable borrow
- [Mut<T>](./mut.md) — mutable borrow
- [Borrow checker](./borrow-checker.md) — правила aliasing и lifetime
- [Замыкания](./closures.md) — правила захвата
