# Типы владения — обзор

[← Вверх](./index.md) | [Следующий →](./owner.md)

---

Все значения в TSClang имеют один из шести режимов владения. Режим определяет, кто освобождает память и какие операции разрешены.

## Таблица типов

| Тип | Семантика | Кто освобождает | Параллельный доступ |
|-----|-----------|-----------------|---------------------|
| `T` | **Owner** — владеет объектом | Автоматический drop в конце scope | Нет — move при передаче |
| `Ref<T>` | **Immutable borrow** — только чтение | Не освобождает (не владелец) | Несколько `Ref` одновременно |
| `Mut<T>` | **Mutable borrow** — чтение и запись | Не освобождает (не владелец) | Только один `Mut` за раз |
| `Shared<T>` | **ARC** — strong ref | `release()` когда refcount = 0 | Только desktop, read-only |
| `Weak<T>` | **Weak ref** — не удерживает объект | Не освобождает | `T \| null` при обращении |
| `Slice<T>` | **Borrowed array view** | Не освобождает | Zero-copy, привязан к источнику |

## C-представления

Каждый тип владения компилируется в конкретный C-тип:

| Тип TSClang | C-представление | Примечание |
|-------------|----------------|-----------|
| `T` (owned) | `T value` / `T* ptr` | move = не вызываем `_free` на источнике |
| `Ref<T>` | `const T* ptr` | read-only указатель |
| `Mut<T>` | `T* ptr` | read-write указатель |
| `Shared<T>` | `T* ptr` + `int32_t _refcount` | ARC, `tsc_arc_retain` / `tsc_arc_release` |
| `Weak<T>` | `T* ptr` + `int32_t _weakcount` | не удерживает объект, `tsc_weak_*` |
| `Slice<T>` | `T* ptr` + `size_t length` | view без копирования данных |

## Пример: Ref<T> в C

```typescript
function getName(u: Ref<User>): string {
    return u.name;
}
```

```c
String getName_ref_User(const User *u) {
    return u->name;
}
```

## Пример: Mut<T> в C

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}
```

```c
void fill_mut_Array_i32(Array_i32 *arr) {
    arr->data[0] = 99;
}
```

## Пример: Shared<T> в C

```typescript
let a = new Shared<Node>();
a.value = 42;
let b = a;   // retain — a и b живы
```

```c
Node *a = tsc_arc_alloc(sizeof(Node));
a->value = 42;
Node *b = tsc_arc_retain(a);
// ...
tsc_arc_release(b);
tsc_arc_release(a);
```

## Пример: Weak<T> в C

```typescript
let n = new Shared<Node>();
n.value = 1;
let w = new Weak<Node>(n);   // weak ref — refcount не растёт
```

```c
Node *n = tsc_arc_alloc(sizeof(Node));
n->value = 1;
Node *w = tsc_weak_create(n);
// ...
tsc_weak_release(w);
tsc_arc_release(n);
```

## Move<T> не существует

`Move<T>` — это **не** режим хранения. Move — это **операция** передачи ownership. В C не появляется нового типа: bare `T` в параметрах и возвращаемых типах уже означает move.

```typescript
function consume(buf: Buffer): void { ... }   // buf передан по значению = move
```

```c
void consume_Buffer(Buffer buf) { ... }   // значение передано, вызывающий не освобождает
```

## Правила передачи аргументов

Тип параметра в сигнатуре **полностью диктует** семантику на callsite — явных `&` или `*` не нужно.

**Примитивы — всегда copy**, независимо от типа параметра.

**Сложные типы — 4 варианта:**

```typescript
function toRef(x: Ref<User>): void { ... }        // borrow — x жив после вызова
function toMut(x: Mut<User>): void { ... }        // mutable borrow
function toOwned(x: User): void { ... }           // move — x недоступен после вызова
function toShared(x: Shared<User>): void { ... }  // retain (refcount++)
```

**Матрица совместимости:**

| Источник ↓ \ Параметр → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `let T`                  | auto borrow | auto mut borrow | move | - |
| `const T`                | auto borrow | - | - | - |
| `Ref<T>`                 | re-borrow | - | - | - |
| `Mut<T>`                 | понижение | re-borrow | - | - |
| `Shared<T>`              | borrow | - | - | retain |

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot move out of "Ref<T>" borrow` | Попытка move из `Ref<T>` |
| `cannot move out of "const" binding` | Move из `const`-переменной |
| `already borrowed as Mut` | Второй `Mut` или `Ref` при активном `Mut` |
| `Ref<T> not allowed in class field` | `Ref<T>` в поле класса |

## См. также

- [Owner (T)](./owner.md) — полное владение, move при присвоении и передаче
- [Ref\<T\>](./ref.md) — immutable borrow
- [Mut\<T\>](./mut.md) — mutable borrow
- [Shared\<T\> и Weak\<T\>](./shared.md) — ARC и weak-ссылки
- [Slice\<T\>](./slice.md) — zero-copy view
- [Borrow checker](./borrow-checker.md) — детальные правила lifetime и scope
