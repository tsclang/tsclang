# TSClang — Система типов

## Типизация

- **Система типизации — два уровня:**

  | Конструкция | Типизация | Объектные литералы |
  |-------------|-----------|-------------------|
  | `type Foo = { ... }` | **Структурная**, всегда `typedef struct` — методы запрещены ошибкой компилятора | ✅ `const p: Point = { x: 1, y: 2 }` — работает |
  | `interface Foo { ... }` | **Структурная**, `typedef struct` (нет методов) или fat pointer vtable (есть методы) | ✅ работает если нет методов |
  | `class` | **Номинальная** — тип определяется именем | ❌ литерал не совместим с классом |

  Ключевое различие `type` vs `interface`:
  - `type Point = { x: f64; y: f64 }` — **гарантированно** data struct, без vtable. Попытка добавить метод — ошибка компилятора. Используй для embedded MMIO, бинарных структур, данных где ABI критичен.
  - `interface Point { x: f64; y: f64 }` — сейчас data struct, но можно расширить методами в будущем (тогда ABI изменится на vtable).

  ```typescript
  type Point  = { x: f64; y: f64 }
  type Vector = { x: f64; y: f64 }

  const p: Point = { x: 1.0, y: 2.0 }   // ✅ — структурная совместимость
  const v: Vector = p                     // ✅ — те же поля

  class Circle { x: f64; y: f64 }
  const c: Circle = { x: 1.0, y: 2.0 }  // ❌ — класс номинальный, нужен new Circle(...)
  ```

  `type` — всегда структурный alias, как в TS. `type UserId = i32` — compile-time alias, `UserId` и `i32` взаимозаменяемы. `type Point = { x: f64 }` — структурно совместим с любым `{ x: f64 }`.

- **Type inference** — тип выводится если не указан явно
  - `const p = { x: 1, y: 0 }` → `{ x: f64, y: f64 }` → анонимная struct в C
- **Автокаст числовых типов:**

  Три механизма, применяются последовательно. Первый применимый выигрывает.

  **Механизм 1 — type-level widening (любые переменные, в том числе `let`)**

  Работает только по типам, не смотрит на значения. Безусловно безопасен.

  | Откуда | Куда | Комментарий |
  |--------|------|-------------|
  | `i8`/`i16`/`i32` | `i64` | same-sign, без потерь |
  | `u8`/`u16`/`u32` | `u64` | same-sign, без потерь |
  | `u8` | `i16` | cross-sign: все 256 значений u8 помещаются в i16 |
  | `u16` | `i32` | cross-sign: все 65 536 помещаются в i32 |
  | `u32` | `i64` | cross-sign: все 4.3G помещаются в i64 |
  | `i32`, `u32` | `f64` | без потерь (f64 имеет 53-bit мантиссу) |
  | `f32` | `f64` | без потерь |

  Обратное направление (`u64 → i64`, `i → u`) через механизм 1 **недоступно** — может не поместиться.

  ```typescript
  let a: u32 = getValue()
  let b: i64 = a + 1   // ✅ — u32 всегда помещается в i64 (type-level)
  ```

  **Механизм 2 — compile-time анализ значений (только `const`)**

  Когда оба операнда `const` с известными литеральными значениями и механизм 1 не применим.
  Алгоритм (применяется последовательно):

  1. Среди **объявленных типов** обоих операндов найти наименьший, в который помещаются **оба значения**
  2. Если шаг 1 не дал результата — попробовать **наибольший** из объявленных типов
  3. Если шаг 2 тоже не дал результата — ошибка компилятора
  4. Выполнить операцию в найденном типе
  5. Проверить, помещается ли результат в целевой тип — если нет, ошибка компилятора

  ```typescript
  // Шаг 1: i32 вмещает и -1 и 2 → берём i32
  const a: i32 = -1
  const b: u32 = 2
  const c: f64 = a + b   // → (a + (b as i32)) as f64  ✅

  // Шаг 1: u32 вмещает и 1 и 2 → берём u32
  const a: i64 = 1
  const b: u32 = 2
  const c: f64 = a + b   // → (a as u32 + b) as f64  ✅

  // Шаг 1 провален (i32 не вмещает 3G, u32 не вмещает -1)
  // Шаг 2: наибольший из {i32, u32} = u32; u32 не вмещает -1 → тоже провален
  // Шаг 3: ошибка
  const a: i32 = -1
  const b: u32 = 3_000_000_000
  const c: f64 = a + b
  // error: no common type for i32(-1) and u32(3_000_000_000)
  // hint: use explicit casts, e.g. (a as i64 + b as i64) as f64

  // Шаг 5: тип найден (u32), но результат не помещается в целевой тип
  const a: i64 = 3_000_000_000
  const b: u32 = 2_000_000_000
  const c: u32 = a + b   // шаг 1: u32 вмещает оба; сумма 5G > u32 max → ошибка
  // error: result 5_000_000_000 does not fit in u32
  // hint: use i64 or u64 for c
  ```

  **Механизм 3 — явный `as` (для `let` без type-level widening)**

  Если `let`-переменные участвуют в операции, и механизм 1 не применим — требуется явный каст:

  ```typescript
  let a: i64 = 1
  let b: u32 = 2
  let c: f64 = a + b              // ❌ — i64 + u32: нет type-level widening i64←u32
  let c: f64 = (a + (b as i64)) as f64  // ✅
  ```

  - Widening **с потерей точности** — всегда требует явный `as` (независимо от `const`/`let`):
    - `i32` → `f32`, `i64` → `f32`, `i64` → `f64`, `u64` → `f64`
  - Narrowing (`f64` → `i32` и т.д.) — всегда требует `as`
- **Оператор `as`** — явное приведение типа, три случая:
  ```typescript
  // 1. Числовые типы — C-cast, может быть lossy
  3.14 as i32       // (int32_t)3.14 в C → 3
  1000 as i8        // wrap-truncation: -24 (two's complement, младшие 8 бит)
  300 as u8         // wrap-truncation: 44 (300 & 0xFF)
  -1 as u32         // wrap-truncation: 4294967295 (0xFFFFFFFF)
  // Семантика: bit-truncation по размеру целевого типа, two's complement для signed.
  // Эквивалент C: (int8_t)1000, (uint8_t)300 — предсказуемо на gcc/clang/avr-gcc.
  // Платформа не влияет: поведение одинаково на всех таргетах TSClang.

  // 2. Non-null assertion — убрать null из типа без проверки
  let x: i32 | null = getValue();
  let y = x as i32; // runtime error если x == null
                    // лучше использовать if (x != null) для безопасности

  // 3. any — явный cast когда тип неизвестен
  let val: any = getFromC();
  let s = val as string;
  ```
- **`as` НЕ работает для:**
  - ownership типов: `user as Ref<User>` — ошибка компилятора
  - конвертации строк: `42 as string` — ошибка, используй `.toString()`

- **`as` для type/interface** — структурная совместимость проверяется компилятором:
  ```typescript
  interface Point { x: f64; y: f64; }

  let p = { x: 1.0, y: 2.0 };  // анонимная struct
  foo(p as Point);               // ok — поля совпадают

  let q = { x: 1.0, z: 2.0 };
  foo(q as Point);               // ошибка: поле 'z' не совпадает с 'y'

  // лучше — явная аннотация сразу:
  let p: Point = { x: 1.0, y: 2.0 };
  foo(p);  // ok, без as
  ```
- **Объектные литералы** без типа → анонимная struct, генерируется компилятором
- **Пустой объектный литерал `{}`** — ошибка компилятора: тип без полей бессмысленен в TSC, память под поля не выделяется динамически:
  ```typescript
  let obj = {};       // ошибка: пустой объектный литерал запрещён
                      // hint: используй Map<K, V> для динамических ключей
                      //       или объяви тип: let obj: { field: T } = { ... }
  let obj = {};
  obj.a = 1;          // невозможно — тип фиксирован на этапе компиляции

  // правильно — динамические ключи:
  let obj = new Map<string, i32>();
  obj.set("a", 1);

  // правильно — фиксированная struct:
  let obj = { a: 1, b: 2 };  // { a: i32, b: i32 } известна компилятору
  obj.a = 5;                  // ok
  ```

## Числовые типы

- Полный набор: `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`, `f32`, `f64`

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
const buf = Buffer.alloc(1024)
const len: usize = buf.length    // usize, не i32

// арифметика с usize — не может быть отрицательным
function copyTo(src: Ref<Buffer>, dst: Mut<Buffer>, offset: usize): usize {
    return src.copy(dst, offset)   // возвращает количество скопированных байт
}
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
  - На 8-bit таргетах (`"target": "avr"` и др.) — **`number` автоматически = `f32`** без явного `defaultNumber`
  ```typescript
  // Десктоп (defaultNumber = f64)
  const a = 1;           // f64
  const b: number = 1;   // f64
  const c: f32 = 1;      // f32 (явно)

  // AVR (defaultNumber автоматически = f32)
  const a = 1;           // f32
  const b: number = 1;   // f32
  const c: f32 = 1;      // f32 (явно)
  const d: f64 = 1;      // f64 + warning: f64 on 8-bit target is inefficient
  ```
  Переопределить явно — можно: `{ "defaultNumber": "f64" }` в `tsc.package.json` (нестандартно, потребует подтверждения).

- **Performance warnings на 8-bit таргетах (AVR)**

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

  Предупреждения не блокируют сборку — код валиден, просто неэффективен. Подавить через `// @ts-ignore-perf` или `"performanceWarnings": false` в `tsc.package.json`.

  `i16`/`u16` и меньше — нет warning (нативные для AVR). `i32`/`u32` — нет warning (обычны, avr-gcc оптимизирует).
- Type inference выводит конкретный тип для всех значений:
  - числа → `number` (= `f64` или переопределённый тип)
  - строки → `string`, булевые → `boolean`, массивы → `number[]` и т.д.
  - явная аннотация переопределяет: `const i: i32 = 1` → `i32`
- Сообщения об ошибках используют конкретный тип: `expected f64, got i32`
- Все числа — примитивы, передаются по значению

## Конвертация типов

### Число → строка

Три способа:

```typescript
const age: i32 = 30;
const pi: f64 = 3.14159;

// 1. .toString() — явный метод на любом числовом типе
const s1 = age.toString();   // "30"
const s2 = pi.toString();    // "3.14159"

// 2. Template literal — автоматически
const s3 = `Age: ${age}`;    // "Age: 30"
const s4 = `Pi = ${pi}`;     // "Pi = 3.14159"

// 3. Конкатенация со строкой
const s5 = "Age: " + age;    // "Age: 30"

// as — НЕ работает для конвертации в строку:
const bad = age as string;   // ошибка компилятора

// 4. Форматированный вывод числа с плавающей точкой
const s6 = pi.toFixed(2);      // "3.14"   — фиксированное количество знаков после запятой
const s7 = pi.toPrecision(4);  // "3.142"  — полное количество значимых цифр
```

`toFixed` и `toPrecision` — только для `f32` и `f64`. Аргумент — числовой литерал в compile-time (не переменная).

### Строка → число

Явный парсинг — возвращает результат или ошибку:

```typescript
// parse — бросает ParseError если строка не число
const age = i32.parse("30");      // i32
const pi  = f64.parse("3.14");    // f64
const bad = i32.parse("abc");     // throws ParseError

// tryParse — возвращает T | null, без throws
const age = i32.tryParse("30");   // 30
const bad = i32.tryParse("abc");  // null

// использование с обработкой ошибок:
function getAge(raw: string): i32 throws ParseError {
    return i32.parse(raw)?;         // propagate ParseError
}

// использование с дефолтом:
const age = i32.tryParse(raw) ?? 0;  // 0 если не распарсилось

// as — НЕ работает для парсинга строк:
const bad = "30" as i32;  // ошибка компилятора: используй i32.parse()
```

Доступно для всех числовых типов: `i8.parse`, `i16.parse`, `i32.parse`, `i64.parse`, `u8.parse`, ..., `f32.parse`, `f64.parse`.

### JS-совместимые глобальные функции

Синонимы для привычного JS-синтаксиса:

```typescript
// parseFloat(a) — синоним f64.tryParse(a) → f64 | null
parseFloat("3.14")   // 3.14
parseFloat("abc")    // null

// parseInt(a) — парсит как f64, затем обрезает дробную часть → i64 | null
parseInt("3.14")     // 3
parseInt("42")       // 42
parseInt("abc")      // null
parseInt("-7.9")     // -7  (truncate, не floor: к нулю)

// Number(a) — синоним parseFloat(a) → f64 | null
Number("3.14")       // 3.14
Number("abc")        // null

// String(a) — синоним a.toString() → string (всегда успешно)
String(42)           // "42"
String(3.14)         // "3.14"
String(true)         // "true"
String(null)         // "null"
```

Отличия от JS: `parseInt`/`parseFloat`/`Number` возвращают `T | null` вместо `NaN` — в TSC нет `NaN`.

## Строки

- Один тип `string` — UTF-8 байтовая последовательность
- Мутабельность через `let`/`const`

### C-layout

```c
typedef struct {
    const char* data;   // указатель на байты: rodata (литералы) или heap (динамические)
    size_t      length; // количество байт
    size_t      capacity; // 0 = статическая строка (data → rodata, не освобождать)
                          // > 0 = heap (data → malloc, освобождать при drop)
} String;
```

`string` (non-nullable) → `String` в C (value type, передаётся по значению, встраивается в structs).
`string | null` → `String*` в C (указатель, `NULL` = null).

Строковые литералы не выделяют heap:
```c
// const s = "hello"
String s = { .data = "hello", .length = 5, .capacity = 0 };  // data → rodata, malloc не вызывается
```

Heap выделяется только при динамическом построении:
```c
// const s = a + b  (конкатенация)
String s = tsc_str_concat(a, b);  // capacity > 0, data → malloc
```

### Индексация и длина

```typescript
const s = "привет"   // 6 букв, 12 байт в UTF-8

s.length    // 12 — количество байт, O(1)
s[0]        // 208 — первый байт буквы 'п', тип u8, O(1)
s[0..2]     // string — срез по байтовым смещениям, O(1), Ref<string>
```

`s[i]` возвращает **`u8`** (байт), не `string`. Это главное отличие от JS.

Ошибка если ожидается `string`:
```
error: expected string, got u8
hint: s[i] returns a raw byte in TSC (strings are UTF-8 byte arrays).
  - s[i..i+1]  — однобайтовый срез как Ref<string>
  - for...of   — итерация по графемным кластерам
  - import { graphemeAt } from "std/string"  — графемный кластер по байтовому смещению
```

Срез `s[a..b]` по байтовым смещениям — O(1), `Ref<string>` (borrow). Разработчик несёт ответственность за корректность границ (как в Rust). Разрезать мультибайтовый символ — не ошибка компилятора, но runtime может выдать некорректный UTF-8.

### Символьные литералы

```typescript
const a: u8 = 'A'    // 65 — тип u8, как в C
const n: u8 = '\n'   // 10
const p: u8 = 'п'    // ошибка компилятора: 'п' — мультибайтовый символ (2 байта), не u8
```

`'X'` — литерал типа `u8`. Только ASCII и escape-последовательности. Мультибайтовые символы — только в строковых литералах.

### Итерация

```typescript
// for...of — итерация по графемным кластерам (string)
for (const ch of "привет❤️") {
    // ch: string — "п", "р", "и", "в", "е", "т", "❤️"
}
```

### Срезы и байтовый доступ

```typescript
s.bytes        // Slice<u8> — borrow сырых байт, O(1)
s.bytes[i]     // u8 — то же что s[i]
s.bytes.clone() // u8[] — owned копия байт

s[0..4]        // Ref<string> — байтовый срез, O(1)
```

### std/string — Unicode extension methods

TSC-специфичные методы которых нет в JS/TS. Подключаются через импорт (extension methods):

```typescript
import { chars, charCount, graphemes, codePointAt, graphemeAt, sliceChars } from "std/string"

s.chars()                  // Iterator<u32> — codepoints (1087, 1088...)
s.charCount()              // i32 — кол-во codepoints, O(n)
s.graphemes()              // Iterator<string> — графемные кластеры ("п", "❤️"...)
s.codePointAt(byteIdx)     // u32 — codepoint по байтовому смещению, O(1 символа)
s.graphemeAt(byteIdx)      // string — графемный кластер по байтовому смещению
s.sliceChars(start, end)   // string — срез по codepoint-индексам, O(n)
```

`codePointAt(byteIdx)` и `graphemeAt(byteIdx)` принимают **байтовое смещение** — удобно после `indexOf`: смещение уже известно, сканировать с начала не нужно.

Для сегментации графем — **utf8proc** (UAX #29, ~300KB, C-native). **Недоступен на embedded:** платформы с `flash < 300KB` не могут включить utf8proc — импорт `graphemes`, `graphemeAt`, `sliceChars` на таких платформах является **ошибкой компилятора**. `chars`, `charCount`, `codePointAt`, `indexOf`, `slice` (байтовый) — доступны везде, без utf8proc.

### Встроенные методы строк (JS-совместимые)

Импорт не нужен — доступны всегда:

```typescript
s.indexOf(sub)               // i32 — байтовое смещение, -1 если не найдено
s.includes(sub)              // boolean
s.startsWith(sub)            // boolean
s.endsWith(sub)              // boolean
s.slice(start, end?)         // string — копия по байтовым смещениям
s.substring(start, end?)     // string — копия
s.toUpperCase()              // string — ASCII only (Unicode: std/string)
s.toLowerCase()              // string — ASCII only
s.trim()                     // string
s.trimStart()                // string
s.trimEnd()                  // string
s.split(sep)                 // string[]
s.replace(search, replace)   // string — первое вхождение
s.replaceAll(search, replace) // string
s.padStart(len, fill?)       // string
s.padEnd(len, fill?)         // string
s.repeat(n)                  // string
s.charAt(i)                  // string — s[i..i+1] по байтовому смещению
s.charCodeAt(i)              // u8 — байт по смещению (синоним s[i])
s.lastIndexOf(sub)           // i32 — байтовое смещение последнего вхождения, -1 если не найдено
s.at(i)                      // u8 | null — байт по смещению, отрицательные индексы считаются с конца
```

Методы, требующие `import { ... } from "std/string"`:

```typescript
s.search(regex)              // i32 — байтовое смещение первого совпадения, -1 если не найдено
s.match(regex)               // string[] | null — все группы первого совпадения
s.matchAll(regex)            // string[][] — все совпадения (не ленивый итератор, возвращает массив сразу)
s.replaceAll(regex, replace) // string — замена всех совпадений по regex (string-вариант доступен без импорта)
```

`matchAll` возвращает `string[][]`, а не `IterableIterator` как в JS — упрощённая семантика, полный результат вычисляется сразу.

## Специальные типы

| Тип TSC | Тип C | Описание |
|---------|-------|----------|
| `void` | `void` | отсутствие значения — только для возвращаемого типа функции |
| `never` | `_Noreturn void` | функция никогда не возвращается; bottom type |
| `any` | `void*` | неизвестный тип — borrow checker не применяется |

```typescript
function log(msg: string): void { ... }  // void — нет return value

function getFromC(): any { ... }         // void* в C
let val: any = getFromC();
let s = val as string;                   // явный cast обязателен
```

- `void` нельзя использовать как тип переменной — только возвращаемый тип
- `any` = `void*` в C, **неявно nullable** — `void*` может быть `NULL`; писать `any | null` избыточно и запрещено (ошибка компилятора)
- `any` отключает borrow checker — **управление памятью ручное**, компилятор не генерирует деструкторы для `any`; использовать только на границах C interop

**Ownership-контракт `any` — ответственность разработчика, не компилятора:**
- Передача `T` → `any` параметр: компилятор не знает владеет ли C-функция объектом — разработчик должен знать контракт библиотеки
- `any` как return type: требует немедленного `as T`; ownership (owned vs borrow) определяет разработчик исходя из документации C-функции
- Компилятор не предупреждает об утечках через `any` — это осознанный unsafe

```typescript
// .d.tsc — any как void* для C interop
declare function sqlite3_column_blob(stmt: Ref<SqliteStmt>, col: i32): any
declare function qsort(base: any, n: usize, size: usize, cmp: any): void

// .tsc — cast сразу при получении из C
const blob = sqlite3_column_blob(stmt, 0) as Ref<u8[]>  // borrow — SQLite владеет памятью
```

**Где `any` допустим:**

| Контекст | Допустимость |
|----------|-------------|
| `.d.tsc` параметры и return type | ✅ — это и есть `void*` для C interop |
| `.tsc` код: `val as T` cast | ✅ — немедленный cast при получении из C |
| `.tsc` код: переменная типа `any` | ⚠️ code smell — используй `Ref<T>` или `Mut<T>` |
| `.tsc` код: передача `any` между функциями | ❌ ошибка компилятора |

Для C callback-паттернов с userdata `any` — правильный выбор:
```typescript
// ✅ userdata/context в C callbacks — any уместен
declare function lib_on_event(
    cb:   (result: i32, ctx: any) => void,
    data: any
): void
```

```typescript
// void + throws — Result без value-поля в C
function connect(): void throws IOError { ... }
// → typedef struct { bool ok; IOError error; } _Result_void_IOError;

connect()?;   // ok — propagate
connect()!;   // ok — panic on error
```

### `never` — bottom type

`never` — тип значения, которое никогда не существует. Два применения.

**1. Возвращаемый тип функции, которая никогда не возвращается:**

```typescript
function panic(msg: string): never {
    throw new Error(msg)     // always throws — ok
}

function halt(): never {
    while (true) {}          // infinite loop — ok
}

function unreachable(): never {
    native `abort();`        // C abort — ok
}
```

C-output — `_Noreturn` атрибут (C11; gcc/clang/avr-gcc поддерживают):

```c
_Noreturn static void myapp_src_main_panic_string(String msg) {
    // ...
    abort();
}
```

Компилятор проверяет: все пути функции с `never` обязаны заканчиваться `throw`, бесконечным циклом или вызовом другой `never`-функции — иначе ошибка компилятора.

**2. `assertNever` — exhaustiveness enforcement для `switch`:**

`match` уже имеет встроенный exhaustiveness check (ошибка компилятора). Для `switch` — только предупреждение. `assertNever` превращает его в ошибку:

```typescript
function assertNever(x: never): never {
    throw new Error(`assertNever: unhandled case`)
}
```

```typescript
enum Direction { North, South, East, West }

// switch — предупреждение при неполном покрытии:
switch (dir) {
    case Direction.North: return "N"
    case Direction.South: return "S"
    // East и West не покрыты — только warning
    default: assertNever(dir)  // ❌ ошибка компилятора: dir не сужен до never
                                //    hint: покрой Direction.East и Direction.West
}

// После полного покрытия — dir сужается до never, assertNever принимает:
switch (dir) {
    case Direction.North: return "N"
    case Direction.South: return "S"
    case Direction.East:  return "E"
    case Direction.West:  return "W"
    default: assertNever(dir)  // ✅ — все случаи покрыты, dir: never
}
```

`assertNever` — обычная пользовательская функция, не встроенная. Рекомендуется добавить в проект один раз.

**Ограничения `never`:**

- Нельзя использовать как тип переменной или поля: `let x: never` → ошибка компилятора
- `never | T` → всегда `T` (never — bottom type, поглощается любым типом)
- `never` нельзя использовать в `throws`: `function f(): void throws never` → ошибка компилятора (бессмысленно)

## Null

- `null` — единственное "отсутствующее значение"
- `undefined` **отсутствует** — в отличие от JS, нет разделения на `null` и `undefined`
- `NaN` **отсутствует** — функции парсинга возвращают `T | null` вместо `NaN`; деление на ноль для целых → runtime panic, для float → поведение как в C (`Infinity`, `-Infinity` через IEEE 754, но не `NaN` как значение типа)

### C-представление `T | null`

`T | null` компилируется в struct с bool-флагом:

```c
typedef struct {
    bool    has_value;   // 1 байт
    // padding до выравнивания T
    int32_t value;       // 4 байта
} opt_i32;
```

Размер с учётом выравнивания:

| Тип | C struct | Размер |
|-----|----------|--------|
| `u8 \| null` | `bool + u8` | 2 байта |
| `i16 \| null` | `bool + pad(1) + i16` | 4 байта |
| `i32 \| null` | `bool + pad(3) + i32` | 8 байт |
| `i64 \| null` | `bool + pad(7) + i64` | 16 байт |
| `f32 \| null` | `bool + pad(3) + f32` | 8 байт |
| `f64 \| null` | `bool + pad(7) + f64` | 16 байт |

На desktop это некритично. На embedded (AVR: 2KB RAM) overhead padding может быть значимым.

### Embedded: паттерны вместо `T | null`

Когда overhead `T | null` неприемлем на embedded-платформе — два альтернативных паттерна.

**Паттерн 1: sentinel value**

Выделить одно значение из диапазона типа как «отсутствующее». Подходит когда sentinel гарантированно не встречается в данных:

```typescript
// ADC на AVR: 10-bit значения 0..1023 — 0xFFFF никогда не валидно
const NO_READING: u16 = 0xFFFF

function readADC(): u16 {
    if (!adcReady()) return NO_READING
    return adcRead()  // 0..1023
}

const reading = readADC()
if (reading != NO_READING) {
    processReading(reading)  // 4 байта вместо 8
}
```

Типичные sentinel-значения по типу:

| Тип | Sentinel | Когда использовать |
|-----|----------|-------------------|
| `u8` | `0xFF` | значения 0..254 |
| `u16` | `0xFFFF` | значения 0..65534 |
| `i16` | `-32768` (`INT16_MIN`) | температура, показания датчиков |
| `u32` | `0xFFFFFFFF` | адреса, идентификаторы |

Sentinel — обычная константа в TSClang, не языковая фича. Компилятор не проверяет корректность — ответственность на разработчике.

**Паттерн 2: отдельный флаг в struct**

Сгруппировать несколько bool-флагов в конце struct — все флаги упакованы без padding:

```typescript
// Вместо: { temp: i16|null, humidity: u8|null, pressure: i16|null }
// = (4 + 2 + 4) = 10 байт

// Паттерн: данные + флаги отдельно
interface SensorData {
    temp:     i16    // 2 байта
    pressure: i16    // 2 байта
    humidity: u8     // 1 байт
    // --- флаги в конце, нет padding между ними ---
    tempValid:     bool  // 1 байт
    pressureValid: bool  // 1 байт
    humidityValid: bool  // 1 байт
}
// итого: 8 байт вместо 10
```

Порядок полей влияет на padding — компилятор НЕ переупорядочивает поля автоматически (ABI-совместимость). Разработчик контролирует layout явно.

**Когда использовать какой паттерн:**

| Ситуация | Рекомендация |
|----------|-------------|
| Один optional примитив | sentinel value |
| Struct с несколькими optional полями | отдельный флаг в конце struct |
| Desktop / достаточно памяти | `T \| null` — безопаснее, читаемее |
| `i32 \| null` одиночная переменная | sentinel если подходит, иначе `T \| null` |

## Date

**Намеренный legacy-тип.** Сохранён для совместимости с устоявшимся поведением в двух мирах:
- **C:** `struct tm` из `<time.h>` — месяцы 0-indexed (январь = 0), это стандарт C со времён POSIX
- **JS/TS:** `Date` — та же конвенция, перенятая из C

`Date` не является ошибкой дизайна — он намеренно воспроизводит legacy поведение для кода который взаимодействует с C-библиотеками, системным временем или портируется из JS. Для нового кода используй `std/temporal` (месяцы 1-indexed, явная временная зона, иммутабельные объекты).

JS-совместимый тип даты/времени. Реализован поверх C `time_t` / `struct tm` из `<time.h>`.

Внутреннее представление — `int64_t` (миллисекунды с Unix epoch), как в JS.

### Создание

```typescript
new Date()                              // текущее время
new Date(1710936000000)                 // из миллисекунд с epoch
new Date("2024-03-20")                  // из ISO строки
new Date("2024-03-20T14:30:00.000Z")    // ISO с временем
new Date(2024, 2, 20)                   // год, месяц (0-11!), день
new Date(2024, 2, 20, 14, 30, 0, 0)    // + часы, минуты, секунды, мс
```

### Статические методы

```typescript
Date.now()   // i64 — текущее время в мс с epoch
```

### Геттеры

```typescript
const d = new Date("2024-03-20T14:30:00.000Z");

d.getFullYear()        // i32 — 2024
d.getMonth()           // i32 — 2 (0-11, март = 2)
d.getDate()            // i32 — 20 (день месяца, 1-31)
d.getDay()             // i32 — 3 (день недели, 0=воскресенье)
d.getHours()           // i32 — 14
d.getMinutes()         // i32 — 30
d.getSeconds()         // i32 — 0
d.getMilliseconds()    // i32 — 0
d.getTime()            // i64 — мс с epoch
d.getTimezoneOffset()  // i32 — смещение timezone в минутах
```

### Сеттеры

```typescript
d.setFullYear(2025)
d.setMonth(0)           // январь
d.setDate(1)
d.setHours(12)
d.setMinutes(0)
d.setSeconds(0)
d.setMilliseconds(0)
d.setTime(1710936000000)
```

### Форматирование

```typescript
d.toISOString()          // "2024-03-20T14:30:00.000Z"
d.toString()             // "Wed Mar 20 2024 14:30:00 GMT+0000"
d.toDateString()         // "Wed Mar 20 2024"
d.toTimeString()         // "14:30:00 GMT+0000"
d.toLocaleDateString()   // локализованная дата
d.toLocaleTimeString()   // локализованное время
d.toLocaleString()       // локализованные дата и время
d.valueOf()              // i64 — то же что getTime()
```

### C-output

```c
typedef struct { int64_t ms; } Date;

// Date.now()
Date Date_now() {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (Date){ ts.tv_sec * 1000LL + ts.tv_nsec / 1000000LL };
}

// getFullYear()
int32_t Date_getFullYear(Date d) {
    time_t t = d.ms / 1000;
    struct tm* tm = gmtime(&t);
    return tm->tm_year + 1900;
}
```

> На embedded `gmtime` / `localtime` могут быть недоступны — используй `PlainDateTime` (Temporal, в разработке).

## Массивы и коллекции

### Массивы

| Синтаксис | Тип | Память |
|-----------|-----|--------|
| `[1, 2, 3]` | литерал, динамический | heap |
| `i32[]` | тип динамического массива | heap |
| `i32[3]` | фиксированный, ровно 3 элемента | стек |

```typescript
let a = [1, 2, 3];               // динамический, из литерала
let b: i32[] = [];               // пустой динамический
let c: i32[3] = [1, 2, 3];       // фиксированный, ровно 3 элемента
let d: i32[] = new Array(100);   // capacity=100, length=0 (тип из аннотации)
let e = new Array<i32>(100);     // то же самое, без аннотации
// ВАЖНО: аргумент new Array(N) — это capacity, не length (расхождение с JS)
// Почему: в JS new Array(3) создаёт массив с length=3, заполненный undefined.
// В TSClang нет undefined — значит заполнять нечем.
// new Array(N) — это просто аллокация памяти под N элементов, length=0.
// Элементы появляются только через push() или fill().
```

Фиксированный массив `T[N]`:
- Размер известен на этапе компиляции, память на стеке
- Литерал инициализации должен содержать ровно N элементов — иначе ошибка компилятора
- `push`/`pop` недоступны — ошибка компилятора
- Передаётся в функции как `Ref<T[]>` / `Mut<T[]>` — фиксированный является подтипом динамического:
  ```typescript
  function sum(arr: Ref<i32[]>): i32 { ... }  // принимает любой i32 массив

  let fixed: i32[3] = [1, 2, 3];
  let dynamic: i32[] = [1, 2, 3, 4];

  sum(fixed);    // ok — автоматически как Ref<i32[]>
  sum(dynamic);  // ok
  ```

**Правило возврата методов:**
- Методы возвращающие данные (`pop`, `remove`) — возвращают данные (`T | null`, `T`)
- Мутирующие методы не возвращающие данных (`push`, `fill`, `resize`, `reallocate`, `sort`, `reverse`) — возвращают `Self` для чейнинга

```typescript
// чейнинг мутирующих методов
let arr: i32[] = new Array<i32>(100).resize(50, 0).fill(7, 0, 10)

// чейнинг трансформирующих (возвращают новый массив)
const result = arr
    .filter(x => x > 0)
    .map(x => x * 2)
    .slice(0, 10)
```

Методы и свойства динамического массива:
- `arr.push(item)` — move item в конец массива; бросает при OOM; возвращает `Self`
  ```typescript
  let arr: User[] = [];
  let user = new User();
  arr.push(user);        // move — arr владеет user
  console.log(user);     // ошибка: user перемещён
  ```
- `arr.pop()` — удалить и вернуть последний элемент как owned `T | null`; null если массив пустой
  ```typescript
  let last = arr.pop();  // User | null
  if (last != null) {
      last.doSomething(); // ok — last владеет объектом
  }
  // или короче:
  arr.pop()?.doSomething();           // ?. — только если не null
  const u = arr.pop() ?? defaultUser; // ?? — дефолт если null
  ```
- `arr.remove(i)` — удалить по индексу с возвратом ownership (`T`)
- `arr.fill(value)` — заполнить все слоты 0..capacity, length становится равным capacity; возвращает `Self`
- `arr.fill(value, start, end)` — заполнить индексы `start..end-1` в пределах `0..length`, length не меняется; возвращает `Self`:
  - `end > length` — ошибка компилятора (константы) или runtime error (переменные)
  ```typescript
  let arr: i32[] = new Array(100); // capacity=100, length=0
  arr.fill(0);                      // capacity=100, length=100, все слоты = 0
  arr.fill(5, 0, 10);               // индексы 0..9 = 5, length остаётся 100
  arr.fill(5, 90, 110);             // ошибка: end=110 > length=100
  ```
- `arr.resize(n)` — уменьшить length до n; если n > length — ошибка компилятора (используй `resize(n, value)`); возвращает `Self`
- `arr.resize(n, value)` — изменить length до n, новые слоты заполняются `value`; при уменьшении `value` игнорируется; возвращает `Self`. Capacity: если `n > capacity` — реаллоцирует, новый `capacity >= n` (сколько именно — implementation detail); если `n <= capacity` — capacity не меняется
  ```typescript
  arr.resize(10);       // ok — уменьшить, value не нужен
  arr.resize(50);       // ошибка компилятора: n > length, используй resize(n, value)
  arr.resize(200, 0);   // ok — увеличить, новые слоты = 0, реаллоцирует если нужно
  arr.resize(5, 0);     // ok — уменьшить, value игнорируется
  ```
- `arr.reallocate(n)` — изменить capacity до n; если `n < length` — length обрезается до n; возвращает `Self`
  ```typescript
  let arr: i32[] = new Array(100); // capacity=100, length=0
  arr.fill(0);                      // capacity=100, length=100

  arr.reallocate(200);              // capacity=200, length=100
  arr.reallocate(50);               // capacity=50,  length=50 (обрезано)
  ```
  присвоение `arr.capacity = n` — ошибка компилятора с подсказкой: `use arr.reallocate(n) instead`
- `arr.length` — количество элементов (доступны индексы `0..length-1`), readonly;
  присвоение `arr.length = n` — ошибка компилятора с подсказкой: `use arr.resize(n) instead`
  ```typescript
  let arr: i32[] = new Array(100); // capacity=100, length=0
  arr.push(1);
  arr.push(2);                      // capacity=100, length=2

  arr[0];   // ok → 1
  arr[1];   // ok → 2
  arr[2];   // runtime error: index 2 out of bounds (length=2)
  arr[99];  // runtime error: index 99 out of bounds (length=2)
  arr[-1];  // ok → 2 (последний элемент)
  arr[-3];  // runtime error: index -3 out of bounds (length=2)

  arr.length = 10; // ошибка компилятора: use arr.resize(10) instead
  ```
- `arr.capacity` — заранее выделенная память, readonly;
  присвоение `arr.capacity = n` — ошибка компилятора с подсказкой: `use arr.reallocate(n) instead`
- `arr.sort(cmp?: (Ref<T>, Ref<T>) => i32)` — сортировка на месте; без аргумента — по умолчанию (`<`); возвращает `Self`
- `arr.reverse()` — разворот на месте; возвращает `Self`
- `arr.shift()` — удалить и вернуть первый элемент как owned `T | null`; O(n) — сдвигает остальные элементы
- `arr.unshift(item)` — добавить элемент в начало; move semantics; O(n); возвращает `Self`
- `arr.splice(start: i32, deleteCount?: i32, ...items: T[])` — удалить `deleteCount` элементов начиная с `start`, вставить `items`; возвращает удалённые элементы как owned `T[]`; отрицательный `start` — от конца
  ```typescript
  let arr: i32[] = [1, 2, 3, 4, 5]
  const removed = arr.splice(1, 2, 10, 20)  // removed = [2, 3], arr = [1, 10, 20, 4, 5]
  arr.splice(0, 0, 0)                        // вставка без удаления: arr = [0, 1, 10, 20, 4, 5]
  ```
- `arr.join(sep?: string): string` — объединить элементы в строку через разделитель; **требует `T implements { toString(): string }`**; все примитивы и `string` удовлетворяют автоматически
  ```typescript
  [1, 2, 3].join(", ")   // "1, 2, 3"
  [1, 2, 3].join()       // "1,2,3" — дефолтный разделитель ","
  ```
- `arr.set(src: Ref<T[]>, offset?: usize)` — скопировать элементы из `src` в `arr` начиная с `offset`; C-output: `memcpy`; bounds check в runtime
- `arr.forEach(f: (Ref<T>) => void)` — итерация без результата; callback получает `Ref<T>`
- `arr.keys(): Iterator<usize>` — итератор индексов
- `arr.values(): Iterator<Ref<T>>` — итератор значений (borrow)
- `arr.entries(): Iterator<[usize, Ref<T>]>` — итератор пар [index, value]

**Статические:**
- `Array.from<T>(src: Iterable<T>): T[]` — создать из iterable; клонирует элементы если `T: Clone`
- `Array.of<T>(...items: T[]): T[]` — создать из аргументов; сахар над литералом

### Функциональные и поисковые методы

Callback получает `Ref<T>` — borrow элемента, не ownership. Элемент остаётся в массиве.

- `arr.map<U>(f: (Ref<T>) => U): U[]` — новый массив `U[]` (owned); callback не владеет элементом
- `arr.filter(f: (Ref<T>) => bool): T[]` — новый массив из **клонов** совпавших элементов; **требует `T: Clone`**
- `arr.reduce<U>(f: (U, Ref<T>) => U, init: U): U` — аккумулятор `U` owned; callback получает `Ref<T>`
- `arr.find(f: (Ref<T>) => bool): Ref<T> | null` — borrow первого совпадения; время жизни привязано к источнику
- `arr.findIndex(f: (Ref<T>) => bool): i32` — индекс первого совпадения, `-1` если не найден
- `arr.findLast(f: (Ref<T>) => bool): Ref<T> | null` — borrow последнего совпадения; симметрично `find`
- `arr.findLastIndex(f: (Ref<T>) => bool): i32` — индекс последнего совпадения, `-1` если не найден
- `arr.some(f: (Ref<T>) => bool): bool` — `true` если хотя бы один элемент проходит фильтр
- `arr.every(f: (Ref<T>) => bool): bool` — `true` если все элементы проходят фильтр
- `arr.includes(item: Ref<T>): bool` — поиск по значению через `==`
- `arr.indexOf(item: Ref<T>): i32` — индекс первого вхождения, `-1` если не найден
- `arr.lastIndexOf(item: Ref<T>): i32` — индекс последнего вхождения, `-1` если не найден
- `arr.slice(start?: i32, end?: i32): T[]` — новый массив из **клонов** элементов `start..end-1`; **требует `T: Clone`**; отрицательные индексы от конца; без аргументов — клон всего массива
- `arr.concat(other: Ref<T[]>): T[]` — новый массив = клон `arr` + клон `other`; **требует `T: Clone`**
- `arr.flat(): U[]` — разгладить вложенность на 1 уровень: `T[][]` → `T[]`; **требует `T: Clone`**; на embedded запрещён (heap)
- `arr.flatMap<U>(f: (Ref<T>) => U[]): U[]` — map + flat(1); эквивалент `arr.map(f).flat()`; на embedded запрещён
- `arr.toSorted(cmp?: (Ref<T>, Ref<T>) => i32): T[]` — новый отсортированный массив; оригинал не меняется; **требует `T: Clone`**
- `arr.toReversed(): T[]` — новый перевёрнутый массив; оригинал не меняется; **требует `T: Clone`**
- `arr.toSpliced(start: i32, deleteCount?: i32, ...items: T[]): T[]` — новый массив с применённым splice; оригинал не меняется; **требует `T: Clone`**
- `arr.with(index: i32, value: T): T[]` — новый массив с заменённым элементом по индексу; оригинал не меняется; **требует `T: Clone`**
- `arr.reduce<U>(f: (U, Ref<T>) => U, init: U): U` — аккумулятор `U` owned; callback получает `Ref<T>`
- `arr.reduceRight<U>(f: (U, Ref<T>) => U, init: U): U` — то же, но справа налево
- `arr.groupBy<K>(f: (Ref<T>) => K): Map<K, T[]>` — сгруппировать элементы по ключу; **требует `T: Clone`**; возвращает `Map<K, T[]>`

```typescript
const nums: i32[] = [1, 2, 3, 4, 5]

const doubled = nums.map(x => x * 2)               // i32[] — [2, 4, 6, 8, 10]
const evens   = nums.filter(x => x % 2 == 0)       // i32[] — [2, 4]
const sum     = nums.reduce((acc, x) => acc + x, 0) // i32 — 15
const found   = nums.find(x => x > 3)              // Ref<i32> | null
const idx     = nums.findIndex(x => x > 3)         // i32 — 3
const hasBig  = nums.some(x => x > 4)              // bool — true
const allPos  = nums.every(x => x > 0)             // bool — true
const has3    = nums.includes(3)                    // bool — true
const pos     = nums.indexOf(3)                     // i32 — 2
const part    = nums.slice(1, 3)                   // i32[] — [2, 3] (clone)
const joined  = nums.concat([6, 7])                // i32[] — [1, 2, 3, 4, 5, 6, 7]
```

**Clone-требование:** примитивы (`i32`, `f64`, `bool`, `u8` и т.д.) клонируются автоматически. Строки — Clone. Классы — через явный метод `clone()`. Если `T: Clone` не выполнено — ошибка компилятора при вызове `filter` / `slice` / `concat`.

**`find` возвращает borrow** — результат нельзя использовать дольше источника и нельзя мутировать:

```typescript
// ✅ borrow — только читаем
const r: Ref<User> | null = users.find(u => u.id == targetId)
if (r != null) console.log(r.name)

// ✅ owned-операции — через findIndex + доступ по индексу
const i = users.findIndex(u => u.id == targetId)
if (i >= 0) users[i].activate()   // Mut<User> через индекс
```

**Чейнинг:** `map` и `filter` возвращают новый массив, поэтому чейн `.filter(...).map(...)` создаёт промежуточный массив. Это ожидаемое поведение — нет lazy evaluation.

### Slice<T> — zero-copy view

`Slice<T>` — non-owning borrowed view в непрерывный участок массива или буфера. Создаётся через `.view()`. В отличие от `.slice()` (копирует), `.view()` не копирует данные.

```typescript
let arr: i32[] = [1, 2, 3, 4, 5, 6, 7, 8]

const s: Slice<i32> = arr.view(2, 6)   // элементы 2..5, zero-copy
s[0]       // 3
s[1]       // 4
s.length   // 4

s.view(1, 3)   // под-слайс: элементы 3..4
```

`Slice<T>` — borrow: borrow checker проверяет что источник не dropped пока слайс жив. Передаётся в функции как `Ref<T[]>`:

```typescript
function sum(data: Ref<i32[]>): i32 { ... }

sum(arr.view(0, 4))   // ✅ Slice<i32> совместим с Ref<i32[]>
sum(arr)              // ✅ тоже ok
```

Методы: `view(start?, end?)` — под-слайс; `[i]` — элемент; `.length` — длина. Мутабельный слайс — `MutSlice<T>` (из `.viewMut()`):

```typescript
const ms: MutSlice<u8> = buf.viewMut(0, 4)
ms[0] = 0xFF   // запись в оригинальный буфер
```

C-output:
```c
typedef struct { int32_t* ptr; size_t length; } Slice_i32;
typedef struct { int32_t* ptr; size_t length; } MutSlice_i32;
// .view(2, 6) → { .ptr = arr->data + 2, .length = 4 }  — без копирования
```

### Структуры данных под капотом

| Тип | Реализация в C | Ключи |
|-----|----------------|-------|
| `{}` объектный литерал | `typedef struct` (C) | известны на этапе компиляции |
| `Map<K, V>` | хеш-таблица | известны только в runtime |
| `Set<T>` | хеш-множество | известны только в runtime |

`Object.keys(obj)` — компилятор знает ключи статически и генерирует их как массив констант. В отличие от JS, `{}` в TSC **не является** хеш-таблицей.

### Map

Инициализация:
```typescript
// Универсальный — любой тип ключа
let m = new Map<string, i32>([["a", 1], ["b", 2]]);

// Объектный литерал — только string ключи
let m: Map<string, i32> = { "a": 1, "b": 2 };

// Пустая Map
let m = new Map<string, i32>();
```

Методы:
```typescript
m.set(key, value)   // key: move (сложный тип) / copy (примитив); value: move — Map владеет обоими
m.get(key)          // key: Ref<K>, возвращает Ref<V> | null (не V | undefined как в JS)
m.has(key)          // key: Ref<K>, boolean
m.delete(key)       // key: Ref<K>, возвращает V | null (owned) — элемент удалён из Map
m.clear()           // void
m.size              // number, readonly

// ?. и ?? с Map
const len = m.get("key")?.length ?? 0;   // Ref<string> | null → i32
const val = m.delete("key") ?? fallback;  // V | null → V
```

Примеры ownership:
```typescript
let m = new Map<string, User>();
let user = new User();
m.set("alice", user);   // "alice" — литерал, копируется; user — move
console.log(user);      // ошибка: user перемещён

let key = "alice";
m.set(key, user2);      // key — move
console.log(key);       // ошибка: key перемещён

let u = m.get("alice");    // Ref<User> | null — borrow из Map
let u = m.delete("alice"); // User | null — owned, элемент удалён

// примитивы — всегда copy
let m = new Map<string, i32>();
m.set("x", 42);         // 42 скопирован
m.get("x");             // i32 | null — copy (примитив)
```

Итерация — `k: Ref<K>`, `v: Ref<V>` для сложных типов, copy для примитивов:
```typescript
for (const [k, v] of m) {
    v.doSomething();  // ok — immutable метод
    v.mutMethod();    // ошибка — v это Ref
    m.set("x", val);  // ошибка — m заимствован
}
m.forEach((k, v) => { ... });
for (const k of m.keys()) { ... }
for (const v of m.values()) { ... }
for (const [k, v] of m.entries()) { ... }
```

### Set

Инициализация:
```typescript
let s = new Set<i32>([1, 2, 3]);
let s = new Set<string>();
```

Методы:
```typescript
s.add(value)        // move — Set становится владельцем; бросает при OOM
s.has(value)        // Ref<T> — только для сравнения, владение не меняется; boolean
s.delete(value)     // Ref<T> для поиска, возвращает T | null (owned) — элемент удалён из Set
s.clear()           // void
s.size              // number, readonly

// ?. и ?? с Set
const deleted = s.delete(user);
deleted?.cleanup();                    // вызвать метод если элемент был в Set
const u = s.delete(user) ?? fallback; // дефолт если элемента не было
```

Примеры ownership:
```typescript
let s = new Set<User>();
let user = new User();
s.add(user);        // move — user перешёл во владение Set
console.log(user);  // ошибка: user перемещён

// примитивы — всегда copy
let s = new Set<i32>();
let x = 42;
s.add(x);           // copy
console.log(x);     // ok
```

Теоретико-множественные операции — доступны для примитивов, `string` и `Shared<T>`:
```typescript
s.union(other)               // новый owned Set — все элементы из s и other
s.intersection(other)        // новый owned Set — только общие элементы
s.difference(other)          // новый owned Set — элементы s которых нет в other
s.symmetricDifference(other) // новый owned Set — элементы только в одном из двух
s.isSubsetOf(other)          // boolean
s.isSupersetOf(other)        // boolean
s.isDisjointFrom(other)      // boolean
```

Для `Shared<T>` — union это просто retain на каждый элемент, без копирования объектов:
```typescript
let user1: Shared<User> = new User();
let user2: Shared<User> = new User();

let a = new Set<Shared<User>>([user1, user2]);
let b = new Set<Shared<User>>([user2]);
let c = a.union(b);  // ok — retain на элементы, refcount растёт
```

Для `string` — элементы клонируются в новый Set:
```typescript
let morphemes = new Set<string>(["бег", "ать"]);
let suffixes  = new Set<string>(["ать", "ить"]);
let common = morphemes.intersection(suffixes);  // new Set<string> {"ать"}
```

Для owned сложных типов — ошибка компилятора:
```typescript
let a = new Set<User>([user1, user2]);
let b = new Set<User>([user2]);
let c = a.union(b);
// ошибка: union requires Set<primitive>, Set<string> or Set<Shared<T>>
// hint: use Set<Shared<User>> instead
```

Итерация — `v` это `Ref<T>` для сложных типов, copy для примитивов:
```typescript
for (const v of s) {
    v.doSomething();  // ok — immutable метод
    v.mutMethod();    // ошибка — v это Ref
    s.add(other);     // ошибка — s заимствован
}
s.forEach((v) => { ... });
for (const v of s.values()) { ... }
for (const v of s.keys()) { ... }         // синоним values() — для совместимости с Map API
for (const [v, v2] of s.entries()) { ... } // пары [value, value] — для совместимости с Map API
```

#### Set на embedded

Аналогично `Map<K,V>`: на `allocator: "static"` обязателен compile-time capacity:

```typescript
// Работает на NES, ZX Spectrum, Arduino — с @static
@static const visitedTiles = new Set<u16>(256)   // 256 тайлов в BSS
@static const activeKeys   = new Set<u8>(8)      // 8 одновременно нажатых клавиш

visitedTiles.add(0x0102)        // добавить тайл
visitedTiles.has(0x0102)        // проверить
visitedTiles.delete(0x0102)     // удалить
```

```c
/* C-output — static hash set, всё в BSS */
typedef struct { uint16_t key; bool occupied; } _visitedTiles_Entry;
static _visitedTiles_Entry _visitedTiles_data[256];
static Set_u16 visitedTiles = { _visitedTiles_data, 256, 0 };
```

Переполнение → runtime panic: `set overflow: capacity 256 exceeded`.

### Object

Статические методы для работы с объектами. Ключи — compile-time константы, возвращаются как копии. Значения — Ref для сложных типов, copy для примитивов:

```typescript
const obj = { a: user1, b: user2 };
Object.keys(obj)    // string[]              — копии ключей
Object.values(obj)  // Ref<User>[]           — borrow значений
Object.entries(obj) // [string, Ref<User>][] — ключи copy, значения Ref

const obj = { x: 1, y: 2 };
Object.keys(obj)    // string[]          — копии ключей
Object.values(obj)  // i32[]             — copy (примитивы)
Object.entries(obj) // [string, i32][]   — всё copy
```

Итерация:
```typescript
for (const k of Object.keys(obj)) { ... }
for (const v of Object.values(obj)) { ... }
for (const [k, v] of Object.entries(obj)) { ... }
```

### Object.fromEntries\<T\>

Обратная операция к `Object.entries` — создаёт структурный тип из массива пар `[key, value]`:

```typescript
const entries: [string, i32][] = [["a", 1], ["b", 2]]
const obj = Object.fromEntries<{ a: i32; b: i32 }>(entries)
obj.a  // 1
obj.b  // 2
```

Компилятор знает тип через дженерик-параметр (аналогично `JSON.parse<T>`):
- Если ключи — строковые литералы, компилятор проверяет соответствие набора ключей типу `T` в compile-time.
- Если ключи — переменные, проверка невозможна: несоответствие вызывает **runtime panic**.

```typescript
// Compile-time check — OK или ошибка:
const literal: [string, i32][] = [["a", 1], ["b", 2]]
Object.fromEntries<{ a: i32; b: i32 }>(literal)   // OK — ключи совпадают
Object.fromEntries<{ a: i32; c: i32 }>(literal)   // compile error — нет ключа "c"

// Runtime panic при несовпадении ключей:
const keys = getKeysFromSomewhere()
Object.fromEntries<{ a: i32; b: i32 }>(keys.map(k => [k, 0]))  // panic если ключ не "a" или "b"
```

## Tuples

Tuple — фиксированный кортеж с известным количеством элементов и их типами. В отличие от массива, каждый элемент может иметь свой тип.

```typescript
let pair: [i32, string] = [1, "hello"]
let triple: [i32, string, f64] = [1, "hello", 3.14]

pair[0]  // 1 — i32
pair[1]  // "hello" — string

const [a, b] = pair       // a: i32, b: string
const [x, , z] = triple   // x: i32, z: f64 (пропуск элемента)
```

**C-output:** struct с полями `_0`, `_1`, `_2`:

```c
typedef struct {
    int32_t _0;
    String  _1;
} tuple_i32_string;

tuple_i32_string pair = {
    ._0 = 1,
    ._1 = (String){ .data = "hello", .length = 5, .capacity = 0 }
};
```

### Labeled Tuples

Labels дают имена элементам и разрешают dot-access наравне с индексным:

```typescript
type Point = [x: f64, y: f64]

let p: Point = [1.0, 2.0]
p[0]  // ok — 1.0
p.x   // ok — сахар над p[0], компилируется в p._0
```

`p.x` и `p[0]` генерируют одинаковый C-код.

**Ограничения:**
- Labels либо у всех элементов, либо ни у кого — `[x: f64, f64]` ошибка
- Label не должен совпадать со встроенными свойствами (`length`)
- Labels улучшают сообщения об ошибках: `missing element 'port' at index 1`

### Readonly Tuples

```typescript
let t: readonly [i32, string] = [1, "hello"]
t[0] = 5  // ошибка: cannot assign to readonly tuple element
```

```c
typedef struct {
    const int32_t _0;
    const String  _1;
} readonly_tuple_i32_string;
```

### Optional Elements

Optional элементы (`?`) разрешены только в конце:

```typescript
type Config = [string, i32?]

let a: Config = ["localhost"]         // ok — i32 отсутствует
let b: Config = ["localhost", 8080]   // ok
a[1]  // i32 | null
```

```typescript
type Good = [i32, string?, f64?]  // ok
type Bad  = [i32?, string, f64]   // ошибка: optional element must be at end
```

```c
typedef struct {
    String  _0;
    opt_i32 _1;  // bool has_value + int32_t value
} tuple_string_opt_i32;
```

### Rest Elements

`...T[]` — произвольное количество элементов в конце. Один rest, только в конце, несовместим с optional.

```typescript
type Strings = [string, ...string[]]

let a: Strings = ["first"]
let b: Strings = ["first", "second", "third"]
```

**C-output:** `pointer + length`, не growable array:

```c
typedef struct {
    String  _0;
    String* tail;
    usize   tail_len;
} tuple_string_rest_string;
```

Rest-часть требует heap. На embedded — те же правила что и `Array`.

Spread из runtime-массива в rest-tuple разрешён:

```typescript
function wrap(items: string[]): [i32, ...string[]] {
    return [0, ...items]  // ok — items.length становится tail_len
}
```

Spread из runtime-массива в фиксированный tuple — ошибка компилятора:

```typescript
let t: [i32, string, string] = [1, ...runtimeArray]
// ошибка: cannot spread runtime-length array into fixed tuple
```

### Spread в tuple-литералах

Spread tuple-специфичные случаи. Для spread в массивах — см. [spec/02-syntax.md](02-syntax.md).

```typescript
// Копирование tuple
const p: [f64, f64, f64] = [1.0, 2.0, 3.0]
const copy: [f64, f64, f64] = [...p]

// Spread фиксированного tuple — размер известен статически
const pair: [f64, f64] = [1.0, 2.0]
const triple: [f64, f64, f64] = [...pair, 3.0]  // ok
```

### Ownership

```typescript
let t: [User, string] = [new User(), "test"]

// Move — tuple потреблён
const [user, name] = t  // user: User, name: string; t невалиден

// Borrow — передай как Ref параметром
function process(t: Ref<[User, string]>): void {
    const [user, name] = t  // user: Ref<User>, name: Ref<string>
}
```

### Tuple vs Array

| Свойство | Tuple `[A, B]` | Array `A[]` |
|----------|----------------|-------------|
| Размер | Фиксирован на compile-time | Динамический |
| Типы элементов | Разные | Одинаковые |
| C-output | Struct | Dynamic array struct |
| `.length` | Compile-time константа | Runtime значение |

## Clone

`Clone` — интерфейс для deep copy. Два синтаксиса, одна семантика:

```typescript
interface Clone {
    clone(): this;
}

class User implements Clone {
    name: string;
    age: i32;

    clone(): User {
        return new User(this.name, this.age);
    }
}

let u1 = new User("Alice", 30);
let u2 = structuredClone(u1);  // функциональный стиль
let u3 = u1.clone();           // метод — то же самое
console.log(u1);               // ok — u1 жив
```

- Примитивы и `string` — auto-implement Clone
- Массивы — `clone()` / `structuredClone` работают если элементы реализуют `Clone`
- `Shared<T>` — `structuredClone` создаёт новый независимый объект (deep copy, не retain)
- Spread для pure-primitive структур = неявный clone; для сложных полей = move

```typescript
// массивы
let arr = [1, 2, 3];
let arr2 = arr.clone();           // ok — примитивы

let users = [user1, user2];
let users2 = users.clone();       // ok — User implements Clone

let items = [item1, item2];
let items2 = items.clone();       // ошибка: Item does not implement Clone
                                  // hint: implement Clone on Item
```

## Type Aliases

`type` — compile-time алиас, не генерирует новый тип в C:

```typescript
// 1. Алиас примитива — читабельность
type UserId = i32;
type Timestamp = i64;

function getUser(id: UserId): User { ... }  // UserId = i32 в C

// 2. Алиас объекта — эквивалентен data-only interface, генерирует typedef struct
type Point = { x: f64, y: f64 };     // → typedef struct { double x; double y; } Point;
let p: Point = { x: 1.0, y: 2.0 };  // ok — Point struct

// 3. Nullable тип (единственный допустимый union)
type Nullable<T> = T | null;  // generic алиас

// ❌ ЗАПРЕЩЕНО: non-nullable union
// type StringOrInt = string | i32;       // ошибка компилятора
// function process(x: string | i32) {}  // ошибка компилятора

// ✅ Полиморфизм через interface:
interface Shape { area(): f64 }
class Circle implements Shape { r: f64; area(): f64 { return Math.PI * this.r * this.r; } }
class Rect implements Shape { w: f64; h: f64; area(): f64 { return this.w * this.h; } }
function process(x: Shape): void { ... }

// 4. Тип функции — для колбэков
type Callback = (x: i32) => void;
type Comparator<T> = (a: Ref<T>, b: Ref<T>) => i32;

function sort(arr: Mut<i32[]>, cmp: Comparator<i32>): void { ... }
```

- `type Point = { ... }` — гарантированно `typedef struct`, методы запрещены; `interface Point { ... }` без методов — тоже `typedef struct`, но методы можно добавить позже
- `type UserId = i32` — compile-time алиас примитива, нового C типа нет; `UserId` и `i32` взаимозаменяемы
- `T | null` — единственный допустимый runtime union; любой non-nullable runtime union (`string | i32`, `A | B`) — **ошибка компилятора**
- Для полиморфизма — class-иерархия (`abstract class`) или discriminated union через enum

## String Literal Union

String literal union — **compile-time концепция**. В runtime не существует — компилируется в C enum.

```typescript
type Dir = "north" | "south" | "east" | "west"
type Status = "ok" | "error" | "pending"

let d: Dir = "north"   // ok
d = "up"               // ошибка компилятора: "up" не входит в Dir
```

```c
typedef enum { Dir_north, Dir_south, Dir_east, Dir_west } Dir;

static const char* const Dir_values[] = {
    [Dir_north] = "north",
    [Dir_south] = "south",
    [Dir_east]  = "east",
    [Dir_west]  = "west"
};
```

**Конверсия в string — явная:**

```typescript
const s1 = d.toString()   // "north" — читаемо
const s2 = d as string    // "north" — кратко
```

Автоконверт запрещён — в C это скрытый `Dir_values[d]`, overhead должен быть виден в коде.

**Где разрешён string literal union:**

| Позиция | Разрешено |
|---------|-----------|
| `type` alias | ✅ |
| Тип параметра функции | ✅ |
| Generic параметр (`keyof`, `Pick`, `Record`) | ✅ |
| Runtime union с другим типом (`Dir \| i32`) | ❌ |
| Автоконверт в `string` | ❌ |

## Utility Types

Utility types — **compile-time type operators**. В C не существуют: компилятор разворачивает их в конкретные struct/enum на этапе type checking.

### Generic functions — правило А+Б

```typescript
// ✅ А: type alias — всегда разрешён
type UserName = Pick<User, "name">
type PartialConfig = Partial<Config>

// ✅ Б: utility type в позиции параметра generic function
function log<T>(obj: Pick<T, "name">): void {
    print(obj.name)
}
function merge<T>(base: T, patch: Partial<T>): T { ... }

// ❌ utility type в return type generic function
function pick<T, K extends keyof T>(obj: T, key: K): Pick<T, K>
// ошибка: Pick с runtime-key в return type невозможен в C
```

Запрет на return type с generic key — потому что `{ [key]: obj[key] }` невозможно в C (нет динамического доступа к полям).

### keyof

`keyof T` — compile-time оператор, возвращает string literal union ключей типа. Работает только внутри utility types и type aliases.

```typescript
type User = { name: string; age: i32 }

keyof User  // → "name" | "age"
```

Не может использоваться в runtime выражениях.

### Partial\<T\>

Все поля становятся optional.

```typescript
type User = { name: string; age: i32 }
type PartialUser = Partial<User>
// → { name?: string; age?: i32 }
```

```c
typedef struct {
    opt_string name;  // bool has_value + string
    opt_i32    age;
} PartialUser;
```

### Required\<T\>

Все поля становятся обязательными. Обратный к `Partial`.

```typescript
type User = { name?: string; age?: i32 }
type RequiredUser = Required<User>
// → { name: string; age: i32 }
```

### Readonly\<T\>

Все поля становятся константными.

```typescript
type User = { name: string; age: i32 }
type ReadonlyUser = Readonly<User>
```

```c
typedef struct {
    const char* const name;
    const int32_t     age;
} ReadonlyUser;
```

### NonNullable\<T\>

Убирает `null` из типа.

```typescript
type T  = string | null
type NN = NonNullable<T>  // → string
```

### Pick\<T, K\>

Выбирает подмножество полей. `K` — string literal или literal union (не переменная).

```typescript
type User = { name: string; age: i32; email: string }
type UserName    = Pick<User, "name">
// → { name: string }

type UserContact = Pick<User, "name" | "email">
// → { name: string; email: string }
```

### Omit\<T, K\>

Исключает поля. Обратный к `Pick`.

```typescript
type UserPublic  = Omit<User, "passwordHash">
type UserMinimal = Omit<User, "age" | "email">
```

### Record\<K, V\>

| K | Результат |
|---|-----------|
| Literal union (`"x" \| "y"`) | `typedef struct` |
| `enum` | `typedef struct` |
| `string` | `Map<string, V>` (runtime) |

```typescript
type Coords  = Record<"x" | "y", f64>       // → struct { f64 x; f64 y; }
type Point3D = Record<Axis, f64>             // → struct по enum Axis
type StrMap  = Record<string, i32>           // → Map<string, i32>
```

```c
// Record<"x" | "y", f64>
typedef struct { double x; double y; } Coords;

// Record<Axis, f64>  (enum Axis { X, Y, Z })
typedef struct { double x; double y; double z; } Point3D;
```

### ReturnType\<T\>

Извлекает return type функции. `T` — function type или `typeof function`.

```typescript
function foo(): string { ... }
type R = ReturnType<typeof foo>  // → string
```

### Parameters\<T\>

Параметры функции как tuple.

```typescript
function foo(x: i32, y: string): void { ... }
type P = Parameters<typeof foo>  // → [i32, string]
```

### Awaited\<T\>

Unwrap async/Promise типа (рекурсивно).

```typescript
async function fetchData(): Promise<User> { ... }
type U = Awaited<ReturnType<typeof fetchData>>  // → User
type B = Awaited<Promise<Promise<i32>>>         // → i32
```

### Не поддерживаемые

| Utility | Причина |
|---------|---------|
| `Extract<T, U>` | Требует conditional types |
| `Exclude<T, U>` | Требует conditional types |
| `InstanceType<T>` | Нет constructor type concept |
| `ThisParameterType<T>` | Нет OOP `this` semantics |
| `Uppercase<T>` / `Lowercase<T>` | Template literal types |

### Примеры

```typescript
// Partial для конфигурации со значениями по умолчанию
type Config = { host: string; port: i32; timeout: i32 }

function createConfig(overrides: Partial<Config>): Config {
    return {
        host:    overrides.host    ?? "localhost",
        port:    overrides.port    ?? 8080,
        timeout: overrides.timeout ?? 30000
    }
}

// Pick для публичного API
type User = { id: i32; name: string; email: string; passwordHash: string }
type PublicUser = Pick<User, "id" | "name" | "email">

function getUser(id: i32): PublicUser { ... }

// Record для векторов
type Vec3 = Record<"x" | "y" | "z", f64>

function normalize(v: Vec3): Vec3 {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
    return { x: v.x / len, y: v.y / len, z: v.z / len }
}

// Utility type в параметре generic function (Вариант Б)
function merge<T>(base: T, patch: Partial<T>): T {
    // компилятор знает конкретный T на call site
    ...
}
```

