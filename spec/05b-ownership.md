# TSClang — Присваивание и владение

Семантика присваивания (`let b = a`, `const b = a`, `b = a`) зависит от типа `a` и от типа-аннотации `b`. Ниже — полная таблица по всем комбинациям.

## Обозначения

| Термин | Значение |
|--------|----------|
| **Copy** | Побитовое копирование. Оригинал не затронут, никаких retain/release |
| **Move** | Ownership transfer. Оригинал обнуляется (`{0}`), доступ к нему — ошибка компиляции |
| **ARC Copy** | Копирование struct-by-value + `tsc_string_retain` нового владельца + `tsc_string_release` в cleanup |
| **Borrow** | Pointer (`&a`) без transfer ownership. Владение остаётся у оригинала |
| **ARC Retain** | `RC_retain()` — increment refcount, shared ownership |

---

## 1. a — примитив

**Типы:** `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`, `f32`, `f64`, `bool`, `usize`, `isize`

Примитивы — всегда **copy by value**. Никакого ownership management, никаких retain/release.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | Copy, mutable | `int32_t b = a;` |
| `const b = a` | Copy, immutable | `const int32_t b = a;` |
| `b = a` (reassign) | Copy | `b = a;` (только если `b` объявлен как `let`) |

### Ref\<T\> / Mut\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<i32> = a` | Borrow pointer | `const int32_t *b = &a;` |
| `const b: Mut<i32> = a` | Mutable borrow pointer | `int32_t *b = &a;` |

`Ref<primitive>` и `Mut<primitive>` допустимы — они нужны для **array element borrows** (`arr[i]` → `Ref<i32>`). Для отдельной переменной это технически работает, но практически бессмысленно: указатель на стековую переменную, которая и так доступна по имени.

### Shared\<T\> / Weak\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Shared<i32> = a` | **Ошибка компиляции** | `TypeError: Shared<T> requires a non-primitive type, got i32` |
| `const b: Weak<bool> = a` | **Ошибка компиляции** | `TypeError: Weak<T> requires a non-primitive type, got bool` |

Shared ownership и weak references для copy-типов бессмысленны — нет смысла делать refcount для значения, которое и так копируется.

### Очистка памяти

Для примитивов нет явного `drop`, `free` или деструктора. Переменная — это байты на стеке. Память освобождается автоматически:

| Случай | Что происходит |
|--------|---------------|
| Выход из блока `{}` | Стековый указатель сдвигается, переменная перестаёт существовать |
| Выход из функции (`return`) | Все локальные переменные и параметры уничтожаются |
| Конец `main()` | Все переменные очищаются при завершении программы |
| Reassign (`b = newValue`) | Старое значение перезаписывается, переменная жива |

C-компилятор не генерирует инструкций на «очистку» — просто сдвигает стековый указатель. Zero overhead.

Это верно **для любого вида функций**:

- **`void` vs не-`void`** — `return` без значения и падение на `}` раскручивают стек одинаково
- **Стрелочная функция** (`const fn = (x: i32) => x + 1`) — обычная C-функция, параметры уничтожаются при возврате
- **Замыкание** — примитив **копируется** в stack-allocated env struct при создании замыкания. Замыкание — C struct на стеке, возвращается по значению. Heap используется только при `TSC_CLOSURE_BOX` (C interop, `native {}` блоки)

### Почему так

Copy-типам не нужен ownership management — значение копируется при присваивании, оригинал не теряется. Borrow допустим (pointer), но не имеет практического смысла для отдельной переменной. Shared/Weak запрещены — refcount для числа бессмысленен.

---

## 2. a — string

Строки — **immutable + ARC**. Не move, не чистый copy. Каждый владелец `String` struct делает `tsc_string_retain` при получении и `tsc_string_release` при потере значения.

Литералы (`"hello"`) не выделяют heap: `capacity = 0`, `data → rodata`, `_refcount = NULL`. Для литералов retain/release — no-ops.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | ARC Copy (retain + cleanup release) | `String b = a; tsc_string_retain(&b);` + cleanup: `tsc_string_release(&b);` |
| `const b = a` | ARC Copy (retain + cleanup release) | `const String b = a; tsc_string_retain(&b);` + cleanup: `tsc_string_release(&b);` |
| `b = a` (reassign) | ARC Copy | `b = a;` (cleanup release уже зарегистрирован) |

### В полях объекта / элементах массива (Member / Index)

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `obj.name = a` | Safe temp: retain new → release old → assign | `String _t = a; tsc_string_retain(&_t); tsc_string_release(&obj->name); obj->name = _t;` |
| `arr[i] = a` | Safe temp (аналогично) | retain new → release old → assign |

Safe temp pattern предотвращает use-after-free при `obj.name = obj.name` (self-assignment) и при `obj.name = concat(a, b)` (old value может быть аргументом concat).

### Ref\<string\> / Mut\<string\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<string> = a` | Borrow (struct-by-value) | `String b = a;` (без retain/release) |
| `const b: Mut<string> = a` | Mutable borrow | `String *b = &a;` |

`Ref<string>` — особый случай: string slice borrow — struct-by-value (не pointer), без retain/release. Владение остаётся у оригинала.

### Конкатенация (+=)

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `b += a` | Eval concat → release old → assign | `String _tmp = tsc_string_concat(b, a); tsc_string_release(&b); b = _tmp;` |

`tsc_string_concat` возвращает новую строку с refcount=1 (ownership transfer), поэтому retain не нужен.

### Параметры функций

`string` в параметрах — **implicit borrow** (zero-overhead): caller **не** делает retain, callee **не** делает release. Владение остаётся у caller.

### Почему так

Строки immutable — безопасно иметь несколько владельцев одной и той же строки. ARC гарантирует, что heap-память освободится, когда последний владелец отпустит строку. Литералы (rodata, capacity=0) — retain/release no-ops, нулевой overhead. На embedded строки всегда rodata, ARC не используется.

---

## 3. a — класс / массив (owned T)

Классы и массивы — **move semantics**. Присваивание передаёт ownership, оригинал обнуляется.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | Move + zero-out | `User b = a; memset(&a, 0, sizeof(User));` |
| `const b = a` | Move + zero-out | `const User b = a; memset(&a, 0, sizeof(User));` |
| `b = a` (reassign) | Move + zero-out | `b = a; memset(&a, 0, sizeof(User));` |

После move `a` обнуляется, доступ к `a` — ошибка компиляции (`E008: use after move`).

### Передача в функцию

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `foo(a)` (param: `T`) | Move + zero-out после вызова | `foo(a); memset(&a, 0, sizeof(User));` (через `_postStmtCleanups`) |

### Ref\<T\> / Mut\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<User> = a` | Immutable borrow | `const User *b = &a;` + borrow tracking |
| `const b: Mut<User> = a` | Mutable borrow (3 проверки) | `User *b = &a;` + borrow tracking |

Borrow tracking для `Mut<T>` проверяет:
1. `a` — не `const` binding
2. Нет активного `Ref<T>` borrow на `a`
3. Нет другого `Mut<T>` borrow на `a`

### Shared\<T\> / Weak\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Shared<User> = a` | **Ошибка** — `a` не является `Shared<T>` | Нельзя создать Shared из owned |
| `const b: Weak<User> = a` | **Ошибка** — `a` не является `Shared<T>` | Weak только из Shared |

Shared ownership создаётся при создании объекта: `let s: Shared<User> = new User()`. Нельзя превратить owned в Shared пост-фактум.

### Доступ к полям после move

```typescript
let u = new User();
let v = u;           // move
console.log(u.name); // ❌ E008: use after move
```

### Borrow из массива

```typescript
const u: Ref<User> = users[0];     // ✅ borrow
const u = users[0];                // ❌ E009: cannot move out of array by index
const u = users.remove(0);         // ✅ move + удаление из массива
```

### Borrow полей объектов — запрещён

```typescript
const u: Ref<User> = container.user;  // ❌ Cannot borrow a class field
const m: Mut<User> = container.user;  // ❌ Cannot borrow a class field
```

Паттерн: передавать весь объект как `Ref<Container>`.

### Почему так

Move semantics = zero-cost abstraction. Нет refcount, нет runtime overhead. Один владелец = один destructor call. Borrow (Ref/Mut) = pointer — нулевой overhead, но compile-time guarantee безопасности. Массивы и классы — самые тяжёлые объекты, move гарантирует предсказуемое использование памяти.

---

## 4. a — Shared\<T\>

Shared ownership через ARC. Объект создаётся с аннотацией `Shared<T>`, после чего все присваивания — retain/release.

### Создание

```typescript
let node: Shared<Node> = new Node();  // refcount = 1
```

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | ARC Retain | `Node *b = a; RC_retain(b);` + cleanup: `RC_release(b);` |
| `const b = a` | ARC Retain | `const Node *b = a; RC_retain(b);` + cleanup: `RC_release(b);` |
| `b = a` (reassign) | ARC Retain | retain new + release old + assign |

### Weak\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let w: Weak<Node> = a` | Weak reference | `Node *w = a;` (refcount не растёт) |
| `w?.field` | Dereference с null-check | `w != NULL ? w->field : NULL` |
| `w ?? default` | Dereference с дефолтом | `w != NULL ? w : default` |

`Weak<T>` не увеличивает refcount. При обращении — тип всегда `T | null` (объект мог быть освобождён).

### Разрыв циклов

```typescript
class Node {
    next: Shared<Node>;
    prev: Weak<Node>;    // weak — цикл разорван
}

let a: Shared<Node> = new Node();
let b: Shared<Node> = new Node();
a.next = b;    // retain(b) → refcount(b) = 2
b.prev = a;    // weak — refcount(a) не растёт
```

### Ограничения

- `Shared<T>` **только на desktop** — не доступен на embedded (нет heap)
- `Shared<T>` **только для классов** — нельзя `Shared<string>` (строки используют свой ARC), нельзя `Shared<primitive>` (ошибка компиляции)
- Allocator `none` / `static` — `Shared<T>` недоступен

### Почему так

ARC для графов, циклических структур, неопределённого времени жизни. Refcount = предсказуемое освобождение (в отличие от GC). Weak разрывает циклы без утечек. Desktop-only: refcount требует atomic operations и heap allocation.

---

## 5. a — Weak\<T\>

Weak reference на Shared-объект. Не удерживает объект от освобождения.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let w = a` (где `a: Weak<T>`) | Copy weak pointer | `Node *w = a;` (без retain/release) |
| `const w = a` | Copy weak pointer | `const Node *w = a;` |
| `w = a` (reassign) | Copy weak pointer | `w = a;` |

### Dereference

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `w?.method()` | Conditional call | `w != NULL ? Node_method(w) : NULL` |
| `w ?? default` | Fallback | `w != NULL ? w : default` |
| `if (w != null) { w.method() }` | Narrowing | Внутри блока `w` — `Shared<T>` (non-null) |

### Upgrade до Shared

```typescript
let s: Shared<Node> = w;   // ❌ нельзя — weak может быть dangling
if (w != null) {
    let s: Shared<Node> = w;  // ✅ после narrowing — w считается живым
}
```

### Почему так

Weak — единственный механизм разрыва циклов в ARC. Без retain/release overhead при создании. Dereference всегда null-safe: компилятор требует `?.` или `??` или null-check перед доступом.
