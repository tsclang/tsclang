# TSClang — Замыкания: capture model, семантика, ограничения

> **СТАТУС: РЕШЕНО.**
>
> **ПРИОРИТЕТ:** при конфликте с другими разделами spec (`05b-ownership.md`, `05-memory.md`) по темам closures, capture model, env struct, closure semantics — доминирует этот файл. Решения здесь зафиксированы после аудита impl/spec/tests и являются окончательными.
>
> **Ключевое решение:** capture model — **гибридная**. Примитивы и строки = copy (snapshot). Class/array = reference (pointer). Source **всегда жив** после capture. Нет move capture, нет E002 для implicit capture.
>
> **Связь с 05c/05d:** for-of (05c) использует **borrow** (pointer) для complex-типов. Spread/destructuring (05d) использует **copy**. Closure capture = **reference** (pointer) для class/array — mutations видны снаружи, TS-совместимое поведение.
>
> **Обоснование:** П1 (кроссплатформенность) — stack-allocated env, pointer capture = C-compatible, работает на embedded без heap. П2 (TS compat) — class/array = reference как в TS. П3 (better than all) — проще Rust (нет Fn/FnMut/FnOnce), безопаснее C (нет dangling для same-scope), нет скрытого GC как TS.
>
> Опирается на: `spec/05b-ownership.md` (владение), `spec/05-memory.md` (модель памяти).

---

## 1. Зафиксированные решения

### D1: Capture model — гибридная (copy + reference)

**Решение:** тип захваченной переменной определяет способ capture:

| Тип | Capture | Обоснование |
|-----|---------|-------------|
| Примитив | Copy (snapshot) | Дёшево, безопасно, без алиасинга |
| String | Retain (ARC copy) | ARC refcount, source жив |
| Class/Array | Reference (pointer) | TS compat, mutations visible |

**Альтернативы отклонены:**
- Всё по значению (copy + move) — ломает closure semantics (source dead, нельзя использовать arr после capture)
- Всё по ссылке — примитивы по ссылке бессмысленны и добавляют overhead
- Heap-allocate env — нарушает П1 (embedded без heap)

**Статус: ✅ Решено. Реализовано.**

### D2: Примитивы — copy (snapshot), не reference

**Решение:** `i32`, `boolean`, `f64` и т.д. захватываются как copy. Изменение source после создания closure не влияет на captured value.

Отличие от TS (где `let x = 1; const fn = () => x; x = 2; fn()` → `2`). В TSClang → `1` (snapshot).

Обоснование: примитивы — маленькие значения, copy дешевле чем pointer + dereference. Нет алиасинга. Безопасно на всех платформах.

**Статус: ✅ Решено. Реализовано.**

### D3: String — retain (ARC copy)

**Решение:** `string` захватывается как shallow copy struct + `tsc_string_retain`. Env cleanup делает `tsc_string_release`. Source жив.

Отличие от TS (reference capture — изменение source видно в closure). В TSClang — snapshot (как у примитивов).

Обоснование: String = ARC-managed, retain/release — O(1), безопасно на всех платформах (no-op retain на embedded).

**Статус: ✅ Решено. Реализовано.**

### D4: Class/Array — reference (pointer)

**Решение:** class и array захватываются как pointer (`User *u`, `Array_i32 *arr`). Mutations внутри closure видны снаружи. Source жив.

Совпадает с поведением TS (reference capture). `arr[0] = 9` внутри closure видно как `arr[0] == 9` снаружи.

Обоснование: П2 (TS compat) — основное использование closures = shared mutable state. Без reference capture closures бесполезны для class/array.

**Статус: ✅ Решено. Реализовано.**

### D5: Explicit capture syntax — только Ref/Mut

**Решение:** explicit capture list `[...]` принимает только `Ref<T>` и `Mut<T>`:

```typescript
const fn = [arr: Mut<Array<i32>>](): void => { arr[0] = 9; };  // OK
const fn = [arr: Ref<Array<i32>>](): i32 => arr[0];             // OK
const fn = [arr](): void => { ... };                             // Error: requires a type annotation: Ref<T> or Mut<T>
```

Обоснование: убрали move `[x: T]` (D6). Остались только Ref/Mut — explicit borrow semantics.

**Статус: ✅ Решено. Реализовано.**

### D6: `[x: T]` move capture — убран

**Решение:** explicit move capture `[arr: Array<i32>]` убран. Compile error: «requires a type annotation: Ref<T> or Mut<T>».

Обоснование:
- П2 (TS compat) — в TS нет move-замыканий. Концепция чуждая для TS-разработчика.
- Нет реальных use cases — в практике TS/JS closures всегда shared mutable state.
- Ownership transfer в closure = концепция из Rust (`move ||`), не из TS.
- Escaping scope (единственный сценарий для move) — UB в любом случае (env на стеке).

**Статус: ✅ Решено. Убрано из компилятора.**

### D7: Escaping scope — документированное ограничение

**Решение:** closure — стековая. Env struct выделяется на стеке. Если closure переживает scope захваченных переменных — UB (dangling pointer).

Не фиксируется компилятором (нет lifetime analysis). Документировано как ограничение.

Альтернативы отклонены:
- Heap-allocate env — нарушает П1 (embedded без heap). Возможно в будущем как опция для desktop.
- Borrow checker (как Rust) — слишком сложно, нарушает П2 (TS compat).
- Compile-time escape analysis — возможен в будущем, но не сейчас.

**Статус: ✅ Решено. Документировано.**

---

## 2. Capture model — подробно

### Сводная таблица

| Тип переменной | Capture | C-representation в env | Source жив? | TS compat | Cleanup |
|---------------|---------|----------------------|-------------|-----------|---------|
| `i32`, `boolean`, `f64` и т.д. | Copy (snapshot) | `int32_t x;` | ✅ Да | ⚠️ Snapshot | Нет |
| `string` | Retain (ARC copy) | `String s;` | ✅ Да | ⚠️ Snapshot | `tsc_string_release` |
| Class (`User`) | Reference (pointer) | `User *u;` | ✅ Да | ✅ Mutations visible | Нет (source владеет) |
| Array (`Array<T>`) | Reference (pointer) | `Array_i32 *arr;` | ✅ Да | ✅ Mutations visible | Нет (source владеет) |
| `Ref<T>` (explicit) | Const pointer | `const User *u;` | ✅ Да | ✅ | Нет |
| `Mut<T>` (explicit) | Mutable pointer | `User *m;` | ✅ Да | ✅ | Нет |

### Ключевые свойства

1. **Source всегда жив.** Нет E002 для implicit capture. Переменная доступна после создания closure.
2. **Env не владеет class/array.** Env содержит pointer, не copy. Source владеет данными → source cleanup освобождает ресурсы.
3. **Env владеет String copies.** Env содержит retained copy → env cleanup делает release.
4. **Stack-allocated env.** Env struct живёт на стеке, в том же scope что closure.

---

## 3. Примеры

### 3.1 Примитив — copy, source жив

```typescript
let x: number = 42;
const fn = (): number => x + 1;
x = 99;
console.log(fn());   // 43 — x скопирован при создании closure
console.log(x);      // 99 — source жив, изменение видно
```

```c
typedef struct { double x; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->x + 1;
}

// main:
double x = 42.0;
_closure_0_env fn_env = {.x = x};           // copy
tsc_closure fn = {.env = &fn_env, .fn = ...};
x = 99.0;
printf("%d\n", ((int32_t (*)(void *))fn.fn)(fn.env));  // 43
printf("%g\n", (double)(x));                             // 99
```

**Пояснение:** `x` скопирован в env при создании closure. Изменение `x = 99` не влияет на `env->x`. Source `x` жив и доступен. В TS результат был бы `100` (reference capture).

### 3.2 Строка — retain, source жив

```typescript
const prefix: string = "Hello";
const greet = (name: string): string => {
    return prefix + ", " + name;
};
console.log(greet("World"));   // Hello, World
```

```c
typedef struct { String prefix; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    tsc_string_release(env->prefix);
    free(env);
}

static String _closure_0_fn(_closure_0_env *env, String name) {
    return tsc_string_concat(tsc_string_concat(env->prefix, STR_LIT(", ")), name);
}

// main:
const String prefix = STR_LIT("Hello");
tsc_string_retain(prefix);                          // retain
_closure_0_env greet_env = {.prefix = prefix};      // ARC copy
tsc_closure greet = {.env = &greet_env, .fn = ...};
// cleanup: tsc_string_release(greet_env.prefix);
// cleanup: tsc_string_release(prefix);
```

**Пояснение:** String захватывается как ARC copy (`tsc_string_retain`). Source жив. Env cleanup делает `tsc_string_release` для captured string. Destroy function генерируется только при наличии string captures.

### 3.3 Массив — reference, mutations visible

```typescript
let arr: number[] = [1, 2, 3];
const fn = (): void => {
    arr[0] = 9;
};
fn();
console.log(arr[0]);   // 9 — mutation видна!
console.log(arr[1]);   // 2
console.log(arr[2]);   // 3
```

```c
typedef struct { Array_f64 *arr; } _closure_0_env;   // pointer!

static void _closure_0_fn(_closure_0_env *env) {
    env->arr->data[0] = 9.0;                          // mutation через pointer
}

// main:
Array_f64 arr = {.data = _arr_data_0, .length = 3, .capacity = 3};
_closure_0_env fn_env = {.arr = &arr};                // address-of source
tsc_closure fn = {.env = &fn_env, .fn = ...};
((void (*)(void *))fn.fn)(fn.env);
printf("%g\n", (double)(arr.data[0]));                // 9 — mutation видна
```

**Пояснение:** Массив захватывается как pointer (`Array_f64 *arr`). Env содержит `&arr` (address-of source). Mutation `env->arr->data[0] = 9.0` меняет source напрямую. Source жив, mutations видны. Полная TS-совместимость.

### 3.4 Класс — reference, mutations visible

```typescript
class Counter {
    count: i32;
}
let c = new Counter();
c.count = 0;
const inc = (): void => {
    c.count += 1;
};
inc();
inc();
inc();
console.log(c.count);   // 3 — все mutations видны
```

```c
typedef struct { int32_t count; } Counter;

typedef struct { Counter *c; } _closure_0_env;       // pointer!

static void _closure_0_fn(_closure_0_env *env) {
    env->c->count += 1;                               // mutation через pointer
}

// main:
Counter c = {0};
c.count = 0;
_closure_0_env inc_env = {.c = &c};                   // address-of source
tsc_closure inc = {.env = &inc_env, .fn = ...};
((void (*)(void *))inc.fn)(inc.env);   // c.count = 1
((void (*)(void *))inc.fn)(inc.env);   // c.count = 2
((void (*)(void *))inc.fn)(inc.env);   // c.count = 3
printf("%d\n", c.count);                              // 3
```

**Пояснение:** Класс захватывается как pointer (`Counter *c`). Каждый вызов `inc()` мутирует `c.count` через pointer. Source `c` жив, значение `c.count = 3` видно после всех вызовов.

### 3.5 «Жизненный» пример — closure как анонимная функция

```typescript
let arr: number[] = [1, 2, 3];
arr.push(4);

const fn = (): void => {
    arr[0] = 9;
    console.log(arr.length);
};

fn();                   // arr[0] = 9, prints 4
let a = arr[0];         // 9 — mutation видна
a++;
console.log(a);         // 10
```

**Пояснение:** Типичный паттерн TS/JS — closure мутирует внешнюю переменную, код после closure видит изменения. Работает благодаря reference capture для class/array.

### 3.6 Nested closures — pointer chain

```typescript
class Counter {
    count: i32;
}
let c = new Counter();
c.count = 0;
const outer = (): void => {
    c.count += 1;
    const inner = (): void => {
        c.count += 10;
    };
    inner();
};
outer();
console.log(c.count);   // 11 (1 + 10)
```

```c
typedef struct { Counter *c; } _closure_0_env;       // outer env
typedef struct { Counter *c; } _closure_1_env;       // inner env

static void _closure_1_fn(_closure_1_env *env) {
    env->c->count += 10;
}

static void _closure_0_fn(_closure_0_env *env) {
    env->c->count += 1;
    _closure_1_env inner_env = {.c = env->c};        // pointer copy!
    tsc_closure inner = {.env = &inner_env, .fn = ...};
    ((void (*)(void *))inner.fn)(inner.env);
}

// main:
_closure_0_env outer_env = {.c = &c};                // → main's c
// inner:             inner_env = {.c = env->c}       // → outer's env->c → main's c
```

**Пояснение:** Outer closure захватывает `c` как `Counter *c = &c` (pointer на main's `c`). Inner closure захватывает `c` из outer scope — `_findFreeVars` находит sym с `ctype: 'Counter *'` и `_closureEnvVar: 'c'`. Inner env: `Counter *c = env->c` (копия pointer'а из outer env). Оба pointer'а указывают на один `c` в main. Chain: inner → outer → main. Mutations из обоих closures видны.

### 3.7 Transitive capture (closure из функции)

```typescript
function makeAdder(n: i32): () => i32 {
    return (): i32 => n + 1;
}

const add5 = makeAdder(5);
const add10 = makeAdder(10);
console.log(add5());    // 6
console.log(add10());   // 11
```

```c
typedef struct { int32_t n; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->n + 1;
}

tsc_closure makeAdder_i32(int32_t n) {
    _closure_0_env _lambda_env_0 = {.n = n};          // copy (примитив)
    return (tsc_closure){.env = &_lambda_env_0, .fn = ...};
}
```

**Пояснение:** Closure возвращается из функции. Параметр `n` — примитив, захватывается как copy. Примечание: env struct `_lambda_env_0` — локальная переменная в `makeAdder_i32`, возвращается `tsc_closure` с dangling `.env`. Это работает на практике (caller обычно использует closure немедленно), но формально — escaping scope (см. D7).

### 3.8 Multi-capture (несколько переменных)

```typescript
let x: number = 10;
let arr: number[] = [1, 2, 3];
const fn = (): number => x + arr.length;
console.log(fn());   // 13
```

```c
typedef struct { double x; Array_f64 *arr; } _closure_0_env;

// main:
_closure_0_env fn_env = {.x = x, .arr = &arr};       // x = copy, arr = pointer
```

**Пояснение:** Env struct содержит все захваченные переменные. Каждая — по своим правилам: `x` (примитив) = copy, `arr` (array) = pointer.

---

## 4. Explicit capture syntax

### 4.1 `[x: Ref<T>]` — const pointer (read-only)

```typescript
class Box {
    value: i32;
}
let b = new Box();
b.value = 42;
const fn = [b: Ref<Box>]: () => i32 => b.value;
console.log(fn());   // 42
```

```c
typedef struct { const Box *b; } _closure_0_env;     // const pointer

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->b->value;                              // read-only access
}

// main:
_closure_0_env fn_env = {.b = &b};                    // address-of
```

**Семантика:** `Ref<T>` = `const T *` в env. Read-only доступ к захваченной переменной. Попытка мутации — compile error.

### 4.2 `[x: Mut<T>]` — mutable pointer (explicit borrow)

```typescript
class Counter {
    count: i32;
}
let c = new Counter();
c.count = 0;
const inc = [c: Mut<Counter>]: () => i32 => {
    c.count += 1;
    return c.count;
};
console.log(inc());   // 1
console.log(inc());   // 2
```

```c
typedef struct { Counter *c; } _closure_0_env;       // mutable pointer

static int32_t _closure_0_fn(_closure_0_env *env) {
    env->c->count += 1;                               // mutation OK
    return env->c->count;
}

// main:
_closure_0_env inc_env = {.c = &c};                   // address-of
```

**Семантика:** `Mut<T>` = `T *` в env. Mutable доступ. Borrow tracking: source quarantine пока closure alive.

### 4.3 `[x]` без type — ошибка компиляции

```typescript
const fn = [arr](): void => { arr[0] = 9; };
// Error: requires a type annotation: Ref<T> or Mut<T>
```

**Обоснование:** без type annotation компилятор не может определить capture semantics. Ref = read-only, Mut = mutable. Явное указание — deliberate choice.

### 4.4 `[x: T]` (move) — убрано

```typescript
const fn = [arr: Array<i32>](): i32 => arr.length;
// Error: requires a type annotation: Ref<T> or Mut<T>
```

**Rationale (D6):** Move capture был концепцией из Rust (`move ||`). В TS нет аналога. Реальных use cases не найдено. Escaping scope (единственный сценарий) — UB в любом случае (env на стеке). Убрано для простоты и П2-совместимости.

---

## 5. C-representation (как компилятор генерирует)

### 5.1 Env struct — генерация полей

Компилятор генерирует typedef для env struct в `hoistClosure()`:

```c
// Примитив: value
typedef struct { int32_t x; } _closure_0_env;

// String: value (retained)
typedef struct { String s; } _closure_1_env;

// Class: pointer
typedef struct { User *u; } _closure_2_env;

// Array: pointer
typedef struct { Array_i32 *arr; } _closure_3_env;

// Mixed
typedef struct { double x; String s; User *u; Array_i32 *arr; } _closure_4_env;
```

Логика (`closures.js`, `_isComplexCtype`):
- `SIMPLE_CTYPES` (intXX_t, double, float, bool, String, etc.) → value field
- Всё остальное (class, Array_T, tuple) → pointer field
- Pointer types (`T *`) → pointer field (для nested closures)

### 5.2 Env init — инициализация

```c
// Примитив: copy
_closure_0_env fn_env = {.x = x};

// String: retain + copy
tsc_string_retain(s);
_closure_1_env fn_env = {.s = s};

// Class/Array (из main scope): address-of
_closure_2_env fn_env = {.u = &u};
_closure_3_env fn_env = {.arr = &arr};

// Class/Array (из outer closure scope): pointer copy
_closure_4_env inner_env = {.u = env->u};   // env->u уже pointer
```

Логика:
- Примитив: `.{nm} = ${nm}` (copy)
- String: `tsc_string_retain(nm)` перед init, `.{nm} = ${nm}` (copy)
- Class/Array из main scope: `.{nm} = &${nm}` (address-of)
- Class/Array из closure scope (`_closureEnvVar`): `.{nm} = env->${nm}` (pointer copy)

### 5.3 Access внутри closure

```c
// Примитив (value): env->x
return env->x + 1;

// String (value): env->s
return tsc_string_concat(env->s, STR_LIT("..."));

// Class (pointer): env->u->field
env->u->name = STR_LIT("Alice");
return env->u->value;

// Array (pointer): env->arr->data[i]
env->arr->data[0] = 9;
return env->arr->length;
```

Логика: для pointer captures (`isPointer: true`), `exprToC` генерирует `->` вместо `.` для member access.

### 5.4 Cleanup

| Захваченный тип | Env cleanup | Source cleanup |
|----------------|-------------|----------------|
| Примитив | Нет | Нет |
| String | `tsc_string_release(env->s)` | `tsc_string_release(s)` |
| Class (pointer) | **Нет** (env не владеет) | `User_free(&u)` (string fields) |
| Array (pointer) | **Нет** (env не владеет) | `tsc_array_free_i32(&arr)` |

**Ключевое правило:** source владеет данными. Env содержит pointer — cleanup не нужен. Env cleanup делается только для String (retained copy).

Destroy function генерируется только при `hasStringCapture`:
```c
static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    tsc_string_release(env->s);
    free(env);
}
```

> **Примечание:** destroy function генерируется компилятором, но для stack-allocated closures (default) **не вызывается** — cleanup через `_registerCleanup` в scope. `free(env)` актуален только для boxed/heap-allocated closures (C interop).

---

## 6. Ограничения и UB

### 6.1 Escaping scope — env на стеке = dangling

**Проблема:** env struct выделяется на стеке. Если closure переживает scope — env pointer dangling.

```typescript
let fn: () => i32;
{
    let arr: number[] = [1, 2, 3];
    fn = (): i32 => arr.length;    // env = {.arr = &arr} на стеке
}                                   // arr и fn_env мёртвы
fn();                               // UB: fn.env → мёртвый стек
```

**Это UB при любом capture model** — даже value capture: env struct сам на стеке, `fn.env` dangling.

**Mitigation:** 99% использований — same-scope (closure создаётся и используется в одном блоке). Escaping — rare edge case.

### 6.2 Почему нет heap-allocate

**П1 (cross-platform):** embedded платформы (AVR) — нет heap. `malloc` недоступен. Heap-allocate env нарушит П1.

**Возможное будущее:** heap-allocate env как опция для desktop target (`--heap-closures`). Но не по умолчанию.

### 6.3 Почему нет move capture

**П2 (TS compat):** в TS нет `move ||`. Концепция чуждая для TS-разработчика.

**Практика:** реальных use cases для move capture не найдено. Основной сценарий — shared mutable state (reference capture). Ownership transfer в closure — концепция из Rust, не из TS.

**Escaping scope** (единственный сценарий где move имеет смысл) — UB в любом случае (env на стеке). Move не решает проблему.

---

## 7. Отличия от TypeScript

### 7.1 Примитивы: snapshot vs reference

```typescript
// TypeScript:
let x = 1;
const fn = () => x;
x = 2;
console.log(fn());   // 2 (reference)

// TSClang:
let x: number = 1;
const fn = (): number => x;
x = 2;
console.log(fn());   // 1 (snapshot)
```

**Причина:** без GC, reference capture для примитивов добавляет overhead (pointer + dereference) без пользы. Copy — дёшево и безопасно.

### 7.2 Строки: snapshot vs reference

```typescript
// TypeScript:
let s = "hello";
const fn = () => s;
s = "world";
console.log(fn());   // "world" (reference)

// TSClang:
let s: string = "hello";
const fn = (): string => s;
s = "world";
console.log(fn());   // "hello" (snapshot/retain)
```

**Причина:** String = value type (ARC struct, не JS reference). Retain копии = snapshot.

### 7.3 Class/Array: идентично (reference/mutation)

```typescript
// TypeScript и TSClang — одинаково:
let arr: number[] = [1, 2, 3];
const fn = () => { arr[0] = 9; };
fn();
console.log(arr[0]);   // 9 в обоих случаях
```

**Это главное достижение:** для class/array поведение идентично TS. Mutations visible, source жив.

### 7.4 Нет GC → стековые замыкания

TS: closures могут переживать scope (GC держит данные живыми).
TSClang: closures стековые. Escaping = UB.

**Trade-off:** ограниченная функциональность, но П1 (embedded без heap).

---

## 8. Обоснование (П1–П3)

### П1: Кроссплатформенность (desktop + embedded)

- Stack-allocated env — работает на AVR (нет heap)
- Pointer capture — C-compatible, zero-cost
- No `malloc`/`free` для env
- String retain — no-op на embedded (single-ownership)

### П2: Максимальная совместимость с TS

- Class/Array = reference capture (идентично TS)
- Mutations visible (идентично TS)
- Source жив после capture (идентично TS)
- Примитивы/String = snapshot (отклонение, документировано)
- Нет `move ||` (нет аналога в TS)

### П3: Лучше чем TS/C/C++/Rust

- **Проще Rust:** нет Fn/FnMut/FnOnce, нет lifetime annotations
- **Безопаснее C:** нет dangling для same-scope (reference = pointer на живой stack var)
- **Предсказуемее TS:** нет hidden GC, ownership явный
- **Проще C++:** нет `std::function`, нет heap allocation, нет copy/move constructors

---

## 9. Тесты

| Тест | Что проверяет |
|------|--------------|
| `capture-primitive` | Примитив = copy, source жив |
| `capture-string-ref` | String = retain, destroy function, cleanup |
| `capture-ref` | Implicit class capture = reference (pointer) |
| `capture-move` | Implicit class capture = reference (pointer) |
| `capture-ref-explicit` | `[x: Ref<T>]` = const pointer |
| `capture-mut-explicit` | `[x: Mut<T>]` = mutable pointer |
| `capture-move-explicit` | `[x: Mut<T>]` = mutable pointer (переименован из move) |
| `capture-class-reference` | Source жив после implicit class capture |
| `closure-capture-array-reference` | Array reference, mutation видна снаружи |
| `closure-capture-class-mutation` | Class mutation через closure, count = 3 |
| `nested-closures` | Outer + inner, pointer chain, mutations видны |
| `transitive-capture` | Closure из функции, примитив capture |
| `closure-multi-capture` | Несколько переменных разных типов |
| `closure-scope-cleanup` | Cleanup при выходе из scope |
| `closure-return-from-fn` | Closure + несколько captures (примитивы) |
| `closure-pass-to-fn` | Передача closure как аргумент |
| `c-output` | Фрагмент C-output для closure |
| `err-capture-move-use` | `[x]` без type = compile error |

---

## 10. Связь с другими спеками

| Спека | Связь |
|-------|-------|
| `05b-ownership.md` | Присваивание и владение. Closure capture = reference для class/array (не move). **Приоритет: 05e доминирует по closure topics.** |
| `05-memory.md` | Модель памяти, borrow checker. Rule 5 (замыкания) — см. 05e. **Приоритет: 05e доминирует по closure topics.** |
| `05c-for-of-iteration.md` | For-of = borrow (pointer) для complex. Closure = reference (pointer). Разные операции, похожий механизм. |
| `05d-spread-destructuring-merge.md` | Spread/destructuring = copy для всех. Closure = reference для class/array. Разные операции = разная семантика. |
| `02-syntax.md` | Синтаксис arrow functions и capture lists. |
| `03-types.md` | Типы: String, Array\<T\>, class types. |
