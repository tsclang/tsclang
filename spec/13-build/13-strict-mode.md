## Strict Mode

**Strict mode** — набор compile-time правил, запрещающих конструкции, нарушающие статическую безопасность типов или вводящие неаудитируемое / недетерминированное поведение.

Включается в `tsc.package.json`:

```json
{
  "strict": ["no-any", "no-unsafe", "no-native", "no-extern-c", "safe-math", "no-lossy-cast", "no-dynamic-alloc", "switch-default", "no-abort", "no-closures", "no-interfaces", "no-threads", "no-sort"]
}
```

Поле `"strict"` — массив строк (rule names). Пустой массив или отсутствие поля — strict mode выключен (поведение по умолчанию).

### Обоснование

IEC 61508 (SIL 3/4) и аналогичные стандарты функциональной безопасности требуют:
- Все типы известны статически — нет runtime type dispatch
- Нет обхода borrow checker — все операции memory-safe
- Нет неявных runtime сбоев (panic, UB) — все краевые случаи обработаны явно
- Нет недетерминированного потребления памяти — OOM невозможен или обработан

Strict mode делает эти требования enforceable на уровне компилятора.

### Правила

#### `no-any` — запрет динамических типов

Запрещает `any` и `unknown` **везде**, включая `declare` и `unsafe`.

```typescript
// ❌ error: "any" is forbidden in strict mode (no-any); use a concrete type
let x: any = getFromC();

// ❌ error: "unknown" is forbidden in strict mode (no-any); use a concrete type
let y: unknown = getValue();

// ❌ error: even in declare
declare function f(x: any): void;

// ✅ concrete types — ok
let x: i32 = 42;
let s: string = "hello";
declare function f(x: Ref<u8>): void;
```

**Обоснование:** `any` = `void*` — нет type safety. `unknown` — runtime type dispatch, недетерминированное поведение. Для C interop — `Ref<T>`, `*T`, конкретные типы.

#### `no-unsafe` — запрет unsafe-блоков

Запрещает `unsafe { ... }`.

```typescript
// ❌ error: unsafe blocks are forbidden in strict mode (no-unsafe)
unsafe {
    let raw: *u8 = getPointer();
}

// ✅ все операции безопасны по умолчанию — ok
let x: i32 = 42;
```

**Обоснование:** `unsafe` отключает borrow checker — все гарантии безопасности памяти снимаются. В safety-critical коде все операции должны быть проверены компилятором.

#### `no-native` — запрет inline C

Запрещает `native \`...\``.

```typescript
// ❌ error: native C blocks are forbidden in strict mode (no-native)
function abort(): never {
    native `abort();`
}

// ✅ typed declarations — ok
declare function abort(): never;
```

**Обоснование:** Inline C неаудитируем компилятором — может содержать произвольные операции, включая UB. Для C interop — `.d.tsc` с типизированными декларациями.

#### `no-extern-c` — запрет extern "C"

Запрещает `extern "C" function`.

```typescript
// ❌ error: extern "C" is forbidden in strict mode (no-extern-c)
extern "C" function memcmp(a: Ref<u8>, b: Ref<u8>, n: usize): i32;

// ✅ typed declaration — ok
declare function memcmp(a: Ref<u8>, b: Ref<u8>, n: usize): i32;
```

**Обоснование:** `extern "C"` обходит name mangling — типы параметров не проверяются на call site. `.d.tsc` декларации обеспечивают тот же C interop, но с проверкой типов.

#### `safe-math` — безопасная целочисленная арифметика (runtime)

Запрещает unguarded integer `+`, `-`, `*`, `/`, `%` — требует обёртки в `try/catch (e: MathError)` или объявление `throws MathError`. Внутри guarded context арифметика компилируется в **checked operations**, которые при overflow бросают `MathError`.

```typescript
// ❌ error: unguarded integer arithmetic in safe-math mode;
//          wrap in try/catch or declare 'throws MathError'
let q = x + y;
let d = x / y;

// ✅ try/catch — checked ops, MathError при overflow
let result: i32;
try {
    result = x + y;     // __builtin_add_overflow под капотом
} catch (e: MathError) {
    console.log("overflow in:", e.operation);   // "add", "sub", "mul", "div", "mod"
    result = 0;
}

// ✅ throws MathError — propagation
function safeAdd(a: i32, b: i32): i32 throws MathError {
    return a + b;       // overflow → MathError, propagation через Result-struct
}

// ✅ float arithmetic — ok (IEEE 754, не проверяется)
let f = a + b;          // a: f64, b: f64 — safe-math не применяется
```

**Как это работает под капотом:**

Integer `+`, `-`, `*` внутри `try`/`throws MathError` → GCC/Clang builtins:

```c
int32_t _math_N;
if (__builtin_add_overflow((int32_t)a, (int32_t)b, &_math_N)) {
    _math_err.operation = "add";
    goto _catch_N;     // или _func_math_throw для throws MathError
}
```

Integer `/`, `%` → manual guards:

```c
int32_t _math_N = b;
if (_math_N == 0) { _math_err.operation = "div"; goto _catch_N; }
if (_math_N == -1 && a == INT32_MIN) { _math_err.operation = "div"; goto _catch_N; }
a / _math_N;
```

**`MathError` struct:**

```typescript
class MathError extends Error {
    operation: string   // "add" | "sub" | "mul" | "div" | "mod"
}
```

**Float исключение:** `+`, `-`, `*`, `/`, `%` для `f32`/`f64` не проверяются — IEEE 754 определяет результат overflow (`Infinity`, wrap-around), panic/throw не происходит.

**Compound assignment:** `+=`, `-=`, `*=`, `/=`, `%=` — тоже требуют guarded context для integer типов.

**Обоснование:** Signed integer overflow — undefined behavior в C. Компилятор может удалить overflow-чеки при оптимизации. safe-math делает overflow **детектируемым и обрабатываемым** через типобезопасный `MathError`, а не silent wrap или crash.

#### `no-lossy-cast` — запрет потерянного приведения типов

Запрещает `as`-cast с потерей точности или диапазона.

**Запрещённые приведения:**

| Из | В | Причина |
|----|---|---------|
| `i64` | `i32` | усечение старших 32 бит |
| `i64` | `f64` | потеря точности для целых > 2^53 |
| `u64` | `f64` | потеря точности для целых > 2^53 |
| `i32` | `f32` | потеря точности для целых > 2^24 |
| `f64` | `f32` | потеря точности и диапазона |
| `f64` | `i32` | усечение дробной части + возможный overflow |
| `f32` | `i32` | усечение дробной части + возможный overflow |
| Любой более широкий | Любой более узкий | потеря данных |

```typescript
// ❌ error: lossy cast from i64 to i32 is forbidden (no-lossy-cast);
//          remove 'no-lossy-cast' from strict rules or use a safe widening path
let x: i64 = 42;
let y = x as i32;

// ❌ error: lossy cast from f64 to i32
let f: f64 = 3.14;
let i = f as i32;

// ✅ safe widening — ok (no data loss)
let a: i32 = 42;
let b = a as i64;    // i32 → i64 — safe
```

**Safe casts (не запрещаются):**
- Widening: `i32` → `i64`, `u8` → `i16`, `f32` → `f64`, `i32` → `f64`
- Same-size unsigned↔signed: `u32` ↔ `i32` (bit-preserving)
- `as` на non-null assertion: `x as i32` при `x: i32 | null` (не lossy, только убирает null)
- String literal union → string (не числовой cast)

**Обоснование:** Потеря данных при cast — источник скрытых багов. В safety-critical коде все преобразования должны быть явными и безопасными.

#### `no-dynamic-alloc` — запрет динамической аллокации

Запрещает операции, которые могут вызвать `malloc`/`realloc` с runtime-зависимым размером.

```typescript
// ❌ error: dynamic allocation with runtime size is forbidden (no-dynamic-alloc);
//          use fixed-size array or compile-time constant
let n: i32 = readCount();
let arr = new Array(n);

// ❌ error: Map requires dynamic allocation
let m = new Map<string, i32>();

// ❌ error: Set requires dynamic allocation
let s = new Set<i32>();

// ✅ array literal with known size — ok
let arr = [1, 2, 3];             // size = 3, known at compile time

// ✅ fixed-capacity array — ok
let arr: i32[] = [];
arr.push(1);                      // pre-allocated capacity from literal

// ✅ stack-allocated fixed array (embedded) — ok
let buf: u8[256] = [];            // fixed size on stack

// ✅ string operations — ok (string is immutable, ARC-managed)
let s = "hello" + " world";       // compile-time concatenation possible
```

**Запрещается:**
- `new Array(N)` где N — runtime значение
- `new Map<K, V>()` — heap-allocated, размер не фиксирован
- `new Set<T>()` — heap-allocated, размер не фиксирован
- `arr.push(x)` когда `arr.capacity == 0` (требует realloc)

**Не запрещается:**
- Array literals `[1, 2, 3]` — размер известен
- String операции — ARC-managed, deterministic
- `Arc<T>`, `Weak<T>` — ARC-managed
- `new ClassName()` — один объект, не растущий массив

**Обоснование:** `malloc`/`realloc` могут вернуть NULL → UB. В safety-critical системах потребление памяти должно быть детерминировано на этапе компиляции.

#### `switch-default` — auto `default: break;` во все switch

Добавляет `default: break;` во все генерируемые `switch`, если пользователь не указал `default` case.

```typescript
// Input:
enum Color { Red, Green, Blue }
let c: Color = Color.Red;
let val = match c {
    Color.Red => 1,
    Color.Green => 2,
    Color.Blue => 3,
};

// Output (switch-default ON):
// switch (c) {
//     case Color_Red: val = 1; break;
//     case Color_Green: val = 2; break;
//     case Color_Blue: val = 3; break;
//     default: break;    // <-- auto-added
// }
```

**Затронутые конструкции:**
- `match` по enum → switch
- `switch` statement пользователя
- Async state machine switch
- Generator state machine switch
- Hash lookup switch (Map/StaticMap)

**Не добавляется если:** `default` case уже присутствует.

**Обоснование:** MISRA C:2012 Rule 16.4 (Required) — каждый `switch` должен иметь `default`. Пропущенный `default` — источник необработанных случаев.

#### `no-abort` — запрет `abort()` в C-output

Заменяет `abort()` на `_tsc_on_panic()` — пользовательский обработчик паник, который можно переопределить.

```c
// Без no-abort:
if (_tsc_div_0 == 0) { fprintf(stderr, "panic: division by zero\n"); abort(); }

// С no-abort:
if (_tsc_div_0 == 0) { _tsc_on_panic("division by zero"); }
```

`_tsc_on_panic` определён в runtime.h как макрос, по умолчанию раскрывается в `abort()`. Пользователь может переопределить:

```c
// В пользовательском коде (до #include runtime.h или через -D):
#define _tsc_on_panic(msg) my_error_handler(__FILE__, __LINE__, msg)
```

**Затронутые конструкции:**
- Integer division by zero guard (`operators.ts`, `assign.ts`)

**Обоснование:** `abort()` — неконтролируемое завершение. В safety-critical системах все аварийные ситуации должны обрабатываться через определённый обработчик (MISRA C:2012 Rule 20.11).

#### `no-closures` — запрет closures и function-typed values

Запрещает arrow functions, function references, function-typed переменные/параметры, callbacks.

```typescript
// ❌ error: closures are forbidden in strict mode (no-closures);
//          use named functions or inline the logic
let add = (a: i32, b: i32): i32 => a + b;

// ❌ error: closures are forbidden in strict mode (no-closures)
arr.map(x => x * 2);

// ❌ error: closures are forbidden in strict mode (no-closures)
function apply(f: (x: i32) => i32, v: i32): i32 { return f(v); }

// ✅ named function calls — ok
function double(x: i32): i32 { return x * 2; }
let result = double(42);
```

**Обоснование:** Closures генерируют `void*` в C-output (`tsc_closure` с `void* env` и `void (*fn)(void)`). Для MISRA C compliance (Rule 11.4) — `void*` запрещён. Убирая closures, убираем источник `void*`.

#### `no-interfaces` — запрет interface с методами

Запрещает `interface` declarations с методами и `implements` на классах.

```typescript
// ❌ error: interfaces with methods are forbidden in strict mode (no-interfaces)
interface Drawable { draw(): void; }
class Circle implements Drawable { draw(): void { } }

// ✅ marker interface (no methods) — ok
interface Serializable {}
class Data implements Serializable {}
```

**Обоснование:** Interface vtable использует `void *self` для type-erased dispatch (MISRA Rule 11.4). Marker interfaces без методов не генерируют vtable — разрешены.

#### `no-threads` — запрет Thread.spawn

Запрещает `spawn {}` и `Thread.spawn`.

```typescript
// ❌ error: threads are forbidden in strict mode (no-threads)
spawn {
    console.log("hello from thread");
}

// ✅ synchronous code — ok
console.log("hello");
```

**Обоснование:** Thread entry point требует `void* (*)(void*)` (pthreads/Win32 API). Для MISRA compliance — `void*` запрещён. В embedded системах threads часто недоступны.

#### `no-sort` — запрет Array.sort() с comparator

Запрещает `arr.sort((a, b) => ...)`. `arr.sort()` без аргументов (built-in порядок) — разрешён.

```typescript
// ❌ error: Array.sort() with comparator is forbidden in strict mode (no-sort)
arr.sort((a, b) => a - b);

// ✅ built-in sort (default ascending) — ok
arr.sort();
```

**Обоснование:** `qsort(3)` требует `int (*)(const void*, const void*)` comparator — `void*` параметры. Built-in sort использует типизированные компараторы внутри runtime — `void*` инкапсулирован.

### SIL Presets

IEC 61508 определяет 4 уровня SIL (Safety Integrity Level):

| SIL | Требования | Что обеспечивает TSClang |
|-----|-----------|------------------------|
| 1 | Базовая безопасность | Базовый TSClang (статическая типизация, ownership, нет UB) |
| 2 | Повышенная безопасность | + `no-any`, `no-unsafe`, `no-native` |
| 3 | Высокая безопасность | + `no-closures`, `no-interfaces`, `no-threads`, `no-sort`, `switch-default`, `no-abort`, `safe-math`, `no-lossy-cast`, `no-dynamic-alloc` |
| 4 | Максимальная безопасность | + `const-params`, `no-gcc-extensions` (в разработке) + формальная верификация |

Рекомендуемые пресеты:

```json
// SIL 2 — type safety
{ "strict": ["no-any", "no-unsafe", "no-native"] }

// SIL 3 — MISRA C compliance, no void*
{ "strict": ["no-any", "no-unsafe", "no-native", "safe-math", "no-lossy-cast", "no-dynamic-alloc", "no-closures", "no-interfaces", "no-threads", "no-sort", "switch-default", "no-abort"] }

// SIL 4 — maximum strictness (when const-params and no-gcc-extensions are available)
{ "strict": ["no-any", "no-unsafe", "no-native", "safe-math", "no-lossy-cast", "no-dynamic-alloc", "no-closures", "no-interfaces", "no-threads", "no-sort", "switch-default", "no-abort", "const-params", "no-gcc-extensions"] }
```

### Взаимодействие правил

Правила **независимы** — каждое проверяется отдельно. Комбинации не создают дополнительных ограничений.

```json
// Только type safety — без ограничений на аллокацию
{ "strict": ["no-any", "no-unsafe", "no-native", "no-extern-c"] }

// SIL 3 embedded — максимальная строгость, нет void*
{ "strict": ["no-any", "no-unsafe", "no-native", "safe-math", "no-lossy-cast", "no-dynamic-alloc", "no-closures", "no-interfaces", "no-threads", "no-sort", "switch-default", "no-abort"] }

// Desktop type safety — closures/interfaces/threads разрешены
{ "strict": ["no-any", "no-unsafe", "no-native", "safe-math", "no-lossy-cast", "switch-default", "no-abort"] }
```

### Error messages

Все ошибки strict mode содержат:
1. Имя rule в скобках — для быстрого поиска
2. Описание что не так
3. Подсказку что использовать вместо

```
file.tsc:5:10: error: "any" is forbidden in strict mode (no-any); use a concrete type
file.tsc:8:4:  error: unsafe blocks are forbidden in strict mode (no-unsafe)
file.tsc:12:8: error: unguarded integer division in safe-math mode; wrap in try/catch or declare 'throws MathError'
file.tsc:15:6: error: lossy cast from i64 to i32 is forbidden (no-lossy-cast); remove 'no-lossy-cast' from strict rules or use a safe widening path
file.tsc:20:14: error: dynamic allocation with runtime size is forbidden (no-dynamic-alloc); use fixed-size array or compile-time constant
file.tsc:25:2: error: closures are forbidden in strict mode (no-closures); use named functions or inline the logic
file.tsc:30:1: error: interfaces with methods are forbidden in strict mode (no-interfaces)
file.tsc:35:1: error: threads are forbidden in strict mode (no-threads)
file.tsc:40:8: error: Array.sort() with comparator is forbidden in strict mode (no-sort)
```

### CLI

Флаг `--strict` — сокращение для включения всех правил:

```bash
tsclang build src/main.tsc --strict
# эквивалентно "strict": ["no-any", "no-unsafe", "no-native", "no-extern-c", "safe-math", "no-lossy-cast", "no-dynamic-alloc"]
```

Флаг комбинируется с `"strict"` из `tsc.package.json` — CLI **добавляет** правила к конфигу, не заменяет.

### Взаимодействие с platform capabilities

Strict rules проверяются **после** platform capability checks. Если платформа запрещает `f32` (`fpu: false`) — ошибка про `fpu` выдана первой. Если strict запрещает `any` — ошибка про strict.

### Quick reference

| Rule | Запрещает | Error ID |
|------|----------|----------|
| `no-any` | `any`, `unknown` типы | `(no-any)` |
| `no-unsafe` | `unsafe {}` блоки | `(no-unsafe)` |
| `no-native` | `native \`...\`` | `(no-native)` |
| `no-extern-c` | `extern "C" function` | `(no-extern-c)` |
| `safe-math` | Integer `+`, `-`, `*`, `/`, `%` без `try/catch` или `throws MathError` | `(safe-math)` |
| `no-lossy-cast` | Lossy `as` cast | `(no-lossy-cast)` |
| `no-dynamic-alloc` | `new Array(runtimeN)`, `new Map()`, `new Set()` | `(no-dynamic-alloc)` |
| `switch-default` | Отсутствие `default:` в switch | `(switch-default)` — auto-add |
| `no-abort` | `abort()` в C-output | `(no-abort)` — `_tsc_on_panic()` |
| `no-closures` | Arrow functions, function references, callbacks | `(no-closures)` |
| `no-interfaces` | Interface с методами, `implements` | `(no-interfaces)` |
| `no-threads` | `spawn {}`, `Thread.spawn` | `(no-threads)` |
| `no-sort` | `Array.sort()` с comparator | `(no-sort)` |
