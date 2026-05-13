# Weak\<T\> — слабая ссылка

[← Вверх](./index.md) | [Следующий →](./borrow-rules.md) | [Предыдущий ←](./shared.md)

---

`Weak<T>` — слабая ссылка для разрыва циклов при использовании `Shared<T>`. Не увеличивает refcount. Доступ всегда возвращает `T | null` — данные могут быть уже освобождены.

## Зачем

Циклические ссылки в `Shared<T>` предотвращают освобождение памяти (refcount никогда не достигнет 0):

```typescript
class Node {
    next: Shared<Node>;     // strong ref → цикл!
}
```

`Weak<T>` разрывает цикл, не удерживая данные:

```typescript
class Node {
    next: Shared<Node>;
    prev: Weak<Node>;       // weak ref → no cycle
}
```

## Создание

```typescript
class Data {
    x: i32;
}
let d = new Shared<Data>();
d.x = 99;
let w = new Weak<Data>(d);   // weak reference, refcount не увеличен
```

## Доступ (upgrade)

`Weak<T>` не даёт прямого доступа к данным. Нужен `upgrade()` — возвращает `Shared<T> | null`:

```typescript
let d = new Shared<Data>();
d.x = 99;
let w = new Weak<Data>(d);
let strong = w.upgrade();     // Shared<Data> | null
if (strong != null) {
    console.log(strong.x);    // 99
}
```

Если данные уже освобождены (refcount = 0), `upgrade()` возвращает `null`.

## Использование в полях

Типичный паттерн — двусвязный список / граф:

```typescript
class Node {
    value: i32;
    next: Weak<Node> | null;
}

let n = new Shared<Node>();
n.value = 1;
n.next = null;
let w = new Weak<Node>(n);
console.log(n.value);         // 1
```

Обратные ссылки в графах — через `Weak<T>`, прямые — через `Shared<T>`.

## Optional chaining

Поскольку `Weak<T>` может вернуть `null`, используйте `?.` и `??`:

```typescript
let w = new Weak<Data>(arc);
let val = w.upgrade()?.x ?? 0;    // safe access with fallback
```

## C-output

### Weak-создание и upgrade

```typescript
class Data {
    x: i32;
}
let d = new Shared<Data>();
d.x = 99;
let w = new Weak<Data>(d);
let strong = w.upgrade();
if (strong != null) {
    console.log(strong.x);
}
```

```c
typedef struct { int32_t _refcount; int32_t _weakcount; int32_t x; } Data;

int main(void) {
    TSC_INIT();
    Data *d = tsc_arc_alloc(sizeof(Data));
    d->x = 99;
    Data *w = tsc_weak_create(d);        // weak ref, _weakcount++
    Data *strong = tsc_weak_upgrade(w);  // NULL если уже освобождён
    if (strong != NULL) {
        printf("%d\n", strong->x);
        tsc_arc_release(strong);         // upgrade возвращает retained
    }
    tsc_weak_release(w);                 // _weakcount--
    tsc_arc_release(d);                  // refcount-- → 0 → free
    return 0;
}
```

- `tsc_weak_create` — создаёт слабую ссылку, увеличивает `_weakcount`, но **не** `_refcount`
- `tsc_weak_upgrade` — возвращает `NULL` или retained указатель (нужен `release`)
- `tsc_weak_release` — уменьшает `_weakcount`

### Struct с Weak-полем

```typescript
class Node {
    value: i32;
    next: Weak<Node> | null;
}
```

```c
typedef struct Node Node;
struct Node {
    int32_t _refcount;
    int32_t _weakcount;
    int32_t value;
    Node *next;          // weak pointer — без retain при присвоении
};
```

Наличие `Weak<T>` в полях автоматически добавляет `_weakcount` в struct.

## Ограничения

### Только с Shared\<T\>

`Weak<T>` работает **только** с `Shared<T>`. Нельзя создать `Weak<T>` от owned-значения:

```typescript
let x = new Node();             // owned
let w = new Weak<Node>(x);      // error: Weak<T> requires Shared<T>
```

### Нет на embedded

Как и `Shared<T>`, `Weak<T>` недоступен на embedded — нет heap-аллокатора.

### Upgrade может вернуть null

Всегда проверяйте результат `upgrade()`:

```typescript
let strong = w.upgrade();
if (strong != null) {
    // ok — данные живы
} else {
    // данные уже освобождены
}
```

## Ошибки компилятора

| Код | Ошибка | Решение |
|-----|--------|---------|
| `new Weak<T>(owned)` | `Weak<T> requires Shared<T>` | Создайте `Shared<T>` сначала |
| `Weak<T>` на embedded | `requires a heap allocator` | Используйте owned + параметры |
| `w.x` (прямой доступ) | Доступ через `w.upgrade()?.x` | Всегда используйте `upgrade()` |

## См. также

- [Shared\<T\>](./shared.md) — разделяемое владение (ARC)
- [Ref\<T\>](./ref.md) — неизменяемый заём
- [Mut\<T\>](./mut.md) — мутабельный заём
- [const](../02-syntax/variables/const.md) — Shared\<T\> как обход ограничения
