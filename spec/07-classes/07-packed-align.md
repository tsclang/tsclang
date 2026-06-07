## Выравнивание структур: `@packed` и `@align`

TSClang предоставляет гибкий, но безопасный контроль над размещением полей структур в памяти. Особенно важно для C-interop, SIMD и embedded-платформ.

### Трёхуровневая система

Выравнивание определяется в порядке приоритета (от высшего к низшему):

1. **`@packed`** — упаковать максимально плотно, без padding
2. **`@align(N)`** — выровнять структуру на N байт
3. Естественное выравнивание платформы (базовый уровень)

### `@packed`

Упаковывает структуру без padding. C-output: `__attribute__((packed))`.

```typescript
@packed
class Packet {
    type: u8;
    length: u16;
    checksum: u32;
}
```

C-output:
```c
typedef struct __attribute__((packed)) { uint8_t type; uint16_t length; uint32_t checksum; } Packet;
```

Использование: протоколы связи, binary file formats, C-interop со структурами без padding.

### `@align(N)`

Устанавливает выравнивание структуры на N байт. N должно быть степенью двойки. C-output: `__attribute__((aligned(N)))`.

```typescript
@align(16)
class SimdVector {
    x: f32;
    y: f32;
    z: f32;
    w: f32;
}
```

C-output:
```c
typedef struct __attribute__((aligned(16))) { float x; float y; float z; float w; } SimdVector;
```

Использование: SIMD-операции (SSE, NEON), DMA-буферы, аппаратные регистры с требованиями к выравниванию.

### Конфликт аннотаций

`@packed` и `@align(N)` на одной структуре — ошибка компилятора:

```typescript
@packed
@align(16)    // ❌ ошибка: @packed и @align несовместимы
class Bad { ... }
```

### Safety layer для `@packed` на embedded

TSClang генерирует C, а не машинный код. `__attribute__((packed))` указывает C-компилятору (avr-gcc, arm-gcc) самостоятельно генерировать корректный код для платформы — побайтовые load'ы там, где это необходимо.

Текущая реализация: `@packed` всегда генерирует `__attribute__((packed))` без unaligned access helpers.

Запланированное поведение зависит от `unaligned_access` в Platform Profile *[NOT YET IMPLEMENTED]*:

| `unaligned_access` | Что делает компилятор |
|-------------------|----------------------|
| `true` (desktop x86-64, Cortex-M4+) | Обращения к полям `@packed`-структуры остаются прямыми. C-компилятор знает о `__attribute__((packed))` и сгенерирует корректный код сам. |
| `false` (AVR, Cortex-M0) | Доступ к многобайтовым полям `@packed`-структуры через `tsc_read_unaligned_u16` / `tsc_read_unaligned_u32` helper'ы — побайтовая сборка без UB. |

```typescript
// @packed на платформе с unaligned_access: false (AVR, Cortex-M0)

@packed
class Packet {
    type: u8
    length: u16   // невыровненный u16!
    checksum: u32 // невыровненный u32!
}

// C-output на AVR (unaligned_access: false):
// uint16_t len = tsc_read_unaligned_u16(&p.length);
// uint32_t crc = tsc_read_unaligned_u32(&p.checksum);

// C-output на desktop (unaligned_access: true):
// uint16_t len = p.length;   // прямой доступ — CPU справится
// uint32_t crc = p.checksum;
```

`unaligned_access` задаётся в `declare platform {}` Platform Profile, а не в `tsc.package.json` — это свойство железа, не проекта:

```typescript
// @avr/platform/index.d.tsc
declare platform {
    bits: 8
    fpu: false
    heap: false
    unaligned_access: false   // AVR: невыровненный доступ вызывает undefined behaviour
}
```

### Диагностика padding *[NOT YET IMPLEMENTED]*

В режиме `debug` компилятор предупреждает о неэффективных структурах:

```typescript
class Inefficient {
    a: u8;   // 1 байт + 3 байта padding
    b: u32;  // 4 байта
    c: u8;   // 1 байт + 3 байта padding
    d: u32;  // 4 байта
}
// warning: struct 'Inefficient' has 6 bytes of avoidable padding; consider reordering fields
```

В режиме `embedded` с `allocator: "none"` — предупреждение становится ошибкой (каждый байт RAM критичен).

---

