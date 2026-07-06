## Null

- `null` — единственное "отсутствующее значение"
- `undefined` — синоним `null`. Компилируется в C `NULL`. В отличие от JS, `null` и `undefined` идентичны (нет разделения). Рекомендуется использовать `null`.
- `NaN` **отсутствует** — функции парсинга возвращают `T | null` вместо `NaN`; деление на ноль для целых → runtime panic, для float → поведение как в C (`Infinity`, `-Infinity` через IEEE 754, но не `NaN` как значение типа)

### C-представление `T | null`

> **Подробная спецификация nullable в контексте for-of и итераторов** — в [05-for-of-iteration.md](../05-control-flow/05-for-of-iteration.md).

`T | null` компилируется по-разному в зависимости от типа T:

```c
// Примитивы — inline value:
typedef struct {
    bool    has_value;   // 1 байт
    // padding до выравнивания T
    int32_t value;       // 4 байта
} opt_i32;

// Value class — inline struct (как Option<Struct> в Rust):
typedef struct {
    bool    has_value;
    Point   value;       // полный struct inline
} opt_Point;

// String — inline (ARC Copy, immutable):
typedef struct {
    bool    has_value;
    String  value;       // sizeof(String) = 32 байта на desktop
} opt_string;
```

**Четыре варианта nullable-представления:**

| Тип T | `T \| null` → C | Представление | Аналог в Rust | Размер (desktop) |
|-------|-----------------|---------------|---------------|------------------|
| Примитив (`i32`, `f64`, ...) | `opt_T = { bool; T value; }` | inline | `Option<T>` | 8–16 байт |
| String | `opt_string = { bool; String value; }` | inline (ARC Copy) | `Option<String>` | 40 байт |
| Value class (по умолчанию) | `opt_Foo = { bool; Foo value; }` | **inline struct** | `Option<Struct>` | sizeof(Foo) + padding |
| `@heap` class | `Foo *` | **bare pointer** (NULL = absent) | `Option<Box<T>>` | 8 байт |
| `@pool` class | `opt_ref_Foo = { bool; Foo* value; int _pool_idx; }` | pointer + pool idx | `Option<&T>` (с overhead) | 16 байт |
| `Ref<T>` | `T *` | **bare pointer** (NULL = absent) | `Option<&T>` | 8 байт |

**Правило:** `isPointer(T)` → bare pointer, без opt_-обёртки (pointer уже nullable через NULL). Иначе → `opt_T` struct с inline `T value`.

Value class — inline по умолчанию. Это **сознательное решение**: value semantics = копирование, как `Option<Struct>` в Rust. Для pointer-семантики используйте `Ref<T> | null` (zero overhead), `@heap` или `@pool`.

Размер с учётом выравнивания (примитивы):

| Тип | C struct | Размер |
|-----|----------|--------|
| `u8 \| null` | `bool + u8` | 2 байта |
| `i16 \| null` | `bool + pad(1) + i16` | 4 байта |
| `i32 \| null` | `bool + pad(3) + i32` | 8 байт |
| `i64 \| null` | `bool + pad(7) + i64` | 16 байт |
| `f32 \| null` | `bool + pad(3) + f32` | 8 байт |
| `f64 \| null` | `bool + pad(7) + f64` | 16 байт |
| `d8 \| null` | `bool + d8_t` | 2 байта |
| `d16 \| null` | `bool + pad(1) + d16_t` | 4 байта |
| `d32 \| null` | `bool + pad(3) + d32_t` | 8 байт |
| `d64 \| null` | `bool + pad(7) + d64_t` | 16 байт |

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
    tempValid:     boolean  // 1 байт
    pressureValid: boolean  // 1 байт
    humidityValid: boolean  // 1 байт
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

### Присваивание null

- `x = null` для **non-nullable** типа → compile error
- `x = null` для `opt_T` → `x = (opt_T){false, 0}`
- `x = null` для указателя (`Arc<T>`, `Weak<T>`) → допустимо (pointer = NULL)

```typescript
let x: i32 = 5;
x = null;            // compile error: cannot assign null to non-nullable type

let y: i32 | null = 5;
y = null;            // OK — opt_i32: y = (opt_i32){false, 0}

let s: string = "hi";
s = null;            // compile error: string is non-nullable

let w: Weak<Foo>;
w = null;            // OK — pointer type, w = NULL
```

Примитивы, строки и struct-типы не могут принимать `null`. Для nullable-переменных используйте `T | null` или `T?`.