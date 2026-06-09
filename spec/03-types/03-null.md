## Null

- `null` — единственное "отсутствующее значение"
- `undefined` — синоним `null`. Компилируется в C `NULL`. В отличие от JS, `null` и `undefined` идентичны (нет разделения). Рекомендуется использовать `null`.
- `NaN` **отсутствует** — функции парсинга возвращают `T | null` вместо `NaN`; деление на ноль для целых → runtime panic, для float → поведение как в C (`Infinity`, `-Infinity` через IEEE 754, но не `NaN` как значение типа)

### C-представление `T | null`

> **Подробная спецификация nullable в контексте for-of и итераторов** — в [05-for-of-iteration.md](../05-control-flow/05-for-of-iteration.md).

`T | null` компилируется в struct с bool-флагом:

```c
// Примитивы — inline value:
typedef struct {
    bool    has_value;   // 1 байт
    // padding до выравнивания T
    int32_t value;       // 4 байта
} opt_i32;

// Complex types (class, nested array) — pointer:
typedef struct {
    bool    has_value;   // 1 байт
    // padding до выравнивания указателя
    User   *value;       // 8 байт (desktop) / 2 байта (AVR)
} opt_User;
```

**Правило (тернарное):** `isPrimitive(T)` → `T value`; `isString(T)` → `String value`; иначе (class/nested array) → `T *value`. Причина: String — ARC Copy (immutable), inline struct без overhead; complex types в TSClang — уже value types (struct), `opt_T` с inline struct = двойная вложенность + лишний padding, pointer — компактнее и семантически точнее (borrow/null). См. [05-for-of-iteration.md](../05-control-flow/05-for-of-iteration.md) §5.4.

Размер с учётом выравнивания (примитивы):

| Тип | C struct | Размер |
|-----|----------|--------|
| `u8 \| null` | `bool + u8` | 2 байта |
| `i16 \| null` | `bool + pad(1) + i16` | 4 байта |
| `i32 \| null` | `bool + pad(3) + i32` | 8 байт |
| `i64 \| null` | `bool + pad(7) + i64` | 16 байт |
| `f32 \| null` | `bool + pad(3) + f32` | 8 байт |
| `f64 \| null` | `bool + pad(7) + f64` | 16 байт |

Complex types:

| Тип | C struct | Размер (desktop) |
|-----|----------|------------------|
| `string \| null` | `bool + pad(7) + String (32 байта)` | 40 байт |
| `User \| null` | `bool + pad(7) + User*` | 16 байт |
| `i32[] \| null` | `bool + pad(7) + Array_i32*` | 16 байт |

String — ARC Copy, `String value` inline (не pointer). `sizeof(String)` = 32 байта на desktop (`char*` + `size_t` length + `size_t` capacity + `uint32_t* _refcount`).

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
- `x = null` для указателя (`Shared<T>`, `Weak<T>`) → допустимо (pointer = NULL)

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