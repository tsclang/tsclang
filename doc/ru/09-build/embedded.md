# Embedded-сборка

[← Вверх](./index.md) | [Следующий →](./cmake.md) | [Предыдущий ←](./packages.md)

---

TSClang компилирует `.tsc` в C99 — архитектурно-нейтральный код. CMake + реальный C-компилятор (avr-gcc, arm-none-eabi-gcc, cc65) делают остальное. Embedded-режим активируется указанием `target`, `mcu` или `profile` в `builds`.

## Принцип

```
TSClang:               семантика — heap? usize? stack limit?
                       → ошибки компилятора до сборки
                       → генерирует архитектурно-нейтральный C99 + CMakeLists.txt

CMake + toolchain:     реально компилируют под платформу
```

Компилятор не компилирует в машинный код — он генерирует C99 + `CMakeLists.txt`.

## Поддерживаемые платформы

### Desktop & General

| Платформа | Описание | Toolchain |
|-----------|----------|-----------|
| `desktop` | Универсальный x86-64 | gcc, clang |
| `linux` | Linux x86-64 | gcc |
| `macos` | macOS Intel/Apple Silicon | clang (Xcode) |
| `windows` | Windows x86-64 | msvc, mingw |
| `arm64` | ARM64 Desktop/Server | gcc, clang |

### Web & Runtime

| Платформа | Описание | Toolchain |
|-----------|----------|-----------|
| `wasm32` | WebAssembly | emscripten |
| `wasi` | WASI | wasi-sdk |

### Embedded & IoT

| Платформа | Описание | Выход | Toolchain | Флаги |
|-----------|----------|-------|-----------|-------|
| `avr` | 8-bit AVR (Arduino Uno) | .hex | avr-gcc | `-mmcu=atmega328p`, `-Os` |
| `arm` | ARM Cortex-M (STM32, nRF) | .bin | arm-none-eabi-gcc | `-mthumb`, `-mcpu=cortex-m4` |
| `esp32` | ESP32 (Xtensa/RISC-V) | .bin | xtensa-esp32-elf-gcc | `-mlongcalls` |
| `pico` | Raspberry Pi Pico (RP2040) | .uf2 | arm-none-eabi-gcc | `-mcpu=cortex-m0plus` |

### Retro & Legacy

| Платформа | Описание | Выход | Toolchain | Флаги |
|-----------|----------|-------|-----------|-------|
| `dos` | MS-DOS (djgpp) | .exe | djgpp (gcc) | `-march=i386` |
| `nes` | NES (6502) | .nes | cc65 | `-t nes -Cl` |
| `spectrum` | ZX Spectrum (Z80) | .tap | z88dk | `+zx -vn` |
| `genesis` | Sega Genesis (68000) | .bin | m68k-elf-gcc | `-m68000`, `-nostdlib` |
| `c64` | Commodore 64 (6510) | .prg | cc65 | `-t c64` |
| `gb` | Game Boy (LR35902) | .gb | rgbds | `-mgbz80` |
| `gba` | Game Boy Advance (ARM7TDMI) | .gba | arm-none-eabi-gcc | `-mthumb` |

## Конфигурация

### Built-in профиль

Для известных таргетов profile не нужен:

```json
{
  "builds": {
    "avr": {
      "target": "avr",
      "mcu": "atmega328p",
      "toolchain": "avr-gcc",
      "optimize": "Os",
      "emit": "hex"
    }
  }
}
```

### Community профиль

```json
{
  "dependencies": {
    "@nes/platform": "^1.0.0"
  },
  "builds": {
    "nes": {
      "arch": "6502",
      "toolchain": "cc65",
      "profile": "@nes/platform"
    }
  }
}
```

### Локальный профиль

```json
{
  "builds": {
    "custom": {
      "arch": "z80",
      "toolchain": "z88dk",
      "profile": "./profiles/my-platform.d.tsc"
    }
  }
}
```

## Параметры платформы

### Внутренняя таблица компилятора

| MCU | RAM | usize | heap | fpu | async_stack |
|-----|-----|-------|------|-----|-------------|
| ATmega328p | 2 KB | `u16` | нет | нет | 256 B |
| ATmega2560 | 8 KB | `u16` | нет | нет | 512 B |
| Cortex-M0 | 8-32 KB | `u32` | опционально | нет | 1024 B |
| Cortex-M4 | 64-256 KB | `u32` | опционально | да | 4096 B |
| x86-64 | GBs | `u64` | да | да | unlimited |

### declare platform — поля

| Поле | Тип | Описание |
|------|-----|----------|
| `toolchain` | string | Имя компилятора |
| `toolchainFile` | string | Путь к CMake toolchain file |
| `include` | string | Путь к C-реализациям stdlib |
| `heap` | bool | Доступен ли malloc/free |
| `allocator` | string | `"heap"`, `"static"`, `"pool"`, `"none"` |
| `scheduler` | string | `"libuv"`, `"cooperative"`, `"none"` |
| `fpu` | bool | Есть ли FPU |
| `bits` | u8 | Разрядность CPU (8, 16, 32, 64) |
| `address_bits` | u8 | Ширина адреса |
| `stack_size` | u32 | Размер стека в байтах |
| `ram_size` | u32 | Общий размер RAM |
| `flash_size` | u32 | Размер Flash/ROM |
| `no_recursion` | bool | Запретить рекурсию |
| `unaligned_access` | bool | Поддержка невыровненного доступа |

### Стратегии аллокации

| Значение | `new X()` без capacity | `new X(N)` с compile-time N |
|----------|------------------------|------------------------------|
| `"heap"` | ОК | ОК |
| `"static"` | Ошибка | ОК → BSS |
| `"pool"` | ОК (через `tsc_alloc`) | ОК |
| `"none"` | Ошибка | Ошибка |

### Планировщики async

| Значение | Где | Поведение |
|----------|-----|-----------|
| `"libuv"` | desktop | event loop через libuv / io_uring |
| `"cooperative"` | embedded | round-robin poll loop без heap |
| `"none"` | bare-metal | state machine, `resume()` вызывается вручную |

## Классы без heap

### @embedded.inline — value-тип

Объект живёт на стеке как C struct, без указателя и vtable:

```typescript
@embedded.inline
class Point { x: i16; y: i16 }

let p = Point(10, 20)   // value, как struct
p.x = 15
```

```c
typedef struct { int16_t x, y; } Point;
Point p = {10, 20};
p.x = 15;
```

### @embedded.pool(N) — статический пул

`new` берёт слот из пула на N экземпляров:

```typescript
@embedded.pool(16)
class Sprite {
    x: i16; y: i16; bitmap: u8[8]
    constructor(x: i16, y: i16) { ... }
}

{
    const s = new Sprite(10, 20)
    s.move(5, 0)
}  // ← слот возвращён автоматически

const s = new Sprite(10, 20)
if (s.isOutOfBounds()) {
    drop(s)  // явный возврат слота
}
```

```c
static Sprite _sprites_pool[16];
static uint8_t _sprites_used[16] = {0};

Sprite* Sprite_new(int16_t x, int16_t y) {
    for (int i = 0; i < 16; i++) {
        if (!_sprites_used[i]) {
            _sprites_used[i] = 1;
            _sprites_pool[i].x = x;
            _sprites_pool[i].y = y;
            return &_sprites_pool[i];
        }
    }
    return NULL;
}

void Sprite_pool_release(Sprite* s) {
    _sprites_used[s - _sprites_pool] = 0;
}
```

| Декоратор | Где живёт объект | `new` |
|-----------|-----------------|-------|
| `@embedded.inline` | стек (value-тип) | не используется |
| `@embedded.pool(N)` | BSS (статический пул) | берёт слот из пула |
| *(нет декоратора)* | heap | требует `allocator: "heap"` |

## Async без heap

State machine — C struct на стеке или в BSS:

```typescript
@static async function blink(): Promise<void> {
    while (true) {
        GPIO.write(Pin.LED, true)
        await sleep(500)
        GPIO.write(Pin.LED, false)
        await sleep(500)
    }
}
```

```c
typedef struct { uint8_t _state; uint32_t _timer; } _BlinkState;
static _BlinkState _blink_instance;

void tsc_scheduler_tick(void) {
    _blink_tick(&_blink_instance);
}

int main(void) {
    blink_start(&_blink_instance);
    while (1) { tsc_scheduler_tick(); }
}
```

## Map/Set на embedded

`allocator: "static"` — capacity обязателен:

```typescript
@static const hotkeys = new Map<u8, Action>(32)
@static const visited = new Set<u16>(256)
```

```c
typedef struct { uint8_t key; bool occupied; Action value; } _hotkeys_Entry;
static _hotkeys_Entry _hotkeys_data[32];
static Map_u8_Action hotkeys = { _hotkeys_data, 32, 0 };
```

## Пример: Arduino Uno (2 KB RAM)

```typescript
// declare platform { allocator: "static", scheduler: "cooperative",
//                   ram_size: 2048, stack_size: 512, no_recursion: true }

@static const scheduler = new Array<Process>(8)

@static async function ledBlink(): Promise<void> {
    while (true) {
        GPIO.write(13, true)
        await sleep(500)
        GPIO.write(13, false)
        await sleep(500)
    }
}

@static async function serialMonitor(): Promise<void> {
    while (true) {
        if (uart.available()) {
            const b = uart.readByte()
            uart.writeByte(b)
        }
        await sleep(1)
    }
}
```

## C-output

Пример AVR-сборки:

```c
/* build/avr/c/main.c — ATmega328p */

#include <avr/io.h>
#include <util/delay.h>

typedef struct { uint8_t _state; uint32_t _timer; } _BlinkState;
static _BlinkState _blink_instance;

static void _blink_tick(_BlinkState* s) {
    switch (s->_state) {
    case 0:
        PORTB |= (1 << 5);
        s->_timer = 500;
        s->_state = 1;
        break;
    case 1:
        if (s->_timer > 0) { s->_timer--; return; }
        PORTB &= ~(1 << 5);
        s->_timer = 500;
        s->_state = 0;
        break;
    }
}

int main(void) {
    DDRB |= (1 << 5);
    while (1) { _blink_tick(&_blink_instance); }
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `unknown target arch '6502': specify a platform profile` | Неизвестная архитектура без профиля |
| `Map without compile-time capacity; platform: allocator: "static"` | `new Map()` без размера на static-платформе |
| `malloc not declared in platform profile` | Импорт недоступной libc-функции |
| `recursion not allowed on this platform (stack_size: 256)` | `no_recursion: true` |
| `async stack exceeds limit (512 > 256)` | Превышен `async_stack` |
| `Shared<T> requires heap (allocator: "static")` | ARC требует malloc |
| `toolchain 'avr-gcc' not found in PATH` | Компилятор не установлен |

## См. также

- [Типы проектов](./projects.md) — Platform profile
- [Конфигурация](./config.md) — builds, binaryMode, defaultNumber
- [CMake](./cmake.md) — CMakeLists.txt, toolchain files
- [Конкурентность](../07-concurrency/index.md) — cooperative scheduler, async на embedded
- [Классы: декораторы](../04-classes/decorators.md) — `@embedded.inline`, `@embedded.pool`
