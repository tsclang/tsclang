# Shared\<T\> — разделяемое владение (ARC)

[← Вверх](./index.md) | [Следующий →](./weak.md) | [Предыдущий ←](./mut.md)

---

`Shared<T>` — **ARC** (automatic reference counting) для разделяемого владения. Используется для графов, циклических структур и данных с неопределённым временем жизни. Доступно **только на desktop/server** (требует heap).

## Создание

```typescript
class Node {
    value: i32;
}

let x: Shared<Node> = new Node();   // ARC — alloc + refcount = 1
x.value = 10;
console.log(x.value);               // 10
```

**Явная аннотация типа** `Shared<T>` активирует ARC. Без неё — обычный owned:

```typescript
let node = new Node();              // Owner — move-семантика (stack/value)
let arc: Shared<Node> = new Node(); // Shared — ARC (heap, refcount)
```

## Retain (разделение владения)

Присвоение `Shared<T>` в другую переменную увеличивает счётчик:

```typescript
class Node {
    value: i32;
}
let a = new Shared<Node>();
a.value = 42;
let b = a;                          // retain — refcount = 2
console.log(b.value);               // 42
```

Обе переменные ссылаются на одни данные. При выходе из scope каждой — `release`, и когда refcount достигает 0 — освобождение.

## Read-only

`Shared<T>` — **строго read-only**. Interior mutability намеренно отсутствует:

- Нельзя вызвать `mut`-методы через `Shared<T>`
- Нельзя передать как `Mut<T>`
- Данные доступны только на чтение

Это архитектурное решение: event loop однопоточный, мутация через `Channel`/actor-паттерн, а для счётчиков — `Atomic<T>`.

## Разрыв циклов с Weak\<T\>

Циклические ссылки (графы, двусвязные списки) требуют `Weak<T>` для обратных ссылок:

```typescript
class Node {
    value: i32;
    next: Weak<Node> | null;
}

let n = new Shared<Node>();
n.value = 1;
n.next = null;
let w = new Weak<Node>(n);
console.log(n.value);               // 1
```

Без `Weak<T>` цикл `A → Shared<B> → Shared<A>` никогда бы не освободился (refcount никогда 0).

## C-output

### Создание Shared

```typescript
class Node {
    value: i32;
}
let x: Shared<Node> = new Node();
x.value = 10;
console.log(x.value);
```

```c
typedef struct { int32_t _refcount; int32_t value; } Node;

int main(void) {
    TSC_INIT();
    Node *x = tsc_arc_alloc(sizeof(Node));
    x->value = 0;
    x->value = 10;
    printf("%d\n", x->value);
    tsc_arc_release(x);
    return 0;
}
```

- Поле `_refcount` добавляется автоматически в начало struct
- `tsc_arc_alloc` — heap-allocation с refcount = 1
- `tsc_arc_release` в конце scope — декремент и освобождение при refcount = 0

### Retain

```typescript
let a = new Shared<Node>();
a.value = 42;
let b = a;
console.log(b.value);
```

```c
Node *a = tsc_arc_alloc(sizeof(Node));
a->value = 42;
Node *b = tsc_arc_retain(a);       // refcount++
printf("%d\n", b->value);
tsc_arc_release(b);                 // refcount--
tsc_arc_release(a);                 // refcount-- → 0 → free
```

### Weak-поле (двусвязный список)

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
    Node *next;                      // weak pointer (no retain)
};
```

При наличии `Weak<T>` в полях добавляется `_weakcount`.

## Ограничения

### Нет на embedded

`Shared<T>` требует heap-аллокатора. На embedded (no heap) — ошибка компиляции:

```typescript
#[allocator(none)]
class Node { value: i32; }
let x: Shared<Node> = new Node();
// error: "Shared<T>" requires a heap allocator; "none" allocator does not support ARC
```

### Нет Mut из Shared

```typescript
let arc = new Shared<Data>();
function modify(d: Mut<Data>): void { /* ... */ }
modify(arc);    // error: Shared<T> is read-only, cannot create Mut<T>
```

### Нет interior mutability

Изменить данные через `Shared<T>` нельзя — для мутации нужен владелец (`let`) или `Mut<T>`.

## Матрица передачи

| Источник ↓ \ Параметр → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `Shared<T>` | ✅ borrow | ❌ | ❌ | ✅ retain |
| `let T` | ✅ auto borrow | ✅ auto mut borrow | ✅ move | ❌ |
| `const T` | ✅ auto borrow | ❌ | ❌ | ❌ |

## Ошибки компилятора

| Код | Ошибка | Решение |
|-----|--------|---------|
| `Shared<T>` на embedded | `"Shared<T>" requires a heap allocator` | Используйте owned + `Ref<T>` через параметры |
| `modify(arc: Shared<T>)` с параметром `Mut<T>` | `Shared<T> is read-only` | Передавайте owned или `Mut<T>` |
| `new Shared<T>()` с `#[allocator(none)]` | `"none" allocator does not support ARC` | Уберите `#[allocator(none)]` или не используйте `Shared<T>` |

## См. также

- [Weak\<T\>](./weak.md) — слабая ссылка для разрыва циклов
- [Ref\<T\>](./ref.md) — неизменяемый заём
- [Mut\<T\>](./mut.md) — мутабельный заём
- [const](../02-syntax/variables/const.md) — Shared\<T\> как обход ограничения запрета move из const
