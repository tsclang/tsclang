## Strict Mode

**Strict mode** — набор compile-time правил, запрещающих конструкции, нарушающие статическую безопасность типов или вводящие неаудитируемое / недетерминированное поведение.

Включается в `tsc.package.json`:

```json
{
  "strict": ["no-any", "no-unsafe", "no-native", "no-extern-c", "safe-div", "no-lossy-cast", "no-dynamic-alloc"]
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

#### `safe-div` — безопасное деление

Запрещает integer `/` и `%` без явной проверки или safe-обёртки.

```typescript
// ❌ error: integer division may panic at runtime (safe-div);
//          guard with 'if (y != 0)' or use a safe division function
let q = x / y;
let r = x % y;

// ✅ explicit guard — ok
if (y != 0) {
    let q = x / y;
}

// ✅ safe division functions (provided by runtime)
let q = Math.divTrunc(x, y);   // returns i32 | null — null if divisor is 0
let q = Math.divTrunc(x, y) ?? 0;  // with default

// ✅ float division — ok (IEEE 754, no panic)
let f = a / b;  // a: f64, b: f64
```

**Обоснование:** Integer division by zero → runtime panic (`abort()`). В safety-critical системах panic недопустим — все краевые случаи должны быть обработаны явно.

**Float исключение:** `/` для `f32`/`f64` не запрещается — IEEE 754 определяет результат деления на ноль (`Infinity`, `-Infinity`), panic не происходит.

**Compound assignment:** `x /= y`, `x %= y` — тоже запрещены для integer типов.

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
//          use Math.saturatingCast() or Math.checkedCast()
let x: i64 = 42;
let y = x as i32;

// ❌ error: lossy cast from f64 to i32
let f: f64 = 3.14;
let i = f as i32;

// ✅ safe widening — ok (no data loss)
let a: i32 = 42;
let b = a as i64;    // i32 → i64 — safe

// ✅ explicit safe cast functions
let y = Math.saturatingCast<i32>(x);    // clamps to i32 range
let y = Math.checkedCast<i32>(x);       // returns i32 | null — null if doesn't fit
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
- `Shared<T>`, `Weak<T>` — ARC-managed
- `new ClassName()` — один объект, не растущий массив

**Обоснование:** `malloc`/`realloc` могут вернуть NULL → UB. В safety-critical системах потребление памяти должно быть детерминировано на этапе компиляции.

### Взаимодействие правил

Правила **независимы** — каждое проверяется отдельно. Комбинации не создают дополнительных ограничений.

```json
// Только type safety — без ограничений на аллокацию
{ "strict": ["no-any", "no-unsafe", "no-native", "no-extern-c"] }

// Всё — максимальная строгость
{ "strict": ["no-any", "no-unsafe", "no-native", "no-extern-c", "safe-div", "no-lossy-cast", "no-dynamic-alloc"] }
```

### Error messages

Все ошибки strict mode содержат:
1. Имя rule в скобках — для быстрого поиска
2. Описание что не так
3. Подсказку что использовать вместо

```
file.tsc:5:10: error: "any" is forbidden in strict mode (no-any); use a concrete type
file.tsc:8:4:  error: unsafe blocks are forbidden in strict mode (no-unsafe)
file.tsc:12:8: error: integer division may panic at runtime (safe-div); guard with 'if (y != 0)' or use a safe division function
file.tsc:15:6: error: lossy cast from i64 to i32 is forbidden (no-lossy-cast); use Math.saturatingCast() or Math.checkedCast()
file.tsc:20:14: error: dynamic allocation with runtime size is forbidden (no-dynamic-alloc); use fixed-size array or compile-time constant
```

### CLI

Флаг `--strict` — сокращение для включения всех правил:

```bash
tsclang build src/main.tsc --strict
# эквивалентно "strict": ["no-any", "no-unsafe", "no-native", "no-extern-c", "safe-div", "no-lossy-cast", "no-dynamic-alloc"]
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
| `safe-div` | Integer `/` и `%` без guard | `(safe-div)` |
| `no-lossy-cast` | Lossy `as` cast | `(no-lossy-cast)` |
| `no-dynamic-alloc` | `new Array(runtimeN)`, `new Map()`, `new Set()` | `(no-dynamic-alloc)` |
