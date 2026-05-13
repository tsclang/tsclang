# Числовые типы

[← Вверх](./index.md) | [Следующий →](./strings.md)

---

TSClang предоставляет полный набор целочисленных и вещественных типов с детальным контролем над размером и знаком.

## Все числовые типы

| Тип | Размер | Диапазон | C-тип |
|-----|--------|----------|-------|
| `i8` | 1 байт | -128 … 127 | `int8_t` |
| `i16` | 2 байта | -32 768 … 32 767 | `int16_t` |
| `i32` | 4 байта | -2 147 483 648 … 2 147 483 647 | `int32_t` |
| `i64` | 8 байт | -9 223 372 036 854 775 808 … 9 223 372 036 854 775 807 | `int64_t` |
| `u8` | 1 байт | 0 … 255 | `uint8_t` |
| `u16` | 2 байта | 0 … 65 535 | `uint16_t` |
| `u32` | 4 байта | 0 … 4 294 967 295 | `uint32_t` |
| `u64` | 8 байт | 0 … 18 446 744 073 709 551 615 | `uint64_t` |
| `f32` | 4 байта | IEEE 754 single, ~7 значимых цифр | `float` |
| `f64` | 8 байт | IEEE 754 double, ~15 значимых цифр | `double` |
| `usize` | платформенно | `size_t` — см. [usize](#usize) | `size_t` |

Все числа — **примитивы**, передаются по значению. Borrow checker к ним не применяется.

## Числовые литералы

Четыре формата записи целочисленных литералов:

| Формат | Префикс | Пример | Значение |
|--------|---------|--------|----------|
| Десятичный | — | `255` | 255 |
| Шестнадцатеричный | `0x` | `0xFF` | 255 |
| Двоичный | `0b` | `0b1010` | 10 |
| Восьмеричный | `0o` | `0o77` | 63 |

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

## Автокаст: механизм 1 — type-level widening

Работает для **любых** переменных (`let` и `const`). Безусловно безопасен, основан только на типах:

| Откуда | Куда | Почему безопасно |
|--------|------|------------------|
| `i8` → `i16` → `i32` → `i64` | каждая ступень вмещает предыдущую | same-sign widening |
| `u8` → `u16` → `u32` → `u64` | каждая ступень вмещает предыдущую | same-sign widening |
| `u8` → `i16` | все 256 значений u8 < 32 768 | cross-sign |
| `u16` → `i32` | все 65 536 значений < 2 147 483 647 | cross-sign |
| `u32` → `i64` | все 4.3G значений < 9.2 квинтиллиона | cross-sign |
| `i32` → `f64` | f64 мантисса 53 bit > i32 (32 bit) | integer → float |
| `u32` → `f64` | f64 мантисса 53 bit > u32 (32 bit) | integer → float |
| `f32` → `f64` | double > single | float widening |

**Обратное направление недоступно** через механизм 1: `u64 → i64`, `i → u`, `f64 → i32` — может не поместиться.

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 → i64 widening
```

## Автокаст: механизм 2 — compile-time анализ значений (только const)

Когда оба операнда `const` с известными литеральными значениями и механизм 1 не применим. Алгоритм:

1. Среди **объявленных типов** обоих операндов найти наименьший, в который помещаются **оба значения**
2. Если шаг 1 не дал результата — попробовать **наибольший** из объявленных типов
3. Если шаг 2 тоже не дал результата — ошибка компилятора
4. Выполнить операцию в найденном типе
5. Проверить, помещается ли результат в целевой тип — если нет, ошибка

```typescript
// Шаг 1: i32 вмещает и -1 и 2 → берём i32
const a: i32 = -1
const b: u32 = 2
const c: f64 = a + b   // ok → (a + (b as i32)) as f64

// Шаг 1: u32 вмещает и 1 и 2 → берём u32
const a: i64 = 1
const b: u32 = 2
const c: f64 = a + b   // ok → (a as u32 + b) as f64

// Ошибка: i32 не вмещает 3G, u32 не вмещает -1
const a: i32 = -1
const b: u32 = 3_000_000_000
const c: f64 = a + b
// error: no common type for i32(-1) and u32(3_000_000_000)
// hint: use explicit casts, e.g. (a as i64 + b as i64) as f64

// Ошибка шага 5: сумма 5G > u32 max
const a: i64 = 3_000_000_000
const b: u32 = 2_000_000_000
const c: u32 = a + b
// error: result 5_000_000_000 does not fit in u32
```

## Автокаст: механизм 3 — явный `as` (для let)

Если `let`-переменные участвуют в операции, и механизм 1 не применим — требуется явный каст:

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // ошибка — i64 + u32: нет widening
let c: f64 = (a + (b as i64)) as f64  // ok
```

Widening **с потерей точности** — всегда требует явный `as` (независимо от `const`/`let`):
- `i32` → `f32`, `i64` → `f32`, `i64` → `f64`, `u64` → `f64`

Narrowing (`f64` → `i32` и т.д.) — всегда требует `as`.

## Оператор `as`

Явное приведение типа. Три случая:

### 1. Числовое приведение — C-cast

```typescript
3.14 as i32       // → 3 (truncation toward zero)
1000 as i8        // → -24 (two's complement, младшие 8 бит)
300 as u8         // → 44 (300 & 0xFF)
-1 as u32         // → 4294967295 (0xFFFFFFFF)
```

Семантика: **bit-truncation** по размеру целевого типа, two's complement для signed. Эквивалент C: `(int8_t)1000`, `(uint8_t)300`. Поведение одинаково на всех платформах.

### 2. Non-null assertion

```typescript
let x: i32 | null = getValue()
let y = x as i32  // runtime panic если x == null
```

Лучше использовать `if (x != null)` для безопасности.

### 3. Any-cast

```typescript
let val: any = getFromC()
let s = val as string
```

### `as` НЕ работает для

- Ownership типов: `user as Ref<User>` — ошибка компилятора
- Конвертации строк: `42 as string` — ошибка, используйте `.toString()`

## `usize` — платформенный тип размера

`usize` — беззнаковое целое, размер которого совпадает с разрядностью платформы. Транслируется в `size_t` в C.

| Платформа | Размер | C-тип |
|-----------|--------|-------|
| 64-bit (desktop/server) | 64 бита | `uint64_t` / `size_t` |
| 32-bit (Cortex-M, ESP) | 32 бита | `uint32_t` / `size_t` |
| 16-bit (AVR ATmega) | 16 бит | `uint16_t` / `size_t` |

Используется для размеров буферов (`buf.length`), индексов, возвращаемых значений системных вызовов.

```typescript
const len: usize = buf.length    // usize, не i32

function copyTo(src: Ref<Buffer>, dst: Mut<Buffer>, offset: usize): usize {
    return src.copy(dst, offset)
}
```

Автокаст: `usize` → `i64` без потерь на всех платформах. `usize` → `i32` — требует явный `as`.

## `number` — синоним по умолчанию

`number` = `f64` по умолчанию (совместимость с TypeScript):

```typescript
const a = 1;           // → f64 (desktop)
const b: number = 1;   // → f64 (desktop)
```

Переопределяется через `"defaultNumber"` в `tsc.package.json`. На 8-bit таргетах (`"target": "avr"`) `number` **автоматически = `f32`**.

```typescript
// AVR — number автоматически = f32
const a = 1;           // → f32
const b: number = 1;   // → f32
const d: f64 = 1;      // → f64 + warning: f64 on 8-bit target is inefficient
```

## Performance warnings на AVR

На `"target": "avr"` компилятор выдаёт предупреждения для дорогих на 8-bit ALU типов:

| Тип | Причина | Hint |
|-----|---------|------|
| `f64` | 8 байт, softfloat ~100 инструкций на операцию | `use f32 or integer type` |
| `f32` | 4 байта, softfloat ~50 инструкций | рекомендованный тип (нет warning) |
| `i64` / `u64` | 8 байт, цепочка из 8 инструкций на 8-bit ALU | `use i32/u32 if range allows` |

```typescript
// AVR
const x: i64 = 1000000   // warning: i64 on 8-bit target is expensive
const y: f64 = 3.14      // warning: f64 on 8-bit target is inefficient
const z: i32 = 1000000   // ok
const w: f32 = 3.14      // ok
```

Предупреждения не блокируют сборку. Подавить: `// @ts-ignore-perf` или `"performanceWarnings": false` в `tsc.package.json`.

## TypedArray алиасы

Синонимы нативных типизированных массивов для JS-совместимости. Никакого runtime overhead:

```typescript
type Uint8Array   = u8[]    type Int8Array    = i8[]
type Uint16Array  = u16[]   type Int16Array   = i16[]
type Uint32Array  = u32[]   type Int32Array   = i32[]
type Float32Array = f32[]   type Float64Array = f64[]
```

`Uint8Array` и `u8[]` взаимозаменяемы.

## Конвертация: число → строка

```typescript
const age: i32 = 30
const pi: f64 = 3.14159

// 1. .toString()
const s1 = age.toString()   // "30"
const s2 = pi.toString()    // "3.14159"

// 2. Template literal
const s3 = `Age: ${age}`    // "Age: 30"

// 3. Конкатенация со строкой
const s5 = "Age: " + age    // "Age: 30"

// 4. Форматирование float
const s6 = pi.toFixed(2)      // "3.14"
const s7 = pi.toPrecision(4)  // "3.142"

// as — НЕ работает:
const bad = age as string   // ошибка компилятора
```

`toFixed` и `toPrecision` — только для `f32`/`f64`. Аргумент — числовой литерал (compile-time).

## Конвертация: строка → число

```typescript
// parse — бросает ParseError
const age = i32.parse("30")       // i32
const bad = i32.parse("abc")      // throws ParseError

// tryParse — возвращает T | null
const age = i32.tryParse("30")    // 30
const bad = i32.tryParse("abc")   // null

// С дефолтом:
const val = i32.tryParse(raw) ?? 0

// JS-совместимые функции:
parseInt("42")        // i32 | null → 42
parseFloat("3.14")   // f64 | null → 3.14
Number("3.14")        // f64 | null → 3.14

// Поддержка префиксов:
parseInt("0xFF")      // 255
parseInt("0b1010")    // 10
parseInt("0o77")      // 63
```

Отличие от JS: `parseInt`/`parseFloat`/`Number` возвращают `T | null` вместо `NaN` — в TSClang нет `NaN`.

Доступно для всех числовых типов: `i8.parse`, `i16.parse`, `i32.parse`, `i64.parse`, `u8.parse`, `u16.parse`, `u32.parse`, `u64.parse`, `f32.parse`, `f64.parse`.

## C-output

```typescript
const a: i32 = 42
const b: f64 = 3.14
const c: u8 = 0xFF
const d: i32 = a + (b as i32)
```

```c
int32_t a = 42;
double  b = 3.14;
uint8_t c = 0xFF;
int32_t d = a + (int32_t)b;   // C-cast, truncation
```

```typescript
const n: usize = buf.length
const m: i64 = n
```

```c
size_t  n = buf.length;
int64_t m = (int64_t)n;   // safe: usize → i64 без потерь
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `no common type for i32(-1) and u32(3_000_000_000)` | Механизм 2 не нашёл общий тип |
| `result 5_000_000_000 does not fit in u32` | Шаг 5: результат не помещается |
| `use explicit casts, e.g. (a as i64 + b as i64)` | Подсказка для механизма 3 |
| `expected f64, got i32` | Несовместимые типы без автокаста |
| `f64 on 8-bit target is inefficient` | Performance warning на AVR |

## См. также

- [Строки](./strings.md) — конвертация число ↔ строка, `.toString()`, `parseInt`/`parseFloat`
- [Специальные типы](./special-types.md) — `any`, `void`, `never`
- [Null](./null.md) — `T | null`, optional chaining, `??`
- [Type Aliases](./type-aliases.md) — `type UserId = i32`
- [Модель памяти](../05-memory/index.md) — примитивы копируются, сложные типы — move
