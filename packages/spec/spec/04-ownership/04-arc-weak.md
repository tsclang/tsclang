# 05b — Arc\<T\> и Weak\<T\>: ARC ownership

`Arc<T>` и `Weak<T>` — не отдельные типы данных, а модификаторы схемы владения. Применяются только к классам (и массивам классов). Desktop-only: нет heap → нет ARC → нет shared ownership.

### Arc\<T\> — ARC ownership

Объект создаётся с аннотацией `Arc<T>`, после чего все присваивания — retain/release.

```typescript
let node: Arc<Node> = new Node();  // refcount = 1
```

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | ARC Retain | `Node *b = a; tsc_arc_retain(b);` + cleanup: `tsc_arc_release(b);` |
| `const b = a` | ARC Retain | `const Node *b = a; tsc_arc_retain(b);` + cleanup: `tsc_arc_release(b);` |
| `b = a` (reassign) | ARC Retain | retain new + release old + assign |

### Weak\<T\> — weak reference

Weak reference на Arc-объект. Не увеличивает refcount, не удерживает от освобождения.

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let w = a` (где `a: Weak<T>`) | Copy weak pointer | `Node *w = a;` (без retain/release) |
| `const w = a` | Copy weak pointer | `const Node *w = a;` |
| `w = a` (reassign) | Copy weak pointer | `w = a;` |

Dereference — тип всегда `T | null` (объект мог быть освобождён):

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `w?.method()` | Conditional call | `w != NULL ? Node_method(w) : NULL` |
| `w ?? default` | Fallback | `w != NULL ? w : default` |
| `if (w != null) { w.method() }` | Narrowing | Внутри блока `w` — `Arc<T>` (non-null) |

### Upgrade Weak → Arc

```typescript
let s: Arc<Node> = w;   // ❌ нельзя — weak может быть dangling
if (w != null) {
    let s: Arc<Node> = w;  // ✅ после narrowing — w считается живым
}
```

Null-check = проверка что объект ещё жив (`_refcount > 0`). После narrowing компилятор считает `w` живым `Arc<T>`.

### Разрыв циклов

```typescript
class Node {
    next: Arc<Node>;
    prev: Weak<Node>;    // weak — цикл разорван
}

let a: Arc<Node> = new Node();
let b: Arc<Node> = new Node();
a.next = b;    // retain(b) → refcount(b) = 2
b.prev = a;    // weak — refcount(a) не растёт
```

### Поведение внутри функций

**Arc — передача в функцию:** pointer, refcount не меняется при передаче параметра:

```typescript
function share(node: Arc<Node>): void {
    // node передан как pointer, refcount не меняется (already shared)
}
```

```c
void share(Node *node) { /* pointer, refcount не трогаем */ }
```

Retain/release происходят при присваивании, не при передаче параметра. Если функция сохраняет `node` в поле или глобал — retain происходит в момент присваивания.

**Arc — return:** retain на return path:

```typescript
function getShared(): Arc<Node> {
    return globalNode;
}
```

```c
Node *getShared() {
    Node *_r = globalNode;
    tsc_arc_retain(_r);
    return _r;
}
```

**Weak — передача в функцию:** weak pointer как обычный pointer:

```typescript
function check(w: Weak<Node>): void {
    if (w != null) {
        // narrowed — w живой
    }
}
```

```c
void check(Node *w) {
    if (w != NULL && w->_refcount > 0) {
        // объект жив
    }
}
```

**Weak — return:** weak pointer возвращается как есть, без retain:

```typescript
function getPrev(node: Arc<Node>): Weak<Node> {
    return node.prev;
}
```

```c
Node *getPrev(Node *node) { return node->prev; }
```

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `Arc<T>` | Доступен (ARC через `_refcount` в объекте) | **Недоступен** — ошибка компиляции (нет heap) |
| `Weak<T>` | Доступен | **Недоступен** |
| `tsc_arc_retain` | `ptr->_refcount++` | — |
| `tsc_arc_release` | `--ptr->_refcount; if (ptr->_refcount <= 0 && ptr->_weakcount <= 0) free(ptr)` | — |
| `tsc_weak_upgrade` | `ptr->_refcount > 0 ? (ptr->_refcount++, ptr) : NULL` | — |
| Null-check Weak | `w != NULL && w->_refcount > 0` | — |
| Создание | `Node *n = tsc_arc_alloc(sizeof(Node));` | — |

`Arc<T>` и `Weak<T>` — **desktop-only**. На embedded нет heap → нет ARC → нет shared ownership. Для совместного доступа на embedded используются `Ref<T>` (borrow) и `@static let` (глобальное состояние).

### Ограничения

- `Arc<T>` **только на desktop** — не доступен на embedded (нет heap)
- `Arc<T>` **только для классов** — нельзя `Arc<string>` (строки используют свой ARC), нельзя `Arc<primitive>` (ошибка компиляции)
- Allocator `none` / `static` — `Arc<T>` недоступен

### Почему так

ARC для графов, циклических структур, неопределённого времени жизни. Refcount = предсказуемое освобождение (в отличие от GC). Weak разрывает циклы без утечек — единственный механизм в ARC. Desktop-only: refcount требует atomic operations и heap allocation. Weak dereference всегда null-safe: компилятор требует `?.` или `??` или null-check перед доступом.
