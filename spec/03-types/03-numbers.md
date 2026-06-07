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

- Синоним: `number` = `f64` по умолчанию (совместимость с TypeScript-стилем)
  - Переопределяется через `"defaultNumber"` в `tsc.package.json`
  - На embedded-таргетах — **`number` автоматически = `f32`** без явного `defaultNumber`
  ```typescript
  // Десктоп (defaultNumber = f64)
  const a = 1;           // number (f64, double) — целочисленный литерал без аннотации
  const b: number = 1;   // f64 (number = f64) — то же самое, явно
  const c: f32 = 1;      // f32 (явно)

  // Embedded (defaultNumber автоматически = f32)
  const a = 1;           // number (f32, float) — целочисленный литерал без аннотации
  const b: number = 1;   // f32 (number = f32)
  const c: f32 = 1;      // f32 (явно)
  const d: f64 = 1;      // f64 + warning: f64 on 8-bit target is inefficient
  ```
  Переопределить явно — можно: `{ "defaultNumber": "f64" }` в `tsc.package.json` *[NOT YET IMPLEMENTED]* (нестандартно, потребует подтверждения).

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

## Конвертация типов
