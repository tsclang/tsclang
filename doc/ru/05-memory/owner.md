# Owner (T) — полное владение

[← Вверх](./index.md) | [Следующий →](./ref.md) | [Предыдущий ←](./ownership-types.md)

---

Тип `T` (без аннотации `Ref`/`Mut`/`Shared`/`Weak`) — **владелец** значения. Владелец отвечает за освобождение памяти. При передаче значения происходит **move** — источник становится недоступен.

## Move при присвоении

```typescript
class Node {
    value: i32;
}

let a = new Node();
a.value = 42;
let b = a;          // MOVE: a теперь invalid
// console.log(a);  // error: use of moved value: "a"
console.log(b.value);   // ok — b теперь владелец
```

### C-output

```c
typedef struct { int32_t value; } Node;

int main(void) {
    Node a = {0};
    a.value = 42;
    Node b = a;          // shallow copy — bits перенесены
    a = (Node){0};       // источник обнулён, _free не вызывается
    printf("%d\n", b.value);
    return 0;
}
```

Ключевое: **`_free` не вызывается для `a`** — ownership передан `b`. Освобождение произойдёт только один раз, когда `b` выйдет из scope.

## Move при передаче в функцию

```typescript
class Buffer {
    data: string;
}

function consume(buf: Buffer): void {
    console.log(buf.data);
}

let b = new Buffer();
b.data = "hello";
consume(b);
// console.log(b);   // error: b перемещён
```

### C-output

```c
typedef struct { String data; } Buffer;

void consume_Buffer(Buffer buf) {
    printf("%s\n", buf.data.data);
}

int main(void) {
    Buffer b = {0};
    b.data = STR_LIT("hello");
    consume_Buffer(b);     // b передан по значению — move
    // b не освобождается — ownership внутри consume_Buffer
    return 0;
}
```

Функция принимает `Buffer` по значению — вызывающий теряет ownership.

## Move поля объекта

```typescript
class Owner {
    name: string;
}

let o = new Owner();
o.name = "Alice";
let n = o.name;          // move поля: string из o.name
console.log(n);           // ok
// console.log(o.name);  // error: use of moved value: 'o.name'
```

### C-output

```c
typedef struct { String name; } Owner;

int main(void) {
    Owner o = {0};
    o.name = STR_LIT("Alice");
    String n = o.name;        // move — bits перенесены в n
    printf("%s\n", n.data);
    return 0;
}
```

## Move из массива

`arr[i]` для owned-типа — это **move**. Прямое извлечение по индексу запрещено — используйте `.remove()`:

```typescript
let users = [user1, user2, user3];
let u = users[0];        // error: cannot move out of array by index
let u = users.remove(0); // ok — move с удалением из массива
```

## Примитивы — всегда copy

Примитивные типы (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) **всегда копируются**, move не применяется:

```typescript
let x: i32 = 42;
let y = x;           // copy, не move
console.log(x);      // ok — x жив
console.log(y);      // ok
```

## Move vs Clone

Когда нужна копия сложного типа вместо move — используйте `clone()`:

```typescript
let original = new User();
original.name = "Alice";
let copy = original.clone();     // independent copy
console.log(original.name);      // ok — original жив
console.log(copy.name);          // ok — copy жив
```

`clone()` требует чтобы тип реализовывал `Clone`:

```typescript
class User implements Clone {
    name: string;
    clone(): User {
        const c = new User();
        c.name = this.name.clone();
        return c;
    }
}
```

## C-output: cleanup при множественных owned

Все owned-переменные в функции инициализируются как `NULL` для безопасного `goto cleanup`:

```c
void example(void) {
    User* user = NULL;     // NULL — для безопасной очистки
    Buffer* buf = NULL;

    user = User_new();
    buf = Buffer_new();

    // ... работа ...

cleanup:
    if (buf) Buffer_free(buf);
    if (user) User_free(user);
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `use of moved value: "x"` | Обращение к переменной после move |
| `cannot move out of array by index` | `arr[i]` для owned-типа без `.remove()` |
| `cannot move out of "const" binding` | Move из `const`-переменной |
| `cannot move out of "Ref<T>" borrow` | Move из borrow |

## См. также

- [Типы владения — обзор](./ownership-types.md) — все ownership-типы и C-представления
- [Ref\<T\>](./ref.md) — immutable borrow (не move)
- [Mut\<T\>](./mut.md) — mutable borrow (не move)
- [Drop и cleanup](./drop.md) — автоматическое освобождение и `goto cleanup`
- [Деструктуризация](./destructuring.md) — borrow vs move при извлечении полей
- [let / const](../02-syntax/variables/index.md) — влияние мутабельности на move
