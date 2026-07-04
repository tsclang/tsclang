## Decimal fixed-point types

TSClang поддерживает десятичные типы с фиксированной точкой — для финансов, измерений и embedded-систем без FPU. Эти типы не требуют hardware FPU и обеспечивают точное представление десятичных дробей (без ошибок binary floating-point).

### Типы

| Тип | C-тип | Scale | Decimals | Диапазон | Точность |
|------|-------|-------|----------|----------|----------|
| `d8`  | `int8_t`  | 100     | 2 dp | ±1.27           | 0.01 |
| `d16` | `int16_t` | 100     | 2 dp | ±327.67         | 0.01 |
| `d32` | `int32_t` | 10000   | 4 dp | ±214748.3647    | 0.0001 |
| `d64` | `int64_t` | 100000000 | 8 dp | ±92233720368.5 | 0.00000001 |

- **Scale** — множитель: внутреннее значение = real × scale. `1.5` в `d32` = `15000`.
- **Decimals** — количество знаков после запятой.
- `d8` и `d16` делят scale=100 (2 dp) — widening `d8→d16` без потери точности (просто integer widening).
- `d64` использует `int64_t` с 8 знаками после запятой — достаточно для финансовых расчётов.

### C-output

```typescript
let price: d32 = 1.5;
let tax: d16 = 0.85;
let small: d8 = 0.5;
let big: d64 = 1.5;
```

```c
d32_t price = 15000;       // 1.5 × 10000
d16_t tax = 85;            // 0.85 × 100
d8_t small = 50;           // 0.5 × 100
d64_t big = 150000000LL;   // 1.5 × 1e8
```

Отрицательные литералы:

```typescript
let x: d32 = -0.5;
```

```c
d32_t x = -5000;           // -0.5 × 10000
```

### `defaultNumber` и decimal

Если `defaultNumber` установлен в decimal-тип (`d8`/`d16`/`d32`/`d64`), то `number` разрешается в соответствующий decimal-тип:

```typescript
// defaultNumber: "d32"
let x: number = 1.5;       // → d32_t x = 15000
let y: number = 3;         // → d32_t y = 30000
```

### FPU и decimal types

Decimal-типы **не требуют FPU** — это чистая целочисленная арифметика. На платформах с `fpu: false` (AVR, NES и др.):

- `let x: d32 = 1.5` — **OK** (float-литерал конвертируется в scaled integer на этапе компиляции)
- `let x: f64 = 1.5` — **error** (float types not supported, fpu: false)
- `const x = 3.14` — **error** (untyped float literal, defaultNumber не decimal)

### Литерал-конверсия

При присвоении float-литерала к decimal-типу:
1. Парсится десятичное значение
2. Умножается на scale соответствующего типа
3. Округляется (round-half-away-from-zero)
4. Сохраняется как integer

```typescript
let a: d32 = 1.5;       // 15000
let b: d32 = 3;         // 30000 (integer literal → scaled)
let c: d16 = 0.85;      // 85
let d: d8 = 0.5;        // 50
let e: d64 = 1.5;       // 150000000LL
```

### C typedefs

В `runtime.h` определены:

```c
typedef int8_t   d8_t;
typedef int16_t  d16_t;
typedef int32_t  d32_t;
typedef int64_t  d64_t;
```

Отдельные typedef-имена (не `int32_t` напрямую) позволяют компилятору различать decimal и integer типы по C-имени.

### Арифметика

Для операндов одного decimal-типа:

| Операция | Поведение | C-output |
|----------|-----------|----------|
| `+`, `-` | Прямое сложение/вычитание scaled integers (точное) | `a + b`, `a - b` |
| `*` | Умножение с нормализацией: `(a * b) / scale`, round-half-away-from-zero | `tsc_mul_dXX(a, b)` |
| `/` | Деление с масштабированием: `(a * scale) / b`, round-half-away-from-zero + div-by-zero guard | `tsc_div_dXX(a, b)` |
| `%` | Остаток от деления scaled integers (точное) + div-by-zero guard | `a % b` |

Runtime helpers в `runtime.h` (`static inline`):
- `tsc_mul_d8/d16/d32/d64` — умножение с wider intermediate (int16→int32→int64→`__int128`)
- `tsc_div_d8/d16/d32/d64` — деление с wider intermediate

```typescript
let a: d32 = 1.5;      // 15000
let b: d32 = 0.5;      // 5000
let sum = a + b;        // 20000 (2.0)
let prod = a * b;       // tsc_mul_d32(15000, 5000) = 7500 (0.75)
let quot = a / b;       // tsc_div_d32(15000, 5000) = 30000 (3.0)
```

**Смешанные decimal-типы запрещены:** `d16 + d32` — compile error. Используйте явный `as` cast.

**Compound assignment:** `+=`, `-=` работают напрямую. `*=`, `/=` используют runtime helpers: `a = tsc_mul_d32(a, b)`.

### Casts (`as`)

Decimal casts требуют масштабирования (scale conversion), не plain C cast.

| Направление | Формула | Поведение |
|-------------|---------|-----------|
| `dXX as iYY` | `expr / scale` | Truncate toward zero |
| `iYY as dXX` | `expr * scale` | Scale up (точное) |
| `dXX as dYY` (widen) | `expr * (dstScale / srcScale)` | Точное (ratio — integer) |
| `dXX as dYY` (narrow) | `expr / (srcScale / dstScale)` | Truncate toward zero |
| `dXX as f64` | `expr / scale.0` | Точное |
| `f64 as dXX` | `expr * scale.0` | Truncate toward zero |

```typescript
let d: d32 = 1.5;
let i = d as i32;       // (int32_t)(d / 10000) = 1 (truncate)
let back = i as d32;    // (d32_t)(i * 10000) = 10000 (1.0)
let w: d16 = 0.5;
let widened = w as d32;  // (d32_t)(w * 100) = 5000 (0.5, scale 100→10000)
let narrowed = d as d16; // (d16_t)(d / 100) = 150 (1.5, scale 10000→100)
let f = d as f64;       // (double)(d / 10000.0) = 1.5
```

**`no-lossy-cast` strict rule:** decimal narrowing (`d32 as d16`) и decimal→integer (`d32 as i32`) считаются lossy и требуют отключения правила.

**`_isSafeWidening` для decimal:** widening (`d8→d16→d32→d64`) — safe. Все остальные decimal→non-decimal и narrowing — unsafe (требуют явный `as`).

### *[ROADMAP] Math.roundCast / saturatingCast / checkedCast

### *[ROADMAP] Форматирование

`console.log`, `toString`, template literals — decimal значения форматируются с учётом scale (например, `d32` со значением `15000` выводится как `1.5000`).
