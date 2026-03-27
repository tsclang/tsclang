# TSClang — Система типов

## Generics

- **Монорфизация** — компилятор генерирует отдельный код для каждого конкретного типа:
  - `identity<i32>` → `identity_i32` в C
  - `identity<User>` → `identity_User` в C
- **Синтаксис** — TypeScript-стиль `<T>`:
  ```typescript
  function identity<T>(x: T): T { return x; }
  function map<T, U>(arr: Ref<T[]>, f: (x: Ref<T>) => U): U[] { ... }

  class Stack<T> {
      items: T[];
      mut push(item: T): void { ... }
      mut pop(): T { ... }
  }
  ```
- **Bounds** — ограничение типового параметра через `implements` или `extends` (синонимы):
  ```typescript
  // оба синтаксиса эквивалентны — компилятор принимает оба
  function sort<T implements Comparable<T>>(arr: Mut<T[]>): void { ... }
  function sort<T extends  Comparable<T>>(arr: Mut<T[]>): void { ... }

  // несколько bounds
  function process<T implements Comparable<T> & Serializable>(val: T): void { ... }

  // структурный bound (по полям, без interface)
  function findById<T implements { id: i32 }>(arr: T[], id: i32): T | null { ... }

  // несколько параметров с bounds
  function zip<A implements Clone, B implements Clone>(a: A[], b: B[]): [A, B][] { ... }
  ```
  > **Линтер:** может предупредить, что предпочтительнее использовать `implements` над `extends`, но это ломает совместимость с TS. В generic-позиции — `extends` семантически означает наследование, которого в TSClang нет. `extends` допустим для совместимости с привычками TS-разработчиков.

- Без bounds — проверка при инстанцировании. Правила ownership применяются в момент подстановки конкретного типа:
  ```typescript
  first<i32>(arr);   // ok — примитив, копируется
  first<User>(arr);  // ошибка в точке вызова: User — сложный тип, нельзя вернуть T из Ref<T[]>
  ```
- **Ownership с generics** — `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>` работают как обычно:
  ```typescript
  function first<T>(arr: Ref<T[]>): Ref<T> { ... }  // borrow элемента
  function pop<T>(arr: Mut<T[]>): T { ... }          // move с удалением
  function process<T>(graph: Shared<T>) { ... }      // ARC
  ```

## Extension Methods

Добавление методов к существующим типам без изменения их определения. Импортируются явно — не загрязняют тип глобально.

```typescript
// std/string.tsc — объявление extension
export extension function charCount(this: string): i32 {
    // ... подсчёт codepoints
}

export extension function chars(this: string): Iterator<u32> {
    // ... итератор по codepoints
}
```

```typescript
// main.tsc — использование
import { charCount, chars } from "std/string"

const s = "привет"
s.charCount()   // ✅ — extension доступен после импорта
s.chars()       // ✅

// в другом файле без импорта:
s.charCount()   // ❌ ошибка компилятора: method charCount not found on string
                //    hint: import { charCount } from "std/string"
```

**Правила:**
- `this` — первый параметр, указывает расширяемый тип; не передаётся явно при вызове
- Встроенные методы типа имеют **приоритет** над extension — shadowing built-in невозможен (ошибка компилятора)
- Extension виден только в файлах где он импортирован — **нет глобального загрязнения**
- Работает для любого типа: `string`, `i32`, пользовательских `type`/`interface`/`class`

**Пользовательские extensions:**
```typescript
// my_ext.tsc
export extension function toJson(this: User): string {
    return `{"name":"${this.name}","age":${this.age}}`
}
```

```typescript
import { toJson } from "./my_ext"
user.toJson()   // ✅
```

**C-output** — статический вызов, zero overhead:
```c
// import { charCount } from "std/string"  →
#include "std_string.h"
int32_t n = tsc_std_string_charCount(s);   // статический вызов, нет vtable
```

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
  - Widening **без потерь** — неявно, молча:
    - `i8`/`i16`/`i32` → любой больший int (`i64`)
    - `u8`/`u16`/`u32` → любой больший uint (`u64`)
    - `i32` → `f64`, `u32` → `f64`, `f32` → `f64`
  - Widening **с потерей точности** — требует явный `as`:
    - `i32` → `f32`, `i64` → `f32`, `i64` → `f64`, `u64` → `f64`
  - Narrowing (f64→i32 и т.д.) — всегда требует `as`
- **Оператор `as`** — явное приведение типа, три случая:
  ```typescript
  // 1. Числовые типы — C-cast, может быть lossy
  3.14 as i32       // (int32_t)3.14 в C → 3
  1000 as i8        // переполнение — поведение как в C (implementation-defined)

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
  - На 8-bit таргетах (`"target": "avr"` и др.) — warning если встречается `f64`
  ```json
  // tsc.package.json — AVR
  { "target": "avr", "mcu": "atmega328p", "defaultNumber": "f32" }
  ```
  ```typescript
  // Десктоп (defaultNumber = f64)
  const a = 1;           // f64
  const b: number = 1;   // f64
  const c: f32 = 1;      // f32 (явно)

  // AVR (defaultNumber = f32)
  const a = 1;           // f32
  const b: number = 1;   // f32
  const c: f32 = 1;      // f32 (явно)
  const d: f64 = 1;      // f64 + warning: f64 on 8-bit target is inefficient
  ```
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
```

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

Для сегментации графем — **utf8proc** (UAX #29, ~300KB, C-native; работает на embedded).

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
```

## Специальные типы

| Тип TSC | Тип C | Описание |
|---------|-------|----------|
| `void` | `void` | отсутствие значения — только для возвращаемого типа функции |
| `any` | `void*` | неизвестный тип — borrow checker не применяется |

```typescript
function log(msg: string): void { ... }  // void — нет return value

function getFromC(): any { ... }         // void* в C
let val: any = getFromC();
let s = val as string;                   // явный cast обязателен
```

- `void` нельзя использовать как тип переменной — только возвращаемый тип
- `any` = `void*` в C, **неявно nullable** — `void*` может быть `NULL`; писать `any | null` избыточно и запрещено (ошибка компилятора)
- `any` отключает borrow checker — **управление памятью ручное**, утечки на совести разработчика; использовать только на границах C interop

```typescript
// void + throws — Result без value-поля в C
function connect(): void throws IOError { ... }
// → typedef struct { bool ok; IOError error; } _Result_void_IOError;

connect()?;   // ok — propagate
connect()!;   // ok — panic on error
```

## Null

- `null` — единственное "отсутствующее значение"
- `undefined` **отсутствует** — в отличие от JS, нет разделения на `null` и `undefined`
- `NaN` **отсутствует** — функции парсинга возвращают `T | null` вместо `NaN`; деление на ноль для целых → runtime panic, для float → поведение как в C (`Infinity`, `-Infinity` через IEEE 754, но не `NaN` как значение типа)

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
```

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
- `T | null` — единственный допустимый union; любой non-nullable union (`string | i32`, `A | B`) — **ошибка компилятора**
- Для полиморфизма — class-иерархия (`abstract class`) или discriminated union через enum

## Enum

### Числовой enum

```typescript
enum Direction { North, South, East, West }   // 0, 1, 2, 3
enum Color { Red = 1, Green = 2, Blue = 4 }   // явные значения (битовые флаги)
```

C-output:
```c
typedef enum { North, South, East, West } Direction;
static const Direction Direction_values[] = { North, South, East, West };
static const char*    Direction_names[]  = { "North", "South", "East", "West" };
```

### Строковый enum

```typescript
enum Status { Ok = "OK", Fail = "FAIL", Pending = "PENDING" }
```

C-output:
```c
typedef enum { Status_Ok, Status_Fail, Status_Pending } Status;
static const char* Status_strings[] = { "OK", "FAIL", "PENDING" };
```

### const enum

Только C enum, без runtime таблиц. Используется когда важен размер бинаря (embedded).

```typescript
const enum Pin { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 }
```

C-output:
```c
typedef enum { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 } Pin;
// больше ничего — нет таблиц
```

Утилиты на `const enum` недоступны — ошибка компилятора:
```typescript
Pin.values()         // error: const enum has no runtime table
Pin.fromValue(0)       // error: const enum has no runtime table
Pin.PA0.toString()   // error: const enum has no runtime table
```

### Утилиты enum (только обычный enum)

```typescript
enum Direction { North, South, East, West }

Direction.values()           // Direction[] — все значения: [North, South, East, West]
Direction.fromValue(2)         // Direction | null — Direction.East | null если не найдено
Direction.North.toString()   // string — "North"

// использование
for (const d of Direction.values()) {
    console.log(d.toString());
}

const d = Direction.fromValue(userInput);
if (d != null) {
    console.log(d.toString());
}
```

### enum в switch / match

```typescript
// switch — компилятор выдаёт warning если не все значения покрыты
switch (dir) {
    case Direction.North: ...; break;
    case Direction.South: ...; break;
    case Direction.East:  ...; break;
    case Direction.West:  ...; break;
}

// match — ошибка компилятора если не все значения покрыты (exhaustiveness)
const label = match (dir) {
    Direction.North => "вверх",
    Direction.South => "вниз",
    Direction.East  => "вправо",
    Direction.West  => "влево",
    // _ не нужен — все случаи покрыты
};
```

### enum vs const enum

| | `enum` | `const enum` |
|---|---|---|
| C-output | `typedef enum` + таблицы | только `typedef enum` |
| `.values()` | ✅ | ❌ |
| `.fromValue()` | ✅ | ❌ |
| `.toString()` | ✅ | ❌ |
| Размер бинаря | больше | минимальный |
| Применение | общий случай | embedded, флаги, константы |

## Интерфейсы

Два назначения:

**1. Данные без методов** — компилируется в `typedef struct`:
```typescript
interface Point {
    x: f64;
    y: f64;
}

let p: Point = { x: 10.5, y: 20.3 };
```
```c
typedef struct { double x; double y; } Point;
```

**2. Контракт с методами** — компилируется в vtable (fat pointer, как `dyn Trait` в Rust):
```typescript
interface Drawable {
    draw(): void;
    mut resize(factor: f64): void;
}

class Circle implements Drawable {
    draw(): void { ... }
    mut resize(factor: f64): void { ... }
}

let shape: Drawable = new Circle();  // fat pointer: self + vtable
shape = new Rect();                  // ok — другой тип, та же переменная
shape.draw();                        // ok — immutable метод
shape.resize(2.0);                   // ok — mut метод, shape это let

const shape2: Drawable = new Circle();
shape2.draw();                       // ok
shape2.resize(2.0);                  // ошибка: нельзя вызвать mut метод на const
```
```c
typedef struct {
    void (*draw)(void* self);
    void (*resize)(void* self, double factor);
} Drawable_vtable;

typedef struct {
    void* self;
    Drawable_vtable* vtable;
} Drawable;
```

## `instanceof`

Проверка конкретного типа за interface fat pointer — сравнение vtable-адресов:

```typescript
interface Drawable { draw(): void }
class Circle implements Drawable { r: f64; draw(): void { ... } }
class Rect   implements Drawable { w: f64; h: f64; draw(): void { ... } }

let shape: Drawable = new Circle();

if (shape instanceof Circle) {
    // компилятор сужает тип: shape — Circle здесь
    console.log(shape.r);   // ok
}
```

C-output:
```c
if (shape.vtable == &Circle_Drawable_vtable) {
    Circle* _shape = (Circle*)shape.self;
    printf("%f\n", _shape->r);
}
```

- `instanceof` работает **только** для interface-переменных (fat pointer)
- `instanceof` с классом напрямую (`let c: Circle; c instanceof Circle`) — ошибка компилятора, тип и так известен статически
- Компилятор выполняет type narrowing внутри `if (x instanceof T)` — тип переменной сужается до `T`
- Каждый класс, реализующий interface, имеет уникальный vtable — сравнение O(1), без RTTI overhead

- Класс может реализовывать несколько интерфейсов: `class Foo implements A, B`
- `mut` методы интерфейса подчиняются тем же правилам что и `mut` методы класса: `const` переменная запрещает вызов, `let` — разрешает
  ```typescript
  interface Drawable {
      draw(): void;
  }

  interface Resizable {
      mut resize(factor: f64): void;
  }

  class Circle implements Drawable, Resizable {
      draw(): void { ... }
      mut resize(factor: f64): void { ... }
  }

  let shape: Drawable = new Circle();    // ok
  let resizable: Resizable = new Circle(); // ok
  ```
- Если класс не реализует все методы интерфейса — ошибка компилятора

## Классы

**Наследования нет** — только композиция. `extends` запрещён, **кроме одного исключения**: `class MyError extends Error` — для ошибок. Полиморфизм — только через `interface` + `implements`.

```typescript
// вместо наследования — композиция
class Animal {
    name: string;
    mut speak(): string { ... }
}

class Dog {
    animal: Animal;  // композиция
    breed: string;
}
```

`mut` определяет семантику `this`. Модификаторы методов и полей:

| Модификатор | Описание |
|-------------|----------|
| `public` | виден везде (по умолчанию) |
| `private` | виден только внутри класса |
| `static` | метод на классе, нет `this` |
| `mut` | `this` — `Mut<Self>`, иначе `Ref<Self>` |
| `move` | `this` — `Self` (owned), объект перемещается в метод при вызове |

```typescript
class Counter {
    private value: i32 = 0;

    public get(): i32 {                  // this — Ref<Counter>
        return this.value;
    }

    public mut increment(): void {       // this — Mut<Counter>
        this.value++;
    }

    private mut reset(): void {          // private mutable
        this.value = 0;
    }

    static create(): Counter {           // static — нет this
        return new Counter();
    }

    private static default(): Counter {  // private static
        return new Counter();
    }
}

const c = new Counter();
c.get();        // ok
c.increment();  // ошибка: нельзя вызвать mut метод на const

let c2 = new Counter();
c2.increment(); // ok
```

- `static` + `mut` — недопустимо, ошибка компилятора (нет `this`)
- `protected` — отсутствует (нет наследования)

## Семантика `this` и доступ к полям

Тип `this` определяет тип `this.field`. Затем применяются **те же правила передачи аргументов** что и для обычных функций — см. матрицу совместимости в разделе "Правила передачи аргументов в функцию" ([spec/04-memory.md](spec/04-memory.md)):

| Вид метода | `this` тип | `this.field` тип (сложный) | `this.field` тип (примитив) |
|-----------|------------|---------------------------|---------------------------|
| обычный | `Ref<Self>` | `Ref<T>` | copy |
| `mut` | `Mut<Self>` | `Mut<T>` | copy |
| `move` | `Self` (owned) | `T` (owned) | copy |

Тип `this.field` определяется типом `this`. Затем применяются **те же правила из матрицы совместимости**:

```typescript
function sendEmail(to: string): void { ... }    // ожидает owned string
function printRef(s: Ref<string>): void { ... } // ожидает borrow

class QueryBuilder {
    query: string;
    params: i32[];

    // обычный метод — this: Ref<Self>, this.query: Ref<string>
    preview(): void {
        printRef(this.query);          // ok — Ref<string> → Ref<string> ✅
        sendEmail(this.query);         // ошибка — Ref<string> → string ❌
                                       // матрица: Ref<T> → T (owned) = запрещено
                                       // hint: clone если string implements Clone
        sendEmail(this.query.clone()); // ok ✅
        console.log(this.params[0]);   // ok — i32 всегда copy ✅
    }

    // mut метод — this: Mut<Self>, this.query: Mut<string>
    mut setQuery(q: string): void {
        this.query = q;                // ok — Mut разрешает запись ✅
        sendEmail(this.query);         // ошибка — Mut<string> → string ❌
                                       // матрица: Mut<T> → T (owned) = запрещено
        sendEmail(this.query.clone()); // ok ✅
    }

    // move метод — this: Self (owned), this.query: string (owned)
    move build(): Query {
        return new Query(this.query, this.params);  // ok — T → T, move ✅
    }
}

let b = new QueryBuilder("SELECT *", [1, 2]);
b.preview();           // ok — b жив ✅
b.setQuery("INSERT");  // ok — b жив ✅
const q = b.build();   // ok — b moved в метод
console.log(b);        // ошибка: b перемещён ❌

const b2 = new QueryBuilder("SELECT *", []);
b2.build();            // ошибка: нельзя вызвать move метод на const ❌
```

`readonly` поле можно записать только в конструкторе:

```typescript
class User {
    readonly id: i32;
    name: string;

    constructor(id: i32, name: string) {
        this.id = id;     // ok
        this.name = name;
    }

    mut rename(newName: string) {
        this.name = newName;  // ok
        this.id = 99;         // ошибка: readonly
    }
}
```

`mut` метод может менять обычные поля, но не `readonly`.

`move` метод передает поля объекта наружу без лишнего копирования, когда исходный объект больше не нужен. Паттерн `Builder`:

```typescript
class QueryBuilder {
    query: string;
    params: i32[];

    // без move — this: Ref<Self>, поля нельзя move, нужен clone:
    build(): Query {
        return new Query(this.query.clone(), this.params.clone()); // лишняя копия данных
    }

    // с move — this: Self (owned), поля можно move, clone не нужен
    move build(): Query {
        return new Query(this.query, this.params);  // move полей — экономия памяти
    }
}

let b = new QueryBuilder("SELECT *", [1, 2, 3]);
const q = b.build();   // b перемещён в метод, данные переданы в Query без копии
console.log(b);        // ошибка: b перемещён — компилятор ловит
```

Конструктор — поля забирают владение (move):

```typescript
class Line {
    start: Point;
    end: Point;

    constructor(start: Point, end: Point) {
        this.start = start;  // move
        this.end = end;      // move
    }
}

const p1 = new Point(0, 0);
const p2 = new Point(1, 1);
const line = new Line(p1, p2);
console.log(p1);  // ошибка: p1 перемещён в line
```

Автогенерация конструктора — если конструктор не написан, компилятор генерирует его из полей:

- Поля **с дефолтом** → параметр со значением по умолчанию
- Поля **без дефолта** → обязательный параметр (в порядке объявления)

```typescript
class User {
    name: string;       // нет дефолта → обязательный параметр
    age: i32 = 0;       // есть дефолт → необязательный параметр
    active: boolean = true;
}
// компилятор генерирует:
// constructor(name: string, age: i32 = 0, active: boolean = true)

new User("Alice");           // ok — name="Alice", age=0, active=true
new User("Alice", 30);       // ok — name="Alice", age=30, active=true
new User("Alice", 30, false); // ok
new User();                  // ошибка: name обязателен

class Point {
    x: f64 = 0.0;
    y: f64 = 0.0;
    // все поля с дефолтом → генерируется конструктор без обязательных параметров
}

let p = new Point();       // ok — x=0.0, y=0.0
let p2 = new Point(1.0);   // ok — x=1.0, y=0.0
```

Если написан явный `constructor` — автогенерация не происходит.

Дефолтные параметры конструктора — вместо перегрузки по количеству:
```typescript
class Point {
    x: f64;
    y: f64;

    constructor(x: f64 = 0.0, y: f64 = 0.0) {
        this.x = x;
        this.y = y;
    }
}

let p1 = new Point();          // x=0.0, y=0.0
let p2 = new Point(1.0);       // x=1.0, y=0.0
let p3 = new Point(1.0, 2.0);  // x=1.0, y=2.0
```

`private` конструктор — для singleton/factory паттернов:
```typescript
class Config {
    private constructor() { ... }

    static create(): Config {
        return new Config();  // ok — внутри класса
    }
}

let c = new Config();         // ошибка: конструктор private
let c = Config.create();      // ok
```
