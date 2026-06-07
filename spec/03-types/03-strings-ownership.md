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
| String struct | 32 байта (`data`, `length`, `capacity`, `_refcount`) | 6 байт (AVR 16-bit), 12 байт (32-bit), 24 байт (64-bit) — без `_refcount` |
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
// Desktop: 32 байта (64-bit: 8+8+8+8), Embedded: 6/12/24 байта (AVR/32-bit/64-bit, без _refcount)
#ifdef TSC_EMBEDDED
typedef struct { const char *data; size_t length; size_t capacity; } String;
#else
typedef struct { const char *data; size_t length; size_t capacity; uint32_t *_refcount; } String;
#endif
```

### Почему так

Строки immutable — безопасно иметь несколько владельцев одной и той же строки. ARC гарантирует, что heap-память освободится, когда последний владелец отпустит строку. Литералы (rodata, capacity=0) — retain/release no-ops, нулевой overhead. На embedded строки всегда rodata, ARC не используется.

---

