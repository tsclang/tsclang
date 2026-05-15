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
| `new` (классы) | `malloc(sizeof(T))` | Статический аллокатор или stack |

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
| `b += a` | Eval concat → release old → assign | `String _tmp = tsc_string_concat(b, a); tsc_string_release(&b); b = _tmp;` |

`tsc_string_concat` возвращает новую строку с refcount=1 (ownership transfer), поэтому retain не нужен.

### Параметры функций

`string` в параметрах — **implicit borrow** (zero-overhead): caller **не** делает retain, callee **не** делает release. Владение остаётся у caller.

### Очистка памяти

Для строк очистка отличается от примитивов — нужен cleanup release при каждом выходе из scope:

| Случай | Что происходит |
|--------|---------------|
| Выход из блока `{}` | `tsc_string_release(&b)` в cleanup. Если refcount → 0: `free(data)` + `free(_refcount)`, иначе просто decrement |
| Выход из функции | То же — cleanup release для всех локальных строк |
| Reassign (`b = newValue`) | Safe temp: retain new → release old → assign. Старое значение освобождается **сразу** |
| `b += "suffix"` | Eval concat → `tsc_string_release(&b)` → assign. Старая строка освобождается |
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
tsc_string_retain(&_t);                 // retain new
tsc_string_release(&obj->name);         // release old
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
    tsc_string_retain(&copy);
    printf("%.*s\n", copy.length, copy.data);
    tsc_string_release(&copy);  // cleanup
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
    tsc_string_retain(&_r);
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
| `tsc_string_release` | `if (_refcount && --*_refcount == 0) { free(_refcount); free(data); }` | `if (capacity > 0) free(data)` |
| Heap-строки (concat, slice, etc.) | `malloc` для data + `_refcount`, ARC | `malloc` для data только, нет refcount |
| Safe temp pattern | retain new → release old → assign | Присваивание без retain (no-op), release = `free(old data)` |
| Implicit borrow параметров | Caller не retain, callee не release | Аналогично |
| Замыкания с string capture | Retain в env, release в destroy fn | No-op retain, release = `free(data)` в destroy fn |
| `Shared<string>` | Не поддерживается (свой ARC) | Не поддерживается |

**Ключевое отличие:** на embedded нет ARC — нет `_refcount`, retain всегда no-op, release = `free(data)` при `capacity>0`. Строки на embedded — «один владелец»: нет sharing, нет refcount. Каждая heap-строка освобождается ровно один раз.

**C-определение String struct:**

```c
// Desktop (32 байта)
#ifdef TSC_EMBEDDED
typedef struct { const char *data; uint32_t length; uint32_t capacity; } String;
#else
typedef struct { const char *data; uint32_t length; uint32_t capacity; uint32_t *_refcount; } String;
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

### Borrow полей объектов — запрещён

```typescript
const u: Ref<User> = container.user;  // ❌ Cannot borrow a class field
const m: Mut<User> = container.user;  // ❌ Cannot borrow a class field
```

Паттерн: передавать весь объект как `Ref<Container>`.

### Классы с string-полями

Компилятор автоматически генерирует `ClassName_free()` — деструктор, который вызывает `tsc_string_release` для каждого string-поля:

```typescript
class User {
    name: string;
    email: string;
}
```

```c
static void User_free(User *self) {
    tsc_string_release(self->name);
    tsc_string_release(self->email);
}
```

Деструктор вызывается в cleanup-секции при выходе из scope, где класс был создан или перемещён.

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

**Замыкания с class capture** — implicit `Ref<T>` (copy pointer в env struct):

```typescript
let u = new User();
const fn = (): i32 => u.value;
```

```c
typedef struct { User *u; } _closure_0_env;  // pointer — borrow
```

Класс захватывается как pointer (borrow), не как полная копия struct. Замыкание не владеет объектом.

### Spread объектов

Spread **потребляет** источник — move. Работает для объектов (struct / class).

**Object spread из `let` — move:**

```typescript
let base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };  // ok — move из let
console.log(base);  // ❌ E008: use after move
```

```c
// C-output (упрощённо):
BaseType extended = base;
extended.extra = 42;
memset(&base, 0, sizeof(BaseType));
```

Все поля копируются в новый объект, оригинал обнуляется.

**Object spread из `const` — ошибка:**

```typescript
const base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };
// ❌ error: cannot spread const object
// hint: use let, Shared<T>, or { ...base.clone(), extra: 42 } if type implements Clone
```

Поля объекта могут быть сложными типами (string, классы) — нельзя move из const.

**Object spread из `Shared<T>` — retain:**

```typescript
const obj: Shared<Config> = new Config();
const a = { ...obj, y: 2 };  // ok — retain, obj жив
const b = { ...obj, z: 3 };  // ok — retain, obj жив
```

**String-поля при spread** — retain при копировании, release в cleanup:

```typescript
let base = { name: "Alice", age: 30 };
const copy = { ...base };  // name: retain("Alice"), age: copy
```

```c
// name — ARC Copy (retain + cleanup release)
// age — побитовое копирование (i32)
```

### Деструктуризация объектов

Деструктуризация **потребляет** источник — move полей.

**Полная деструктуризация — move всех полей:**

```typescript
let user = { name: "Alice", age: 30 };
const { name, age } = user;  // move обоих полей
console.log(user.name);      // ❌ E008: use after move
```

**Частичная деструктуризация с rest — move указанных полей + rest:**

```typescript
let user = { name: "Alice", age: 30, email: "a@b.c" };
const { name, ...rest } = user;  // move name + move rest
```

```c
String name = user.name;                // move string — retain
int32_t age = user.age;                 // move primitive — copy
String email = user.email;              // move string — retain
memset(&user, 0, sizeof(UserType));     // zero-out
```

**Деструктуризация с Ref — borrow (без move):**

```typescript
const { name }: Ref<User> = user;  // borrow — user жив
```

**String-поля при деструктуризации** — retain при извлечении, release в cleanup:

```typescript
const { name, email } = user;
// name: retain("Alice"), email: retain("a@b.c")
// cleanup: tsc_string_release(name); tsc_string_release(email);
```

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `new User()` | `User *u = malloc(sizeof(User)); memset(u, 0, sizeof(User));` | Статический аллокатор: `User u = {0};` (на стеке или в BSS) |
| Move (zero-out) | `memset(&src, 0, sizeof(T))` | Аналогично |
| Ref/Mut borrow | Pointer (`const T*` / `T*`) | Pointer (идентично) |
| `ClassName_free()` | `free(ptr)` + release string-полей | No-op или static reset (string-поля — no-op retain/release) |
| Замыкания с class capture | Pointer в env struct (borrow) | Pointer (идентично) |
| Spread объекта | Move полей + retain string-полей | Move полей (string — no-op retain) |
| Деструктуризация объекта | Move полей + retain string-полей + cleanup release | Move полей (string — no-op) |
| Деструктор при exit | Cleanup loop: `for (...) free(...)` | Cleanup loop: `for (...) {0}` (reset без free) |

**Ключевое отличие:** на embedded нет heap → нет `malloc`/`free`. Объекты размещаются на стеке или в статической памяти (BSS). Move = копирование struct + zero-out оригинала, но без освобождения памяти (нечего освобождать). String-поля на embedded — no-op retain/release (строки всегда rodata).

### Почему так

Move semantics = zero-cost abstraction. Нет refcount, нет runtime overhead. Один владелец = один destructor call. Borrow (Ref/Mut) = pointer — нулевой overhead, но compile-time guarantee безопасности.

---

## 4. a — массив (owned T)

Массивы — **move semantics**, как классы. Присваивание передаёт ownership, оригинал обнуляется.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | Move + zero-out | `Array_i32 b = a; memset(&a, 0, sizeof(Array_i32));` |
| `const b = a` | Move + zero-out | `const Array_i32 b = a; memset(&a, 0, sizeof(Array_i32));` |
| `b = a` (reassign) | Move + zero-out | `b = a; memset(&a, 0, sizeof(Array_i32));` |

После move `a` обнуляется, доступ к `a` — ошибка компиляции (`E008: use after move`).

### Передача в функцию

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `foo(a)` (param: `T[]`) | Move + zero-out после вызова | `foo(a); memset(&a, 0, sizeof(Array_i32));` (через `_postStmtCleanups`) |

```typescript
function sum(arr: i32[]): i32 { ... }
let data = [1, 2, 3];
sum(data);
console.log(data.length);  // ❌ E008: use after move
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

`Array<string>` — при уничтожении массива释放 каждая строка через `tsc_array_free_string`:

```c
void tsc_array_free_string(String *parts, int32_t len) {
    for (int32_t i = 0; i < len; i++) {
        tsc_string_release(parts[i]);
    }
}
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

**Замыкания с array capture** — implicit `Ref<T>` (copy pointer в env struct), как с классами:

```typescript
let data = [1, 2, 3];
const fn = (): i32 => data.length;
```

```c
typedef struct { Array_i32 *data; } _closure_0_env;  // pointer — borrow
```

Массив захватывается как pointer (borrow). Замыкание не владеет массивом.

### Spread массивов

Spread **потребляет** источник — move. Работает для массивов.

**Массивы примитивов из `const` — copy (разрешено):**

```typescript
const nums: i32[] = [1, 2, 3];
const copy = [...nums, 4, 5];  // ok — примитивы копируются
console.log(nums);             // ok — nums жив
```

Примитивы — copy by value. Spread не потребляет источник. Каждый элемент побитово копируется.

**Массивы сложных типов из `const` — ошибка (move невозможен):**

```typescript
const admins: Admin[] = [admin1, admin2];
const users = [...admins, ...guests];
// ❌ error: cannot spread const array of non-primitive type
// hint: use let, Shared<T>, or [...admins.clone()] if Admin implements Clone
```

**Массивы сложных типов из `let` — move:**

```typescript
let admins: Admin[] = [admin1, admin2];
const users = [...admins, ...guests];  // ok — move из let
sendEmail(admins);  // ❌ E008: admins перемещён
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
// names: zero-out (move), но строки живы (refcount++)
```

### Деструктуризация массивов

Деструктуризация **потребляет** источник — move элементов.

**Полная деструктуризация — move всех элементов:**

```typescript
let arr = [1, 2, 3];
const [a, b, c] = arr;  // move трёх элементов
console.log(arr[0]);     // ❌ E008: use after move
```

**Rest в деструктуризации — move первого + rest:**

```typescript
let arr = [10, 20, 30];
const [first, ...rest] = arr;  // move first + move rest
```

```c
int32_t first = arr.data[0];       // copy (примитив)
Array_i32 rest = {.data = arr.data + 1, .length = arr.length - 1};
memset(&arr, 0, sizeof(Array_i32));
```

**Деструктуризация массива объектов — move:**

```typescript
let users = [user1, user2];
const [first, ...rest] = users;  // move user1 + move rest
```

**Деструктуризация массива строк — ARC Copy:**

```typescript
let names = ["Alice", "Bob"];
const [first, ...rest] = names;
// first: tsc_string_retain → ARC Copy
// rest: каждый элемент retain → ARC Copy
// names: zero-out (move), но строки живы
```

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `Array<T>` | Heap, динамический рост через `realloc` | Фиксированный `T[capacity]` (статический или стековый) |
| `new Array<T>(100)` | `malloc(sizeof(Array_i32))` | `Array_i32 arr = {.data = buf, .capacity = 100, .length = 0};` |
| Move (zero-out) | `memset(&src, 0, sizeof(Array_i32))` | Аналогично |
| Ref/Mut borrow | Pointer (`const Array_i32*` / `Array_i32*`) | Pointer (идентично) |
| `arr.push(val)` | `realloc` при росте | Только если `length < capacity`, иначе ошибка |
| `tsc_array_free_string` | release каждого элемента | release = no-op (строки rodata) |
| Spread массива | Move (retain для string-элементов) | Move (no-op retain для string-элементов) |
| Деструктуризация массива | Move элементов (retain для string) | Move элементов (no-op retain для string) |
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
| `let b = a` | Есть string/класс | Move + zero-out | `tuple_i32_string b = a; memset(&a, 0, sizeof(...));` |
| `const b = a` | Все примитивы | Copy struct (const) | `const tuple_i32_f64 b = a;` |
| `const b = a` | Есть string/класс | Move + zero-out | `const tuple_i32_string b = a; memset(&a, 0, sizeof(...));` |
| `b = a` (reassign) | Все примитивы | Copy | `b = a;` |
| `b = a` (reassign) | Есть string/класс | Move + zero-out | `b = a; memset(&a, 0, sizeof(...));` |

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

Spread фиксированного tuple — размер известен статически:

```typescript
const pair: [f64, f64] = [1.0, 2.0];
const triple: [f64, f64, f64] = [...pair, 3.0];  // ok — compile-time размер
const copy: [f64, f64, f64] = [...p];              // copy
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

| Паттерн | Семантика |
|---------|-----------|
| `const [a, b] = pair` | Move элементов, tuple обнулён |
| `const [x, , z] = triple` | Move с пропуском элемента |
| `const [user, name] = t` (owned) | Move: `user: User`, `name: string` |
| `const [user, name] = t` (Ref\<tuple\>) | Borrow: `user: Ref<User>`, `name: Ref<string>` |

```typescript
let t: [User, string] = [new User(), "test"];

// Move — tuple потреблён
const [user, name] = t;  // user: User, name: string; t невалиден

// Borrow — через Ref
function process(t: Ref<[User, string]>): void {
    const [user, name] = t;  // user: Ref<User>, name: Ref<string>
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

**Замыкания с tuple capture** — как класс: pointer в env struct (borrow).

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| Fixed tuple struct | На стеке, как любой struct | Аналогично |
| Rest tuple `_tail` | `malloc` для tail-массива | Статический буфер или фиксированный массив |
| String-элементы | ARC retain/release | No-op (rodata) |
| Optional элементы | `opt_T` struct (bool + value) | Аналогично |
| Spread fixed tuple | Copy/move элементов на стеке | Аналогично |
| Деструктуризация | Move/borrow элементов | Аналогично |

**Ключевое отличие:** rest tuple (`...T[]`) требует heap на desktop. На embedded — статический буфер с фиксированной ёмкостью, как `Array`.

### Почему так

Кортеж — value type: копируется если все элементы примитивы, перемещается если есть сложные. Spread — только compile-time размер (fixed tuple) или rest-tuple с heap. Деструктуризация из `Ref<tuple>` — borrow элементов, из owned — move. String-элементы — ARC Copy, как поля объекта.

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
| `let b = a` | ARC Retain | `Node *b = a; RC_retain(b);` + cleanup: `RC_release(b);` |
| `const b = a` | ARC Retain | `const Node *b = a; RC_retain(b);` + cleanup: `RC_release(b);` |
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
| `tsc_arc_release` | `if (--ptr->_refcount <= 0) free(ptr)` | — |
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
            tsc_string_retain(&self->name);  // retain-on-capture
            self->_await_0 = tsc_sleep_awaitable(100);
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_sleep_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            printf("%.*s\n", self->name.length, self->name.data);
            goto _cleanup;
        _cleanup:
            tsc_string_release(&self->name);  // cleanup
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
tsc_string_retain(&self->copy);
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

Все exit points SM (return, throw, implicit done, catch fallthrough) перенаправляются на единую метку `_cleanup` внутри switch. Cleanup освобождает все string-поля и вызывает `_free()` для классов с string-полями:

```c
_cleanup:
    tsc_string_release(&self->url);
    tsc_string_release(&self->data);
    User_free(&self->user);       // класс с string-полями
    self->_done = true;
    return;
```

**Почему `goto _cleanup`, а не inline cleanup:** один блок cleanup вместо N копий release/free вызовов на каждом exit point. На AVR/NES экономия ROM критична.

**Почему безусловный release всех полей:** SM struct инициализируется `{0}` — String поля `{0}` имеют `data=NULL, _refcount=NULL`, release = no-op. Класс-поля `{0}` → `ClassName_free` с `if (!self) return;`. Безопасно.

**Opt-out:** если async-функция не имеет string/class полей (только примитивы), cleanup label не генерируется — exit points остаются `self->_done = true; return;` без overhead.

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
| `tsc_string_release` в cleanup | Decrement refcount, free при 0 | `if (capacity > 0) free(data)` |
| `ClassName_free` в cleanup | `free(ptr)` + release string-полей | No-op или static reset |
| Cleanup label | Генерируется при наличии string/class полей | Аналогично (no-op retain/release) |
| `goto _cleanup` overhead | Нет (внутри switch) | Нет |

На embedded retain/release = no-ops. Cleanup всё равно генерируется (для корректности), но не имеет runtime-cost.

### 7.6 Generator cleanup (будущее)

Синхронные генераторы (`function*`) используют аналогичную SM struct с promoted let-fields. String let-fields в генераторах требуют аналогичного cleanup при `_done = true`. Это будет добавлено в отдельном проходе.

### Почему так

Async-функция — это state machine с неопределённым временем жизни. Переменные переживают `await` и должны быть независимыми владельцами данных. Retain-on-capture для строк — минимальная цена за безопасность: на embedded это no-op, на desktop — один increment. Централизованный cleanup через `goto _cleanup` исключает утечки и минимизирует ROM.
