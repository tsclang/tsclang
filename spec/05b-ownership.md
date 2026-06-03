# TSClang — Присваивание и владение

> **Приоритет:** при конфликте с `spec/05c-for-of-iteration.md` по for-of — доминирует 05c. При конфликте с `spec/05d-spread-destructuring-merge.md` по spread/destructuring — доминирует 05d. При конфликте с `spec/05e-closures.md` по closures/capture — доминирует 05e.

Семантика присваивания (`let b = a`, `const b = a`, `b = a`) зависит от типа `a` и от типа-аннотации `b`. Ниже — полная таблица по всем комбинациям.

## Обозначения

| Термин | Значение |
|--------|----------|
| **Copy** | Побитовое копирование. Оригинал не затронут, никаких retain/release |
| **Move** | Ownership transfer. Оригинал обнуляется (`{0}`), доступ к нему — ошибка компиляции |
| **ARC Copy** | Копирование struct-by-value + `tsc_string_retain` нового владельца + `tsc_string_release` в cleanup |
| **Borrow** | Pointer (`&a`) без transfer ownership. Владение остаётся у оригинала |
| **ARC Retain** | `tsc_arc_retain()` — increment refcount, shared ownership |

---

## 1. a — примитив

**Типы:** `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`, `f32`, `f64`, `boolean`, `usize`, `isize`

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
| `const b: Weak<boolean> = a` | **Ошибка компиляции** | `TypeError: Weak<T> requires a non-primitive type, got boolean` |

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

### Поведение внутри функций

**Обычные функции** — параметры и локальные переменные на стеке, cleanup = сдвиг стека:

```typescript
function add(x: i32, y: i32): i32 {
    let sum = x + y;
    return sum;
}
```

```c
int32_t add_i32_i32(int32_t x, int32_t y) {
    int32_t sum = x + y;
    return sum;
}  // x, y, sum — на стеке, уничтожены при возврате
```

**Стрелочные функции** — компилируются в обычные C-функции, идентично:

```typescript
const add = (x: i32, y: i32): i32 => x + y;
```

```c
int32_t _lambda_0_i32(int32_t x, int32_t y) { return x + y; }
```

**Замыкания с capture** — env struct на стеке, примитив **копируется** по значению:

```typescript
let base = 10;
const add = (x: i32): i32 => base + x;
console.log(add(5));
```

```c
typedef struct { int32_t base; } _closure_0_env;
typedef struct { _closure_0_env env; int32_t (*fn)(_closure_0_env *, int32_t); } _closure_0;

static int32_t _closure_0_fn(_closure_0_env *env, int32_t x) { return env->base + x; }

int main(void) {
    int32_t base = 10;
    _closure_0 add = {.env = {.base = base}, .fn = _closure_0_fn};
    printf("%d\n", add.fn(&add.env, 5));  // 15
}
```

`base` скопирован в env struct. Оригинал `base` живёт на стеке дальше. Env struct уничтожается со стеком при выходе из scope. Нет `malloc`, нет `free`.

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `i32` | `int32_t` (4 байта) | `int32_t` (4 байта, avr-gcc — цепочка инструкций) |
| `f64` | `double` (8 байт) | `float` при `number` (avr), иначе `double` |
| `usize` | `size_t` (4/8 байт) | `uint16_t` на 16-bit (nes, spectrum) |
| Retain/release | Нет (примитивы — copy) | Нет (примитивы — copy) |
| Замыкания | Stack-allocated struct | Stack-allocated struct (идентично) |
| `new` (классы) | Stack value type: `T var = {0}` | Статический аллокатор или stack |

Примитивы — **одинаковы** на всех платформах. Zero overhead везде. Никаких различий в поведении.

### Почему так

Copy-типам не нужен ownership management — значение копируется при присваивании, оригинал не теряется. Borrow допустим (pointer), но не имеет практического смысла для отдельной переменной. Shared/Weak запрещены — refcount для числа бессмысленен.

---

## 2. a — string

Строки — **immutable + ARC**. Не move, не чистый copy. Каждый владелец `String` struct делает `tsc_string_retain` при получении и `tsc_string_release` при потере значения.

Литералы (`"hello"`) не выделяют heap: `capacity = 0`, `data → rodata`, `_refcount = NULL`. Для литералов retain/release — no-ops.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | ARC Copy (retain + cleanup release) | `tsc_string_retain(a); String b = a;` + cleanup: `tsc_string_release(b);` |
| `const b = a` | ARC Copy (retain + cleanup release) | `tsc_string_retain(a); const String b = a;` + cleanup: `tsc_string_release(b);` |
| `b = a` (reassign) | ARC Copy | `tsc_string_retain(a); tsc_string_release(b); b = a;` (cleanup release уже зарегистрирован) |

### В полях объекта / элементах массива (Member / Index)

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `obj.name = a` | Safe temp: retain new → release old → assign | `String _t = a; tsc_string_retain(_t); tsc_string_release(obj->name); obj->name = _t;` |
| `arr[i] = a` | Safe temp (аналогично) | retain new → release old → assign |

Safe temp pattern предотвращает use-after-free при `obj.name = obj.name` (self-assignment) и при `obj.name = concat(a, b)` (old value может быть аргументом concat).

### Ref\<string\> / Mut\<string\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<string> = a` | Borrow (struct-by-value) | `String b = a;` (без retain/release) |
| `const b: Mut<string> = a` | Mutable borrow | `String *b = &a;` |

`Ref<string>` — особый случай: string slice borrow — struct-by-value (не pointer), без retain/release. Владение остаётся у оригинала.

Указатель на оригинальную строку. Позволяет мутировать строку через указатель. Но строки immutable по дизайну — `Mut<string>` в основном для внутренних нужд компилятора (конкатенация, изменение полей).

### Shared\<T\> / Weak\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Shared<string> = a` | Не поддерживается | Строки используют свой ARC, `Shared<string>` не нужен
| `const b: Weak<string> = a` | Не поддерживается | Weak нужен для разрыва циклов в Shared, строки не участвуют в Shared-циклах

У строк уже есть встроенный ARC (_refcount в struct). `Shared<string>` был бы двойным refcounting.

### Конкатенация (+=)

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `b += a` | Eval concat → release old → assign | `String _tmp = tsc_string_concat(b, a); tsc_string_release(b); b = _tmp;` |

`tsc_string_concat` возвращает новую строку с refcount=1 (ownership transfer), поэтому retain не нужен.

### Параметры функций

`string` в параметрах — **implicit borrow** (zero-overhead): caller **не** делает retain, callee **не** делает release. Владение остаётся у caller.

### Очистка памяти

Для строк очистка отличается от примитивов — нужен cleanup release при каждом выходе из scope:

| Случай | Что происходит |
|--------|---------------|
| Выход из блока `{}` | `tsc_string_release(b)` в cleanup. Если refcount → 0: `free(data)` + `free(_refcount)`, иначе просто decrement |
| Выход из функции | То же — cleanup release для всех локальных строк |
| Reassign (`b = newValue`) | Safe temp: retain new → release old → assign. Старое значение освобождается **сразу** |
| `b += "suffix"` | Eval concat → `tsc_string_release(b)` → assign. Старая строка освобождается |
| Конец `main()` | Cleanup release для всех строк через `_mainCleanup` |
| Класс с string-полями | Автогенерированный `ClassName_free()` — release каждого string-поля |
| Замыкание с string capture | Destroy fn делает `tsc_string_release` для каждого захваченного string + `free(env)` (для boxed варианта) |

**Литералы** (`"hello"`, `capacity=0`): `tsc_string_release` — no-op (`_refcount == NULL`), очистка = zero cost.

**Heap-строки** (`capacity>0`): `tsc_string_release` decrement refcount, если 0 — `free(data)` и `free(_refcount)`.

Safe temp при reassign в полях/массивах:

```typescript
obj.name = concat(a, b);
```

```c
String _t = tsc_string_concat(a, b);   // eval new
tsc_string_retain(_t);                 // retain new
tsc_string_release(obj->name);         // release old
obj->name = _t;                         // assign
```

Порядок критичен: **retain new → release old → assign**. Если бы сначала release old, а old и new — одна и та же строка (self-assignment), получили бы use-after-free.

### Поведение внутри функций

**Обычные функции** — строковые параметры через **implicit borrow** (caller НЕ делает retain, callee НЕ делает release):

```typescript
function greet(name: string): void {
    console.log(name);
}
```

```c
void greet(String name) {
    printf("%.*s\n", name.length, name.data);
}  // нет tsc_string_release — implicit borrow
```

**Локальные строки** — retain при создании, release в cleanup:

```typescript
function foo(s: string): void {
    let copy = s;
    console.log(copy);
}
```

```c
void foo(String s) {
    String copy = s;
    tsc_string_retain(copy);
    printf("%.*s\n", copy.length, copy.data);
    tsc_string_release(copy);  // cleanup
}  // s — implicit borrow, нет release
```

**Return** — retain на всех путях возврата:

```typescript
function getName(u: Ref<User>): string {
    return u.name;
}
```

```c
String getName(const User *u) {
    String _r = u->name;
    tsc_string_retain(_r);
    return _r;
}
```

**Стрелочные функции** — идентичны обычным функциям, компилируются в C-функции. Строковые параметры — implicit borrow, локальные строки — retain/release.

**Замыкания с string capture** — retain при захвате, release в destroy fn:

```typescript
let greeting = "hello";
const fn = (): string => greeting;
```

```c
typedef struct { String greeting; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    tsc_string_release(env->greeting);
    free(env);
}

// создание:
tsc_string_retain(greeting);
_closure_0 fn = {.env = {.greeting = greeting}, .fn = _closure_0_fn};
```

Для boxed варианта (`TSC_CLOSURE_BOX`): env копируется на heap через `malloc`, destroy fn вызывается при `TSC_CLOSURE_FREE`. Для stack-варианта: env struct на стеке, destroy fn не вызывается (cleanup = сдвиг стека, но string поля нужно release вручную — компилятор генерирует cleanup).

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| String struct | 32 байта (`data`, `length`, `capacity`, `_refcount`) | 24 байта (нет `_refcount`) |
| Литералы (`"hello"`) | rodata, `capacity=0`, `_refcount=NULL` | rodata, `capacity=0` (без `_refcount`) |
| `tsc_string_retain` | `if (_refcount) (*_refcount)++` | No-op (пустая inline функция) |
| `tsc_string_release` | `if (_refcount && --*_refcount == 0) { free(_refcount); free(data); }` | No-op `(void)s` |
| Heap-строки (concat, slice, etc.) | `malloc` для data + `_refcount`, ARC | Ring buffer (`_tsc_str_alloc`) — нет индивидуального `free` |
| Safe temp pattern | retain new → release old → assign | Присваивание без retain/release (no-ops) |
| Implicit borrow параметров | Caller не retain, callee не release | Аналогично |
| Замыкания с string capture | Retain в env, release в destroy fn | No-op retain/release |
| `Shared<string>` | Не поддерживается (свой ARC) | Не поддерживается |

**Ключевое отличие:** на embedded нет ARC — нет `_refcount`, `retain`/`release` = no-ops. Строки выделяются из ring buffer (`_tsc_str_pool`) при конкатенации/slice; литералы — rodata (`capacity = 0`). Ring buffer не поддерживает индивидуальный `free` — память переиспользуется при переполнении. Нет sharing, нет refcount.

**C-определение String struct:**

```c
// Desktop: 32 байта (64-bit: 8+8+8+8), Embedded: 24 байта (без _refcount)
#ifdef TSC_EMBEDDED
typedef struct { const char *data; size_t length; size_t capacity; } String;
#else
typedef struct { const char *data; size_t length; size_t capacity; uint32_t *_refcount; } String;
#endif
```

### Почему так

Строки immutable — безопасно иметь несколько владельцев одной и той же строки. ARC гарантирует, что heap-память освободится, когда последний владелец отпустит строку. Литералы (rodata, capacity=0) — retain/release no-ops, нулевой overhead. На embedded строки всегда rodata, ARC не используется.

---

## 3. a — класс (owned T)

Классы — **move semantics**. Присваивание передаёт ownership, оригинал обнуляется.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | Move + zero-out | `User b = a; a = (User){0};` |
| `const b = a` | Move + zero-out | `const User b = a; a = (User){0};` |
| `b = a` (reassign) | Move + zero-out | `b = a; a = (User){0};` |

После move `a` обнуляется, доступ к `a` — ошибка компиляции (`E002: use after move`).

### Передача в функцию

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `foo(a)` (param: `T`) | Move + zero-out после вызова | `foo(a); a = (User){0};` (через `_postStmtCleanups`) |

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
console.log(u.name); // ❌ E002: use after move
```

### Borrow полей объектов — запрещён

```typescript
const u: Ref<User> = container.user;  // ❌ Cannot borrow a class field
const m: Mut<User> = container.user;  // ❌ Cannot borrow a class field
```

Паттерн: передавать весь объект как `Ref<Container>`.

### Классы с string-полями

Компилятор автоматически генерирует `ClassName_free()` — деструктор, который вызывает `tsc_string_release` для каждого string-поля. Функция **не** вызывает `free(self)` — классы размещаются на стеке как value types. Генерируется только для классов, имеющих string-поля.

```typescript
class User {
    name: string;
    email: string;
}
```

```c
static void User_free(User *self) {
    if (!self) return;
    tsc_string_release(self->name);
    tsc_string_release(self->email);
}
```

Деструктор вызывается в cleanup-секции при выходе из scope, где класс был создан или перемещён: `User_free(&u)`.

### Поведение внутри функций

**Обычные функции** — передача по значению = move, по Ref/Mut = borrow:

```typescript
function process(u: User): void { /* владеет u */ }
function view(u: Ref<User>): void { /* borrow */ }
function modify(u: Mut<User>): void { /* mutable borrow */ }
```

```c
void process(User u) { /* u перемещён, caller обнулён */ }
void view(const User *u) { /* borrow pointer */ }
void modify(User *u) { /* mutable borrow pointer */ }
```

**Замыкания с class/array capture** — implicit **reference** (pointer на source).

> **Приоритет:** полная спецификация замыканий — в `spec/05e-closures.md`. При конфликте доминирует 05e.

Class/array захватывается **по ссылке** (pointer). Source жив, mutations видны. Примитивы/string — copy (snapshot). Для explicit capture: `[x: Ref<T>]` (read-only), `[x: Mut<T>]` (mutable). Move capture `[x: T]` убран.

Подробнее: capture model, примеры, C-representation, ограничения — см. `spec/05e-closures.md`.

### Spread объектов

> **Приоритет:** при конфликте с другими разделами по spread/destructuring — доминирует `spec/05d-spread-destructuring-merge.md`.

Spread **копирует** поля — source жив. Move semantics для spread не применяется. `let`/`const` на source не влияет — всегда copy.

**Object spread — всегда copy:**

```typescript
let base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };
console.log(base);    // ok — base жив
console.log(base.x);  // 1
```

```c
tsc_string_retain(base.name);
BaseType extended = {.x = base.x, .name = base.name};
extended.extra = 42;
// base untouched
```

Все поля копируются в новый объект, оригинал не тронут. String-поля — retain (новый владелец).

**Object spread из `const` — тоже copy:**

```typescript
const base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };
console.log(base);  // ok — base жив
```

`let`/`const` на source не влияет на copy/move — spread всегда copy (см. `spec/05d-spread-destructuring-merge.md`, D1).

**Object spread из `Shared<T>` — retain:**

```typescript
const obj: Shared<Config> = new Config();
const a = { ...obj, y: 2 };  // ok — retain, obj жив
const b = { ...obj, z: 3 };  // ok — retain, obj жив
```

**String-поля при spread** — retain при копировании (новый владелец), release в cleanup:

```typescript
let base = { name: "Alice", age: 30 };
const copy = { ...base };  // name: retain("Alice"), age: copy
console.log(base.name);    // "Alice" — base жив
```

```c
tsc_string_retain(base.name);
BaseType copy = {.name = base.name, .age = base.age};
// base untouched, cleanup: tsc_string_release(copy.name)
```

### Деструктуризация объектов

> **Приоритет:** при конфликте — доминирует `spec/05d-spread-destructuring-merge.md`.

Деструктуризация **всегда copy** — source жив, нет move, нет E002. `let`/`const` на result = только мутабельность. Type annotation = только тип, не меняет copy-семантику.

**Без typeAnn — copy + retain:**

```typescript
let user = { name: "Alice", age: 30 };
const { name, age } = user;  // copy: name retain, age copy
console.log(user.name);      // "Alice" — user жив
```

```c
String name = user.name;
tsc_string_retain(name);
int32_t age = user.age;
// user untouched
```

**С typeAnn — тоже copy + retain:**

```typescript
let user = { name: "Alice", age: 30 };
const { name, age }: User = user;  // copy: name retain, age copy
console.log(user.name);            // "Alice" — user жив
```

Type annotation указывает тип source, но **не меняет** copy-семантику (05d, D4).

**Частичная деструктуризация с rest — copy указанных полей + deep copy rest:**

```typescript
let user = { name: "Alice", age: 30, email: "a@b.c" };
const { name, ...rest } = user;  // copy name + copy rest
console.log(user.name);          // "Alice" — user жив
```

**Деструктуризация с Ref — copy + retain string-полей:**

```typescript
const { name }: Ref<User> = user;  // copy: name retain, user жив
```

**String-поля при деструктуризации** — retain при извлечении (новый владелец), release в cleanup:

```typescript
const { name, email } = user;
// name: retain("Alice"), email: retain("a@b.c")
// cleanup: tsc_string_release(name); tsc_string_release(email);
```

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `new User()` | `User u = User_new(args);` — stack value, return by value | Аналогично: `User u = {0};` (на стеке или в BSS) |
| Move (zero-out) | `memset(&src, 0, sizeof(T))` | Аналогично |
| Ref/Mut borrow | Pointer (`const T*` / `T*`) | Pointer (идентично) |
| `ClassName_free()` | Release string-полей только (без `free(self)`) | No-op (string-поля — no-op retain/release) |
| Замыкания с class capture | Reference (pointer в env), source жив | Reference (pointer, идентично) |
| Spread объекта | Copy полей + retain string-полей, source жив | Copy полей (string — no-op retain), source жив |
| Деструктуризация объекта | Copy полей + retain string-полей + cleanup release, source жив | Copy полей (string — no-op), source жив |
| Деструктор при exit | `User_free(&u)` — release string-полей | No-op |

**Ключевое отличие:** классы — **value types**, размещаются на стеке как struct. Конструктор возвращает struct by value (`User User_new(args) { User self = {0}; ... return self; }`), call site: `User u = User_new(args)`. Нет `malloc`/`free` для самого объекта. `ClassName_free(&u)` освобождает только string-поля, не вызывает `free(self)`. На embedded нет heap → нет `malloc`/`free` вообще. String-поля на embedded — no-op retain/release (ring buffer).

### Почему так

Move semantics = zero-cost abstraction. Нет refcount, нет runtime overhead. Один владелец = один destructor call. Borrow (Ref/Mut) = pointer — нулевой overhead, но compile-time guarantee безопасности.

---

## 4. a — массив (owned T)

Массивы — **move semantics**, как классы. Присваивание передаёт ownership, оригинал обнуляется.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | Move + zero-out | `Array_i32 b = a; a = (Array_i32){0};` |
| `const b = a` | Move + zero-out | `const Array_i32 b = a; a = (Array_i32){0};` |
| `b = a` (reassign) | Move + zero-out | `b = a; a = (Array_i32){0};` |

После move `a` обнуляется, доступ к `a` — ошибка компиляции (`E002: use after move`).

### Передача в функцию

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `foo(a)` (param: `T[]`) | Move + zero-out после вызова | `foo(a); a = (Array_i32){0};` (через `_postStmtCleanups`) |

```typescript
function sum(arr: i32[]): i32 { ... }
let data = [1, 2, 3];
sum(data);
console.log(data.length);  // ❌ E002: use after move
```

```c
int32_t sum_Array_i32(Array_i32 arr) { ... }
Array_i32 data = ...;
sum_Array_i32(data);
memset(&data, 0, sizeof(Array_i32));  // zero-out после вызова
```

### Ref\<T\> / Mut\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<i32[]> = a` | Immutable borrow всей коллекции | `const Array_i32 *b = &a;` + borrow tracking |
| `const b: Mut<i32[]> = a` | Mutable borrow всей коллекции | `Array_i32 *b = &a;` + borrow tracking |

Borrow на коллекцию **блокирует мутацию** (`push`, `pop`, `remove`) пока borrow жив. Borrow отпускается при выходе из scope.

### Shared\<T\> / Weak\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Shared<i32[]> = a` | **Ошибка** — `a` не является `Shared<T>` | Нельзя создать Shared из owned |
| `const b: Weak<i32[]> = a` | **Ошибка** — `a` не является `Shared<T>` | Weak только из Shared |

### Borrow из массива

`arr[i]` для сложных типов — только borrow (`Ref<T>`), move по индексу запрещён:

```typescript
const u: Ref<User> = users[0];     // ✅ borrow
const u = users[0];                // ❌ E009: cannot move out of array by index
const u = users.remove(0);         // ✅ move + удаление из массива
```

`arr[i]` для примитивов — copy (возвращает значение, не borrow):

```typescript
const val = arr[0];  // ✅ copy (i32 — примитив)
```

`arr[i]` для строк — copy (возвращает String struct, implicit ARC):

```typescript
const s = arr[0];  // ✅ ARC Copy (String struct)
```

### Массивы строк

`Array<string>` — при уничтожении массива освобождается каждая строка через `tsc_array_free_string` (макрос, принимает `Array_string *`):

```c
// runtime macro (simplified):
#define tsc_array_free_string(arr) do { \
    Array_string *_a_ = (arr); \
    for (size_t _i_ = 0; _i_ < _a_->length; _i_++) \
        tsc_string_release(_a_->data[_i_]); \
    free(_a_->data); \
    _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; \
} while(0)
```

### Поведение внутри функций

**Обычные функции** — передача массива по значению = move всего массива:

```typescript
function process(arr: i32[]): void { /* владеет arr */ }
function view(arr: Ref<i32[]>): void { /* borrow */ }
```

```c
void process_Array_i32(Array_i32 arr) { /* arr перемещён, caller обнулён */ }
void view_Array_i32(const Array_i32 *arr) { /* borrow pointer */ }
```

**Замыкания с array capture** — implicit **reference** (pointer на source):

```typescript
let data: number[] = [1, 2, 3];
const fn = (): number => data.length;
```

```c
typedef struct { Array_f64 *data; } _closure_0_env;  // pointer — reference
```

Массив захватывается **по ссылке** (pointer). Source жив, mutations visible. См. `spec/05e-closures.md`.

### Spread массивов

> **Приоритет:** при конфликте — доминирует `spec/05d-spread-destructuring-merge.md`.

Spread **копирует** элементы — source жив. Move semantics для spread не применяется. `let`/`const` на source не влияет — всегда copy.

**Массивы примитивов — copy (source жив):**

```typescript
const nums: i32[] = [1, 2, 3];
const copy = [...nums, 4, 5];  // copy — примитивы копируются
console.log(nums.length);      // 3 — nums жив
```

Примитивы — copy by value. Spread не потребляет источник.

**Массивы сложных типов — copy + retain (source жив):**

```typescript
const admins: Admin[] = [admin1, admin2];
const users = [...admins, ...guests];  // copy + retain, admins жив
console.log(admins[0].name);           // ok
```

```c
// struct copy каждого элемента + retain string-полей
Admin _d0[] = {admins.data[0], admins.data[1], guests.data[0], ...};
tsc_string_retain(admins.data[0].name);
tsc_string_retain(admins.data[1].name);
Array_Admin users = {.data = _d0, .length = 4, .capacity = 4};
// admins untouched
```

**Массивы из `Shared<T[]>` — retain:**

```typescript
const base: Shared<Item[]> = [item1, item2];
const listA = [...base, itemA];  // ok — retain, base жив
const listB = [...base, itemB];  // ok — retain, base жив
```

**Массивы строк — ARC Copy при spread:**

```typescript
let names: string[] = ["Alice", "Bob"];
const copy = [...names, "Charlie"];
// Каждый элемент: tsc_string_retain → копия struct
// names жив, строки живы (refcount++)
console.log(names[0]);  // "Alice" — жив
```

### Деструктуризация массивов

> **Приоритет:** при конфликте — доминирует `spec/05d-spread-destructuring-merge.md`.

Деструктуризация **копирует** элементы — source жив. Move semantics для деструктуризации не применяется.

**Полная деструктуризация — copy всех элементов:**

```typescript
let arr: number[] = [1, 2, 3];
const [a, b, c] = arr;  // copy трёх элементов
console.log(arr[0]);     // 1 — arr жив
```

**Rest в деструктуризации — copy первого + deep copy rest:**

```typescript
let arr = [10, 20, 30];
const [first, ...rest] = arr;  // copy first + deep copy rest
console.log(arr[0]);           // 10 — arr жив
```

```c
int32_t first = arr.data[0];       // copy (примитив)
Array_i32 rest = tsc_array_slice_i32(arr, 1, (int32_t)arr.length);  // deep copy
// arr untouched
```

Rest-часть — **независимая копия** через `tsc_array_slice_*`: malloc + memcpy. Source остаётся живым, cleanup source и rest независимы. Для `Array<string>` — `tsc_array_slice_string` делает `tsc_string_retain` каждого элемента.

**Деструктуризация массива объектов — copy + retain:**

```typescript
let users = [user1, user2];
const [first, ...rest] = users;  // copy: struct copy + retain string-полей
console.log(users[0].name);      // ok — users жив
```

**Деструктуризация массива строк — ARC Copy:**

```typescript
let names = ["Alice", "Bob"];
const [first, ...rest] = names;
// first: tsc_string_retain → ARC Copy
// rest: каждый элемент retain → ARC Copy
// names жив, строки живы (refcount++)
console.log(names[0]);  // "Alice" — жив
```

### Array `capacity` — owning vs non-owning

`Array<T>` struct имеет три поля: `data`, `length`, `capacity`. Значение `capacity` определяет owning semantics:

| `capacity` | Семантика | Кто освобождает `data` |
|------------|-----------|----------------------|
| `> 0` | **Owning** — массив владеет `data` | `tsc_array_free_*` при cleanup |
| `= 0` | **Non-owning** — `data` указывает на чужую память | Никто — `tsc_array_free_*` пропускает |

**Источники `capacity = 0` (non-owning):**

1. **Array range expression** (`arr[1..3]`): `{.data = arr.data + 1, .length = 2, .capacity = 0}` — view в оригинальный массив
2. **Async array literals**: в async-функциях данные литерала размещаются как `static` (переживают poll-цикл), struct = `{.data = static_arr, .length = N, .capacity = 0}`

**`tsc_array_free_*` guard:**

```c
#define tsc_array_free_i32(arr) do { \
    Array_i32 *_a_ = (arr); \
    if (_a_->data && _a_->capacity > 0) free(_a_->data); \
    _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; \
} while(0)
```

Проверка `capacity > 0` гарантирует что non-owning arrays не вызовут `free` на чужую память.

**Мутация non-owning array = UB:** `push`, `pop`, `resize` на массиве с `capacity = 0` приведут к `realloc` на чужом указателе. Для мутации — используйте `.clone()` сначала.

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `Array<T>` | Heap, динамический рост через `realloc` | Фиксированный `T[capacity]` (статический или стековый) |
| `new Array<T>(100)` | `Array_i32 arr = tsc_array_create_i32(100);` (stack struct, heap data buffer) | `Array_i32 arr = {.data = buf, .capacity = 100, .length = 0};` |
| Move (zero-out) | `memset(&src, 0, sizeof(Array_i32))` | Аналогично |
| Ref/Mut borrow | Pointer (`const Array_i32*` / `Array_i32*`) | Pointer (идентично) |
| `arr.push(val)` | `realloc` при росте | Только если `length < capacity`, иначе ошибка |
| `tsc_array_free_string` | release каждого элемента | release = no-op (строки rodata) |
| Spread массива | Copy (retain для string-элементов), source жив | Copy (no-op retain для string-элементов), source жив |
| Деструктуризация массива | Copy элементов (retain для string), source жив | Copy элементов (no-op retain для string), source жив |
| Замыкания с array capture | Reference (pointer в env), source жив | Reference (pointer, идентично) |
| Деструктор | `free(arr.data)` + string cleanup | No-op или static reset |

**Ключевое отличие:** на embedded массивы — фиксированной ёмкости (`capacity` задана при создании, не растёт). `push` работает только если `length < capacity`. Нет `realloc`, нет heap. Деструктор — no-op (нечего освобождать).

### Почему так

Массивы — как классы: move semantics, zero-cost abstraction. Один владелец = один destructor call. Borrow (Ref/Mut) = pointer — блокирует мутацию пока жив. На embedded — фиксированная ёмкость, предсказуемое использование памяти.

---

## 5. a — кортеж (tuple)

Кортеж — фиксированный struct с полями `_0`, `_1`, `_2`... Каждый элемент может быть своего типа. Не массив, не класс — отдельный тип.

C-output: struct с именованными полями:

```c
typedef struct {
    int32_t _0;
    String  _1;
} tuple_i32_string;
```

### Обычные переменные

Семантика зависит от типов элементов:

| Паттерн | Элементы | Семантика | C-вывод |
|---------|----------|-----------|---------|
| `let b = a` | Все примитивы | Copy struct | `tuple_i32_f64 b = a;` |
| `let b = a` | Есть string/класс | Move + zero-out | `tuple_i32_string b = a; a = (tuple_i32_string){0};` |
| `const b = a` | Все примитивы | Copy struct (const) | `const tuple_i32_f64 b = a;` |
| `const b = a` | Есть string/класс | Move + zero-out | `const tuple_i32_string b = a; a = (tuple_i32_string){0};` |
| `b = a` (reassign) | Есть string/класс | Move + zero-out | `b = a; a = (tuple_i32_string){0};` |

Кортеж со сложными элементами ведёт себя как класс: move + zero-out. Кортеж со всеми примитивами — как примитив: copy.

### Ref\<T\> / Mut\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<[User, string]> = a` | Borrow всей struct | `const tuple_User_string *b = &a;` |
| `const b: Mut<[User, string]> = a` | Mutable borrow | `tuple_User_string *b = &a;` |

### Shared\<T\> / Weak\<T\>

Аналогично классам — нельзя создать `Shared<tuple>` из owned. Tuple — value type, как класс.

### Доступ к элементам

```typescript
let pair: [i32, string] = [1, "hello"];
pair[0]    // 1 — i32 (copy, примитив)
pair[1]    // "hello" — string (ARC Copy, retain)
pair._0    // сахар над pair[0]
```

Labeled tuples — dot-access:

```typescript
type Point = [x: f64, y: f64];
let p: Point = [1.0, 2.0];
p.x   // сахар над p._0
p.y   // сахар над p._1
```

### Readonly кортежи

```typescript
let t: readonly [i32, string] = [1, "hello"];
t[0] = 5  // ❌ cannot assign to readonly tuple element
```

```c
typedef struct {
    const int32_t _0;
    const String  _1;
} readonly_tuple_i32_string;
```

### Optional элементы

Optional (`?`) разрешены только в конце:

```typescript
type Config = [string, i32?];
let a: Config = ["localhost"];         // ok — i32 отсутствует
let b: Config = ["localhost", 8080];   // ok
a[1]  // i32 | null
```

```c
typedef struct {
    String  _0;
    opt_i32 _1;  // bool has_value + int32_t value
} tuple_string_opt_i32;
```

### Rest-элементы

`...T[]` — произвольное количество элементов в конце. Один rest, только в конце, несовместим с optional.

```typescript
type Strings = [string, ...string[]];
let a: Strings = ["first"];
let b: Strings = ["first", "second", "third"];
```

```c
typedef struct {
    String  _0;
    String* _tail;
    usize   _tail_len;
} tuple_string_rest_string;
```

Rest-часть требует heap. На embedded — те же правила что и `Array`.

### Spread в tuple-литералах

> **Приоритет:** при конфликте — доминирует `spec/05d-spread-destructuring-merge.md`.

Spread фиксированного tuple — размер известен статически:

```typescript
const pair: [number, number] = [1.0, 2.0];
const triple: [number, number, number] = [...pair, 3.0];  // ok — compile-time размер
const copy: [number, number, number] = [...pair];              // copy
```

Spread runtime-массива в rest-tuple — разрешён:

```typescript
function wrap(items: string[]): [i32, ...string[]] {
    return [0, ...items];  // ok — items.length становится _tail_len
}
```

Spread runtime-массива в фиксированный tuple — **ошибка**:

```typescript
let t: [i32, string, string] = [1, ...runtimeArray];
// ❌ error: cannot spread runtime-length array into fixed tuple
```

### Деструктуризация

> **Приоритет:** при конфликте — доминирует `spec/05d-spread-destructuring-merge.md`.

Деструктуризация кортежа **всегда copy** — source жив, нет move, нет E002. `let`/`const` на source не влияет.

| Паттерн | Семантика |
|---------|-----------|
| `const [a, b] = pair` | Copy элементов + retain string-полей, tuple жив |
| `let [a, b] = pair` | Copy элементов + retain string-полей, tuple жив |
| `const [x, , z] = triple` | Copy указанных + retain string-полей |
| `const [user, name] = t` (owned) | Struct copy + retain string-полей, t жив |
| `const [user, name] = t` (Ref\<tuple\>) | Copy + retain string-полей, t жив |

```typescript
let t: [User, string] = [new User(), "test"];

// Copy — tuple жив
const [user, name] = t;  // user: User (struct copy), name: string (retain); t жив
console.log(t._0.name);  // ok

// Borrow — через Ref
function process(t: Ref<[User, string]>): void {
    const [user, name] = t;  // copy + retain, t жив
}
```

**String-элементы при деструктуризации** — retain при извлечении, release в cleanup (как при деструктуризации объекта).

### Поведение внутри функций

**Передача по значению** — copy (примитивы) или move (сложные элементы):

```typescript
function swap(t: [i32, string]): [string, i32] {
    return [t[1], t[0]];
}
```

**Ref\<tuple\>** — borrow, деструктуризация даёт `Ref<T>` для каждого элемента.

**Замыкания с tuple capture** — как класс: reference (pointer в env), source жив. См. `spec/05e-closures.md`.

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| Fixed tuple struct | На стеке, как любой struct | Аналогично |
| Rest tuple `_tail` | `malloc` для tail-массива | Статический буфер или фиксированный массив |
| String-элементы | ARC retain/release | No-op (rodata) |
| Optional элементы | `opt_T` struct (bool + value) | Аналогично |
| Spread fixed tuple | Copy элементов + retain string-полей, source жив | Copy элементов (string — no-op retain), source жив |
| Деструктуризация | Copy элементов + retain string-полей, source жив | Copy элементов (string — no-op), source жив |

**Ключевое отличие:** rest tuple (`...T[]`) требует heap на desktop. На embedded — статический буфер с фиксированной ёмкостью, как `Array`.

### Почему так

Кортеж — value type: spread и деструктуризация **всегда copy** (см. `spec/05d-spread-destructuring-merge.md`, D1). Source жив, нет move, нет E002. String-элементы — retain при copy (новый владелец), release в cleanup.

```typescript
// всегда copy + retain
let pair: [i32, string] = [1, "hello"];
const [a, b] = pair;  // b: retain("hello"), pair жив
console.log(pair._1);  // ok

// const source — тоже copy
const pair2: [i32, string] = [2, "world"];
const [c, d] = pair2;  // d: retain("world"), pair2 жив
```

Move для кортежей — **только при прямом присваивании** (`let b = a`), не при spread/деструктуризации.

---

## 6. Ownership-модификаторы: Shared\<T\> и Weak\<T\>

`Shared<T>` и `Weak<T>` — не отдельные типы данных, а модификаторы схемы владения. Применяются только к классам (и массивам классов). Desktop-only: нет heap → нет ARC → нет shared ownership.

### Shared\<T\> — ARC ownership

Объект создаётся с аннотацией `Shared<T>`, после чего все присваивания — retain/release.

```typescript
let node: Shared<Node> = new Node();  // refcount = 1
```

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | ARC Retain | `Node *b = a; tsc_arc_retain(b);` + cleanup: `tsc_arc_release(b);` |
| `const b = a` | ARC Retain | `const Node *b = a; tsc_arc_retain(b);` + cleanup: `tsc_arc_release(b);` |
| `b = a` (reassign) | ARC Retain | retain new + release old + assign |

### Weak\<T\> — weak reference

Weak reference на Shared-объект. Не увеличивает refcount, не удерживает от освобождения.

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
| `if (w != null) { w.method() }` | Narrowing | Внутри блока `w` — `Shared<T>` (non-null) |

### Upgrade Weak → Shared

```typescript
let s: Shared<Node> = w;   // ❌ нельзя — weak может быть dangling
if (w != null) {
    let s: Shared<Node> = w;  // ✅ после narrowing — w считается живым
}
```

Null-check = проверка что объект ещё жив (`_refcount > 0`). После narrowing компилятор считает `w` живым `Shared<T>`.

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

### Поведение внутри функций

**Shared — передача в функцию:** pointer, refcount не меняется при передаче параметра:

```typescript
function share(node: Shared<Node>): void {
    // node передан как pointer, refcount не меняется (already shared)
}
```

```c
void share(Node *node) { /* pointer, refcount не трогаем */ }
```

Retain/release происходят при присваивании, не при передаче параметра. Если функция сохраняет `node` в поле или глобал — retain происходит в момент присваивания.

**Shared — return:** retain на return path:

```typescript
function getShared(): Shared<Node> {
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
function getPrev(node: Shared<Node>): Weak<Node> {
    return node.prev;
}
```

```c
Node *getPrev(Node *node) { return node->prev; }
```

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `Shared<T>` | Доступен (ARC через `_refcount` в объекте) | **Недоступен** — ошибка компиляции (нет heap) |
| `Weak<T>` | Доступен | **Недоступен** |
| `tsc_arc_retain` | `ptr->_refcount++` | — |
| `tsc_arc_release` | `--ptr->_refcount; if (ptr->_refcount <= 0 && ptr->_weakcount <= 0) free(ptr)` | — |
| `tsc_weak_upgrade` | `ptr->_refcount > 0 ? (ptr->_refcount++, ptr) : NULL` | — |
| Null-check Weak | `w != NULL && w->_refcount > 0` | — |
| Создание | `Node *n = tsc_arc_alloc(sizeof(Node));` | — |

`Shared<T>` и `Weak<T>` — **desktop-only**. На embedded нет heap → нет ARC → нет shared ownership. Для совместного доступа на embedded используются `Ref<T>` (borrow) и `@static let` (глобальное состояние).

### Ограничения

- `Shared<T>` **только на desktop** — не доступен на embedded (нет heap)
- `Shared<T>` **только для классов** — нельзя `Shared<string>` (строки используют свой ARC), нельзя `Shared<primitive>` (ошибка компиляции)
- Allocator `none` / `static` — `Shared<T>` недоступен

### Почему так

ARC для графов, циклических структур, неопределённого времени жизни. Refcount = предсказуемое освобождение (в отличие от GC). Weak разрывает циклы без утечек — единственный механизм в ARC. Desktop-only: refcount требует atomic operations и heap allocation. Weak dereference всегда null-safe: компилятор требует `?.` или `??` или null-check перед доступом.

---

## 7. Ownership в async-функциях

Async-функции компилируются в state machine (SM) — struct с полями для переменных, живых через `await`. Ownership для строк и классов в SM отличается от синхронного кода.

### 7.1 String params — retain-on-capture

В синхронном коде строковые параметры используют **implicit borrow** (caller не делает retain, callee не делает release). В async-функциях это **небезопасно**: caller продолжает выполнение после первого `await` и может освободить или перезаписать оригинальную строку.

Поэтому строковые параметры при копировании в SM struct **принудительно удерживаются**:

```typescript
async function greet(name: string): void {
    await sleep(100);
    console.log(name);  // name должен быть жив здесь
}
```

```c
static void greet_poll(greet_state *self) {
    switch (self->_state) {
        case 0:
            tsc_string_retain(self->name);  // retain-on-capture
            self->_await_0 = tsc_sleep_awaitable(100);
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_sleep_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            printf("%.*s\n", self->name.length, self->name.data);
            goto _cleanup;
        _cleanup:
            tsc_string_release(self->name);  // cleanup
            self->_done = true;
            return;
    }
}
```

| Аспект | Синхронная функция | Async-функция |
|--------|-------------------|---------------|
| `string` param | Implicit borrow (zero-cost) | Retain-on-capture + cleanup release |
| Caller | Не делает retain | Не делает retain |
| Callee | Не делает release | Release в cleanup |

### 7.2 String locals в SM struct

Строковые локальные переменные, живые через `await`, попадают в SM struct. Инициализация из Ident/Member/Index требует retain (новый владелец):

```typescript
async function process(): void {
    const raw = await fetchData();
    const copy = raw;  // copy из Ident → retain
    await sleep(10);
    console.log(copy);
}
```

```c
// в poll:
self->raw = self->_await_0._result;     // ownership transfer — без retain
self->copy = self->raw;                  // Ident init → нужен retain
tsc_string_retain(self->copy);
```

| Init source | Retain нужен? | Почему |
|-------------|---------------|--------|
| Await result (`self->_await_N._result`) | Нет | Ownership transfer от sub-SM |
| Function call result | Нет | Callee уже retain на return |
| String literal (`"hello"`) | No-op | `capacity=0`, retain = no-op |
| Ident (`self->other`) | Да | Новый владелец, нужен retain |
| Member (`self->obj.field`) | Да | Новый владелец |
| Index (`self->arr.data[i]`) | Да | Новый владелец |

### 7.3 Cleanup — `goto _cleanup`

Все exit points SM (return, throw, implicit done, catch fallthrough) перенаправляются на единую метку `_cleanup` внутри switch. Cleanup освобождает все string-поля, вызывает `_free()` для классов с string-полями, и вызывает `tsc_array_free_*` для array-полей:

```c
_cleanup:
    tsc_string_release(self->url);
    tsc_string_release(self->data);
    User_free(&self->user);       // класс с string-полями
    tsc_array_free_i32(&self->items);  // array field cleanup
    self->_done = true;
    return;
```

**Почему `goto _cleanup`, а не inline cleanup:** один блок cleanup вместо N копий release/free вызовов на каждом exit point. На AVR/NES экономия ROM критична.

**Почему безусловный release всех полей:** SM struct инициализируется `{0}` — String поля `{0}` имеют `data=NULL, _refcount=NULL`, release = no-op. Класс-поля `{0}` → `ClassName_free` с `if (!self) return;`. Классы — value types на стеке, `_free` освобождает только string-поля, не `free(self)`. Безопасно.

**Opt-out:** если async-функция не имеет string/class/array полей (только примитивы), cleanup label не генерируется — exit points остаются `self->_done = true; return;` без overhead.

**Array-поля в cleanup:** для каждого array-поля с элементами non-примитивного типа (динамический массив) компилятор генерирует `tsc_array_free_*` в cleanup. Array-поля с `capacity=0` (non-owning) — `tsc_array_free_*` пропускает `free` (см. раздел «Array `capacity` — owning vs non-owning»).

### 7.4 Ref\<T\> через await — запрещено

Уже реализовано: если async-функция с `await` имеет параметр `Ref<T>`, компилятор выдаёт ошибку:

```typescript
async function bad(arr: Ref<i32[]>): void {
    await sleep(10);  // ❌ Ref<T> cannot live across "await"
}
```

Borrow не может быть сохранён в SM struct — нет гарантии что источник жив после `await`.

### 7.5 Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `tsc_string_retain` на capture | `if (_refcount) (*_refcount)++` | No-op |
| `tsc_string_release` в cleanup | Decrement refcount, free при 0 | No-op (ring buffer, нет индивидуального free) |
| `ClassName_free` в cleanup | Release string-полей (без `free(self)`) | No-op |
| Cleanup label | Генерируется при наличии string/class полей | Аналогично (no-op retain/release) |
| `goto _cleanup` overhead | Нет (внутри switch) | Нет |

На embedded retain/release = no-ops. Cleanup всё равно генерируется (для корректности), но не имеет runtime-cost.

### 7.6 Generator cleanup

Синхронные генераторы (`function*`) используют аналогичную SM struct с promoted let-fields. String let-fields в генераторах получают retain перед `yield` и release в cleanup при `_done = true`.

**Retain перед yield:** когда string-переменная инициализируется из Ident/Member/Index (а не из литерала или результата вызова), компилятор вставляет `tsc_string_retain` — генератор становится новым владельцем.

**Cleanup через `goto _cleanup`:** все exit points (return, throw, implicit done) перенаправляются на единую метку `_cleanup` внутри switch. Cleanup освобождает все string-поля и вызывает `_free()` для классов с string-полями — аналогично async (§7.3).

**Opt-out:** если генератор не имеет string/class let-полей, cleanup label не генерируется — exit points остаются `self->_done = true; return;` без overhead.

**Liveness optimization:** переменные, не пересекающие yield-границы и имеющие примитивный тип, не промоутятся в SM struct — остаются локальными переменными внутри case-блока. String/class типы всегда промоутятся (нужен cleanup).

### Почему так

Async-функция — это state machine с неопределённым временем жизни. Переменные переживают `await` и должны быть независимыми владельцами данных. Retain-on-capture для строк — минимальная цена за безопасность: на embedded это no-op, на desktop — один increment. Централизованный cleanup через `goto _cleanup` исключает утечки и минимизирует ROM.
