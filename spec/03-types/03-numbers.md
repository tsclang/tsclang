## Числовые типы

- Полный набор: `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`, `isize`, `usize`, `f32`, `f64`
- **`char`** — тип для символьных данных (элемент строки, символьный литерал). Семантически отличается от `u8`: `char` = «символ», `u8` = «число / байт». В C-output: `char` → `char`, `u8` → `uint8_t`. Оба — 8 бит, взаимозаменяемы в присваивании. `for (const ch of str)` автовыводит `ch: char`. Символьные литералы (`'A'`, `'\n'`) с аннотацией `: char` или `: u8` → числовое значение. Строковые литералы (`"A"`) с аннотацией `: char` или `: u8` → числовое значение (только single ASCII char). Без аннотации — `'A'` и `"A"` → `string` (П2, TS compat). Многобайтовые, пустые и многосимвольные строки с `: char` / `: u8` — ошибка компиляции.

### Числовые литералы

TSClang поддерживает четыре формата записи целочисленных литералов:

| Формат | Префикс | Пример | C-вывод |
|--------|---------|--------|---------|
| Десятичный | — | `255` | `255` |
| Шестнадцатеричный | `0x` | `0xFF` | `0xFF` |
| Двоичный | `0b` | `0b1010` | `10` |
| Восьмеричный | `0o` | `0o77` | `077` |

> Legacy octal (`0123`) — ошибка компилятора. Используйте префикс `0o`: `0o123`.

```typescript
const a: i32 = 0xFF        // hex → 255
const b: i32 = 0b1010      // binary → 10
const c: i32 = 0o77        // octal → 63
const d: i32 = 255         // decimal
```

Для удобочитаемости допускаются разделители `_`:

```typescript
const mask: u32 = 0xFF_FF_FF_FF
const flags: u16 = 0b1010_0101
const big: i64 = 1_000_000
```

**Все три механизма автокаста числовых типов применяются к нестандартным форматам записи так же, как к десятичным:**

```typescript
// Механизм 1 — type-level widening
const a: u8 = 0xFF
const b: i16 = a           // ✅ u8 → i16 (safe widening)

// Механизм 2 — compile-time анализ значений
const x: i32 = 0xFF
const y: u32 = 0b1010
const z: f64 = x + y       // ✅ — оба const, значения известны

// Механизм 3 — явный as
let flags: u16 = 0b1010_0101
let mask: i32 = flags as i32  // ✅
```

### usize — платформенный тип размера

`usize` — беззнаковое целое, размер которого совпадает с разрядностью платформы. Транслируется в `size_t` в C.

| Платформа | Размер `usize` | C-тип |
|-----------|---------------|-------|
| 64-bit (desktop/server) | 64 бита | `uint64_t` / `size_t` |
| 32-bit (embedded Cortex-M, ESP) | 32 бита | `uint32_t` / `size_t` |
| 16-bit (AVR ATmega) | 16 бит | `uint16_t` / `size_t` |

Используется для:
- размеров буферов и массивов (`buf.length`, `arr.length`)
- смещений и индексов при работе с памятью
- возвращаемых значений системных вызовов (количество байт)

```typescript
const buf = new Buffer(1024)
const len: number = buf.length    // number, не конкретный тип
```

Автокаст `usize` → `i64` без потерь на всех платформах. `usize` → `i32` — требует явный `as` (может усечь на 64-bit).

```typescript
const n: usize = buf.length
const n32 = n as i32    // явно — может потерять данные если > 2GB
const n64: i64 = n      // неявно — без потерь
```

**`usize` не используется для:**
- обычной бизнес-логики (суммы, идентификаторы, счётчики) — там `i32`/`i64`
- отрицательных значений — для смещений которые могут быть отрицательными используй `i64`

- TypedArray алиасы — синонимы нативных типизированных массивов для JS-совместимости:
  ```typescript
  type Uint8Array   = u8[]    type Int8Array    = i8[]
  type Uint16Array  = u16[]   type Int16Array   = i16[]
  type Uint32Array  = u32[]   type Int32Array   = i32[]
  type Float32Array = f32[]   type Float64Array = f64[]
  ```
  Никакого runtime overhead — только алиасы. `Uint8Array` и `u8[]` взаимозаменяемы.

- Синоним: `number` = `defaultNumber` из профиля платформы (совместимость с TypeScript-стилем)
  - `defaultNumber` — обязательное поле профиля (см. `13-platform-capabilities.md`)
  - Переопределяется в проекте через `"defaultNumber"` в `builds.*` (override над профилем)
  ```typescript
  // Десктоп (defaultNumber = f64)
  const a = 1;           // number (f64, double) — целочисленный литерал без аннотации
  const b: number = 1;   // f64 (number = f64) — то же самое, явно
  const c: f32 = 1;      // f32 (явно)

  // AVR/NES (defaultNumber = i16, no FPU)
  const a = 1;           // number (i16, int16_t) — целочисленный литерал
  const b: number = 1;   // i16 (number = i16)
  const c: i32 = 1;      // i32 (явно)
  const d = 1.0;         // error: float literal not supported (fpu: false)
  ```

- **Performance warnings на 8-bit таргетах (AVR)** *[NOT YET IMPLEMENTED]*

  На `"target": "avr"` компилятор выдаёт предупреждения для типов, которые дороги на 8-bit ALU:

  | Тип | Причина | Hint |
  |-----|---------|------|
  | `f64` | 8 байт, softfloat ~100 инструкций на операцию | `use f32 or integer type` |
  | `f32` | 4 байт, softfloat ~50 инструкций | нет (это рекомендованный тип) |
  | `i64` / `u64` | 8 байт, 8-bit ALU требует цепочку из 8 инструкций | `use i32/u32 if range allows` |

  ```typescript
  // AVR — примеры warnings
  const x: i64 = 1000000   // warning: i64 on 8-bit target is expensive
                            // hint: use i32 or u32 if range allows (max i32: 2147483647)
  const y: f64 = 3.14      // warning: f64 on 8-bit target is inefficient
                            // hint: use f32 (max f32: ~3.4e38, precision: 7 digits)
  const z: i32 = 1000000   // ✅ no warning
  const w: f32 = 3.14      // ✅ no warning
  ```

  Предупреждения не блокируют сборку — код валиден, просто неэффективен. Подавить через `"performanceWarnings": false` в `tsc.package.json`.

  `i16`/`u16` и меньше — нет warning (нативные для AVR). `i32`/`u32` — нет warning (обычны, avr-gcc оптимизирует).
- Type inference выводит конкретный тип для всех значений:
  - целые числа → `number` (= defaultNumber, переопределяется через `defaultNumber`), числа с точкой → `number` (тот же defaultNumber)
  - строки → `string`, булевые → `boolean`
  - однородный массив → `T[]` (где `T` выводится по элементам)
  - смешанный массив (разные типы элементов) → **compile error** — требуется explicit type annotation (tuple или typed array)
  - явная аннотация переопределяет: `const i: i32 = 1` → `i32`
- Сообщения об ошибках используют конкретный тип: `expected f64, got i32`
- Все числа — примитивы, передаются по значению

### Type inference: правила и примеры

**Ok — неявный вывод (однозначный):**

```typescript
let a = 10;              // → number (defaultNumber → f64 на desktop, f32 на embedded)
let b = 10.0;            // → number (defaultNumber)
let c = "hello";         // → string
let d = 'a';             // → string (одинарные = двойные)
let e = true;            // → boolean
let f = null;            // → null
let g = [1, 2, 3];       // → number[] (однородный — все элементы number)
let h = ["a", "b"];      // → string[] (однородный — все элементы string)
let p = { x: 1, y: 2 }; // → anonymous struct { x: number, y: number }
```

**Error — смешанный массив требует explicit type:**

```typescript
let g = [1, 'a'];        // Error: mixed array literal — specify type: [number, string] (tuple) or T[]
let t = [1, "a", true];  // Error: mixed array literal — specify type: [number, string, boolean] or T[]
let u = [obj, 42];       // Error: mixed array literal — specify type: [MyClass, number] or T[]
```

**Ok с explicit type:**

```typescript
let g: [number, string] = [1, 'a'];           // → tuple (value type, фиксированный layout)
let t: [i32, string, boolean] = [1, "a", true];  // → tuple
let nums: i32[] = [1, 2, 3];                  // → Array_i32 (override defaultNumber)
```

**Обоснование:**
- **П2**: TS выводит `(string | number)[]` для `[1, 'a']` — почти всегда не то что нужно
- **П3**: explicit лучше implicit для нетривиальных типов
- **П1**: tuple = value type с фиксированным layout, компилятор не должен угадывать

### Literal overflow *[NOT YET IMPLEMENTED]*

Числовой литерал без явной аннотации получает тип `number` = `defaultNumber`. Если значение не помещается в диапазон `defaultNumber` → compile error.

```typescript
// defaultNumber = f64 (desktop, по умолчанию)
let a = 100          // ok — double
let b = 100500       // ok — double
let c = 3.14         // ok — double

// defaultNumber = i8 (old platform, конфигурируется)
let a = 100          // ok — i8 (-128..127)
let b = 100500       // error: literal 100500 overflows i8 (-128..127)
                      // hint: use explicit type, e.g. let b: i32 = 100500
let c: i32 = 100500  // ok — явная аннотация, тип i32

// В выражениях — та же проверка:
if (x < 100500) ...             // error при defaultNumber = i8
if (x < (100500 as i32)) ...    // ok — as снимает overflow check (программист явно указал тип)
```

**Правило**: `as T` снимает overflow check — программист берёт ответственность на себя. Без `as` — compile error при выходе за диапазон `defaultNumber`.

### Поведение integer overflow

TSClang определяет поведение integer overflow явно — никаких UB (undefined behavior) как в C.

**Default mode (без strict rules):**

| Операция | Типы | Поведение при overflow |
|----------|------|------------------------|
| `+`, `-`, `*` | signed (`i8`..`i64`) | **Defined wrap** через unsigned cast: `(int32_t)((uint32_t)a + (uint32_t)b)`. Two's complement, предсказуемо на всех платформах |
| `+`, `-`, `*` | unsigned (`u8`..`u64`) | Native C wrap (defined by C standard) |
| `/`, `%` | любые integer | **Runtime abort** при делении на ноль или `INT_MIN / -1` (trap на x86) |
| `+`, `-`, `*`, `/`, `%` | `f32`, `f64` | IEEE 754 (`Infinity`, wrap-around) — без panic |

```c
// Generated C for signed i32: a + b
(int32_t)((uint32_t)a + (uint32_t)b)   // defined wrap, no UB

// Generated C for i32: a / b
int32_t _tsc_div_N = b;
if (_tsc_div_N == 0) { fprintf(stderr, "panic: division by zero\n"); abort(); }
if (_tsc_div_N == -1 && a == INT32_MIN) { fprintf(stderr, "panic: integer overflow\n"); abort(); }
a / _tsc_div_N;
```

> **Почему unsigned cast для signed:** В C signed integer overflow — UB. Компилятор может удалить overflow-чеки при оптимизации. Cast через unsigned делает поведение определённым (unsigned wrap defined by C standard §6.2.5), сохраняя two's-complement семантику.

> **`INT_MIN / -1`:** На x86 эта операция вызывает hardware exception (SIGFPE / #DE). TSClang генерирует runtime guard, который вызывает `abort()` с понятным сообщением. Guard добавляется только для `i32`/`i64` (для `i8`/`i16` C promotion делает overflow менее вероятным).

> **`no-abort` strict rule:** Если включен `no-abort`, `abort()` заменяется на `_tsc_on_panic(msg)` — пользовательский обработчик (см. [Strict Mode](../13-build/13-strict-mode.md#no-abort)).

**safe-math mode** (strict rule `safe-math`): см. [Strict Mode — safe-math](../13-build/13-strict-mode.md#safe-math).

### Binary type inference и integer promotion

TSClang **не использует** полные C integer promotion rules. Вместо этого применяется упрощённый алгоритм (usual arithmetic conversions):

1. Если хотя бы один операнд `f64` → результат `f64`
2. Если хотя бы один операнд `f32` → результат `f32`
3. Для двух integer: **более широкий тип выигрывает**
4. При равной ширине: **unsigned выигрывает**
5. Иначе: тип левого операнда

```typescript
let a: i32 = 1;
let b: i32 = 2;
let c = a + b;         // i32 (оба i32)

let d: i32 = 1;
let e: i64 = 2;
let f = d + e;         // i64 (i64 шире i32)

let g: u32 = 1;
let h: i32 = 2;
let i = g + h;         // ❌ error: cannot mix u32 and i32 (same-width mixed signed/unsigned banned)
```

**Banned mixed pairs для `let`-переменных:**

Все same-width mixed signed+unsigned комбинации запрещены для `let`-переменных. В TS нет unsigned — `number + number = number`. C silent conversion signed→unsigned нарушает ожидания TS-разработчика (П2, П3).

**Same-width mixed (signed/unsigned mismatch):**

| Комбинация | Проблема | Решение |
|------------|----------|---------|
| `i8 + u8` | C: результат `u8`, `-1` → `255` | Compile error: use `as` |
| `i16 + u16` | C: результат `u16`, `-1` → `65535` | Compile error: use `as` |
| `i32 + u32` | C: результат `u32`, `-1` → `4294967295` | Compile error: use `as` |
| `i64 + u64` | C: результат `u64`, `-1` → `1.8e19` | Compile error: use `as` |

**Cross-width mixed (unexpected unsigned result in C):**

| Комбинация | Проблема | Решение |
|------------|----------|---------|
| `i64 + u32` | C: результат `u64` (неожиданно unsigned) | Compile error: use `as` |
| `u32 + i64` | C: результат `u64` | Compile error: use `as` |

```typescript
let a: i32 = 1;
let b: u32 = 2;
let c = a + b;            // ❌ error: cannot mix i32 and u32: signed/unsigned mismatch, use "as" to specify type
let c = a + (b as i32);   // ✅ явный cast

let d: i64 = 1;
let e: u32 = 2;
let f = d + e;            // ❌ error: cannot add i64 and u32: no implicit widening for let variables, use "as"
let f = d + (e as i64);   // ✅ явный cast

// const/literals exempt — compile-time analysis:
const x: i32 = 1;
const y: u32 = 2;
const z = x + y;           // ✅ — оба const, значения известны
```

> **Обоснование:** C integer promotion для mixed signed+unsigned — известный источник багов. `-1` молча становится `4294967295`. TSClang требует явный `as` для всех same-width mixed комбинаций `let`-переменных. `const`/литералы exempt, потому что компилятор проверяет значения на этапе компиляции.

### Специальные значения: NaN, Infinity

TSClang поддерживает `NaN` и `Infinity` как first-class значения (П2 — TS compat):

```typescript
const x = NaN;           // f64 (NAN in C)
const y = Infinity;      // f64 (INFINITY in C)
const z = -Infinity;     // f64 (-INFINITY in C)

console.log(NaN);        // "NaN"
console.log(Infinity);   // "Infinity"
console.log(-Infinity);  // "-Infinity"

NaN === NaN;             // false (IEEE 754)
NaN !== NaN;             // true
Infinity > 1e308;        // true
-Infinity < -1e308;      // true
```

**Type inference:** `NaN` и `Infinity` выводятся как `number` (= `defaultNumber`, обычно `f64`). На embedded (`defaultNumber = i16`) — ошибка компиляции (float literal not supported, `fpu: false`).

**C-output:**
- `NaN` → `NAN` (macro из `<math.h>`)
- `Infinity` → `INFINITY`
- `-Infinity` → `-INFINITY`

**Number output formatting:** All `f64`/`f32` values printed via `console.log()`, string interpolation, or `Array.join()` use `tsc_format_double()` — a JS-compatible shortest round-trip formatter. This matches JavaScript's `Number.prototype.toString()` behavior exactly:

```typescript
console.log(3.14);              // "3.14"
console.log(Math.PI);           // "3.141592653589793"
console.log(0.1 + 0.2);         // "0.30000000000000004"
console.log(1.0);               // "1"
console.log(NaN);               // "NaN"
console.log(Infinity);          // "Infinity"
```

> **Note:** `f32` values are promoted to `f64` before formatting, so `let x: f32 = 3.14; console.log(x);` prints `"3.140000104904175"` (the shortest f64 representation of the f32 value). This matches the behavior of reading an f32 through an f64 lens.

**`Number` static properties** `[NOT YET]`:
- `Number.NaN` → `NAN`
- `Number.POSITIVE_INFINITY` → `INFINITY`
- `Number.NEGATIVE_INFINITY` → `-INFINITY`
- `Number.isNaN(x)` — strict NaN check
- `Number.isFinite(x)` — strict finite check

**Global functions** `[NOT YET]`:
- `isNaN(x)` — coerces to number first (JS semantics)
- `isFinite(x)` — coerces to number first (JS semantics)

## Конвертация типов
