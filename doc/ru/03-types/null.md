# Null — nullable типы (T | null)

[← Вверх](./index.md) | [Следующий →](./arrays.md) | [Предыдущий ←](./special-types.md)

---

`null` — единственное «отсутствующее значение» в TSClang. В отличие от JS/TS, **нет `undefined`** и **нет `NaN`** — функции парсинга возвращают `T | null`, деление на ноль для целых вызывает panic, для float — IEEE 754 поведение.

---

## Объявление nullable-типа

### Явный синтаксис: `T | null`

```typescript
let name: string | null = null;
let age: i32 | null = 42;
let result: User | null = findUser(id);
```

### Sugar: `?T`

`?T` — синтаксический сахар для `T | null`:

```typescript
function find(id: i32): ?User { ... }    // эквивалент User | null
let name: ?string = null;                 // эквивалент string | null
```

---

## C-представление

`T | null` компилируется в struct с bool-флагом `has_value`:

```c
typedef struct {
    bool    has_value;   // 1 байт
    // padding до выравнивания T
    int32_t value;       // 4 байта
} opt_i32;
```

Инициализация:

```typescript
let x: i32 | null = 42;  // значение
let y: i32 | null = null; // отсутствие
```

```c
opt_i32 x = {true, 42};
opt_i32 y = {false, 0};
```

### Таблица размеров с учётом padding

| Тип | C struct | Размер |
|-----|----------|--------|
| `u8 \| null` | `bool + u8` | 2 байта |
| `i16 \| null` | `bool + pad(1) + i16` | 4 байта |
| `i32 \| null` | `bool + pad(3) + i32` | 8 байт |
| `i64 \| null` | `bool + pad(7) + i64` | 16 байт |
| `f32 \| null` | `bool + pad(3) + f32` | 8 байт |
| `f64 \| null` | `bool + pad(7) + f64` | 16 байт |
| `string \| null` | `bool + pad(7) + String` | 32 байта |

На desktop overhead некритичен. На embedded (AVR: 2KB RAM) padding может быть значимым.

---

## Optional chaining `?.`

Безопасный доступ к полям и методам nullable-значения. Если левая часть `null` — результат тоже `null`:

```typescript
let user: User | null = findUser(id);
let name = user?.name;               // string | null
let len = user?.name.length;         // usize | null

// с методами
let upper = user?.getName().toUpperCase();  // string | null
```

### C-output

```c
opt_i32 x = {true, 7};
const int32_t y = x.has_value ? x.value : 99;
```

При `?.` на `null`:

```c
opt_i32 x = {false, 0};
opt_string y = x.has_value
    ? (opt_string){true, tsc_i32_to_string(x.value)}
    : (opt_string){false, STR_LIT("")};
```

---

## Nullish coalescing `??`

Оператор `??` возвращает левую часть если она не `null`, иначе правую:

```typescript
let x: i32 | null = null;
let y = x ?? 99;               // 99

let name: string | null = getNullable();
let display = name ?? "N/A";   // string — гарантированно не null
```

### C-output

```typescript
let x: i32 | null = 7;
let y = x ?? 99;   // x не null → y = 7
```

```c
opt_i32 x = {true, 7};
const int32_t y = x.has_value ? x.value : 99;
```

---

## Type narrowing после проверки на null

После проверки `x != null` компилятор сужает тип с `T | null` до `T`:

```typescript
let x: i32 | null = 5;

if (x != null) {
    // x: i32 — null исключён
    console.log(x + 1);   // ok — нет необходимости в ?.
}

// альтернатива — ранний возврат
if (x == null) return;
// x: i32 далее
```

### C-output

```c
opt_i32 x = {true, 5};
if (x.has_value) {
    printf("%d\n", x.value + 1);
}
```

---

## Паттерны для embedded

Когда overhead `T | null` (bool + padding) неприемлем на платформах с ограниченной памятью, используются два альтернативных паттерна.

### Паттерн 1: sentinel value

Выделить одно значение из диапазона типа как «отсутствующее». Подходит когда sentinel гарантированно не встречается в данных:

```typescript
const NO_READING: u16 = 0xFFFF;  // ADC: 10-bit значения 0..1023 — 0xFFFF никогда не валидно

function readADC(): u16 {
    if (!adcReady()) return NO_READING;
    return adcRead();  // 0..1023
}

const reading = readADC();
if (reading != NO_READING) {
    processReading(reading);  // 2 байта вместо 4
}
```

Типичные sentinel-значения:

| Тип | Sentinel | Когда использовать |
|-----|----------|-------------------|
| `u8` | `0xFF` | значения 0..254 |
| `u16` | `0xFFFF` | значения 0..65534 |
| `i16` | `-32768` (`INT16_MIN`) | температура, датчики |
| `u32` | `0xFFFFFFFF` | адреса, идентификаторы |

### Паттерн 2: отдельный флаг в struct

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

Порядок полей влияет на padding — компилятор **не переупорядочивает** поля автоматически (ABI-совместимость).

### Когда использовать какой паттерн

| Ситуация | Рекомендация |
|----------|-------------|
| Один optional примитив | sentinel value |
| Struct с несколькими optional полями | отдельный флаг в конце struct |
| Desktop / достаточно памяти | `T \| null` — безопаснее, читаемее |

---

## Отсутствие undefined и NaN

В отличие от JS/TS:

- **Нет `undefined`** — только `null` как «отсутствующее значение»
- **Нет `NaN`** — функции парсинга возвращают `T | null` вместо `NaN`

```typescript
// JS:  parseInt("abc") → NaN
// TSC: parseInt("abc") → null

const age = parseInt("abc");  // i32 | null → null
const safe = age ?? 0;        // 0
```

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `any is already nullable, "any \| null" is redundant` | `any` уже неявно nullable (`void*`) |
| `use of possibly null value` | Использование `T \| null` без проверки |
| `Object is possibly null` | Доступ к полю/методу без null-проверки |

---

## См. также

- [Специальные типы (void, never, any)](./special-types.md) — `any` как неявно nullable
- [Массивы](./arrays.md) — `pop()`, `find()` возвращают `T | null`
- [Map и Set](./map-set.md) — `get()` и `delete()` возвращают `T | null`
- [Модель памяти — Owner](../05-memory/owner.md) — ownership и nullable
