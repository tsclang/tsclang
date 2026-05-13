# let — мутабельные переменные

[← Вверх](./index.md) | [Следующий →](./const.md)

---

Ключевое слово `let` объявляет **мутабельную** переменную. Значение можно переприсвоить, а для сложных типов — вызывать `mut`-методы и передавать как `Mut<T>`.

## Объявление

```typescript
let x: i32 = 10
let name = "Alice"   // type inference: string
let arr: i32[] = []
```

## Переприсвоение

Значение `let`-переменной можно изменить:

```typescript
let x = 10
x = 20        // ok

let s = "hello"
s = "world"   // ok — старое значение "hello" освобождается (drop)
```

Для сложных типов присвоение нового значения автоматически освобождает предыдущее:

```c
// let s = "hello"; s = "world";
String s = { .data = "hello", .length = 5, .capacity = 0 };
String_drop(&s);   // free old value
s = (String){ .data = "world", .length = 5, .capacity = 0 };
```

## mut-методы

На `let`-переменных разрешено вызывать методы, объявленные с модификатором `mut`:

```typescript
class Counter {
    private val: i32 = 0
    mut increment(): void { this.val++ }
    get(): i32 { return this.val }
}

let c = new Counter()
c.increment()    // ok — c is let
c.increment()    // ok

const c2 = new Counter()
c2.increment()   // error: cannot call mut method on const variable
```

## Передача как Mut\<T\>

`let`-переменная автоматически заимствуется как `Mut<T>` при передаче в функцию:

```typescript
function push(arr: Mut<i32[]>, val: i32): void {
    arr.push(val)
}

let data = [1, 2, 3]
push(data, 4)        // ok — auto mutable borrow
console.log(data)    // [1, 2, 3, 4] — data жива после вызова
```

Во время активного `Mut<T>` borrow исходная переменная недоступна:

```typescript
let data = [1, 2, 3]
let r: Mut<i32[]> = data   // active Mut borrow
data.push(4)               // error: data already borrowed as Mut
```

## Move (передача как T)

`let`-переменная передаётся по значению (move) когда параметр имеет тип `T` (owned):

```typescript
function process(data: User[]): void { /* ... */ }

let users = [user1, user2]
process(users)
console.log(users)   // error: users перемещён
```

C-output для move:

```c
UserArray users = /* ... */;
UserArray moved = users;   // shallow copy — указатель/дескриптор
// users не освобождается — ownership передан
```

## for-of с let

`for (let item of arr)` даёт `Mut<T>` для элементов, но **только если источник `let`**:

```typescript
let arr = [obj1, obj2, obj3]

for (let item of arr) {      // item: Mut<Obj>
    item.mutMethod()          // ok — изменения попадают в arr
    item = newObj             // error: cannot assign to loop variable
}

const arr2 = [obj1, obj2]
for (let item of arr2) { }   // error: источник const, используй for (const item of arr2)
```

Переприсвоение loop-переменной **всегда** запрещено, независимо от `let`/`const`. Для замены элемента — индексный цикл:

```typescript
for (let i = 0; i < arr.length; i++) {
    arr[i] = newObj    // ok
}
```

C-output для `for (let item of arr)`:

```c
// let arr = [obj1, obj2, obj3];
// for (let item of arr) { item.mutMethod(); }
for (usize _i = 0; _i < arr.length; _i++) {
    Obj* item = &arr.data[_i];     // Mut<Obj> — pointer into array
    Obj_mutMethod(item);
}
```

## C-output: объявление переменной

```typescript
let x: i32 = 42
let name: string = "Alice"
let user = new User("Bob")
```

```c
int32_t x = 42;
String name = { .data = "Alice", .length = 5, .capacity = 0 };
User* user = User_new(&(String){ .data = "Bob", .length = 3, .capacity = 0 });
```

Owned переменные в функциях инициализируются как `NULL` для безопасного `goto cleanup`:

```c
void example(void) {
    User* user = NULL;    // declaration — NULL for cleanup safety
    User* data = NULL;

    user = User_new();
    data = get_data();

    // ... body ...

cleanup:
    if (data) User_free(data);
    if (user) User_free(user);
}
```

## См. также

- [const](./const.md) — иммутабельные переменные и их ограничения
- [Модель памяти](../../05-memory/index.md) — Ownership, Borrow, Mut\<T\>
- [For-of](../loops/for-of.md) — итерация и семантика loop-переменных
- [Функции](../functions/declaration.md) — передача аргументов (Ref, Mut, owned)
