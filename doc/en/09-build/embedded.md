# Embedded Build

[← Up](./index.md) | [Next →](./cmake.md) | [Previous ←](./packages.md)

---

TSClang compiles `.tsc` to C99 — architecturally neutral code. CMake + a real C compiler (avr-gcc, arm-none-eabi-gcc, cc65) does the rest. Embedded mode is activated by specifying `target`, `mcu`, or `profile` in `builds`.

## Principle

```
TSClang:               semantics — heap? usize? stack limit?
                       → compiler errors before build
                       → generates architecturally neutral C99 + CMakeLists.txt

CMake + toolchain:     actually compiles for the platform
```

The compiler does not compile to machine code — it generates C99 + `CMakeLists.txt`.

## Supported platforms

### Desktop & General

| Platform | Description | Toolchain |
|----------|-------------|-----------|
| `desktop` | Universal x86-64 | gcc, clang |
| `linux` | Linux x86-64 | gcc |
| `macos` | macOS Intel/Apple Silicon | clang (Xcode) |
| `windows` | Windows x86-64 | msvc, mingw |
| `arm64` | ARM64 Desktop/Server | gcc, clang |

### Web & Runtime

| Platform | Description | Toolchain |
|----------|-------------|-----------|
| `wasm32` | WebAssembly | emscripten |
| `wasi` | WASI | wasi-sdk |

### Embedded & IoT

| Platform | Description | Output | Toolchain | Flags |
|----------|-------------|--------|-----------|-------|
| `avr` | 8-bit AVR (Arduino Uno) | .hex | avr-gcc | `-mmcu=atmega328p`, `-Os` |
| `arm` | ARM Cortex-M (STM32, nRF) | .bin | arm-none-eabi-gcc | `-mthumb`, `-mcpu=cortex-m4` |
| `esp32` | ESP32 (Xtensa/RISC-V) | .bin | xtensa-esp32-elf-gcc | `-mlongcalls` |
| `pico` | Raspberry Pi Pico (RP2040) | .uf2 | arm-none-eabi-gcc | `-mcpu=cortex-m0plus` |

### Retro & Legacy

| Platform | Description | Output | Toolchain | Flags |
|----------|-------------|--------|-----------|-------|
| `dos` | MS-DOS (djgpp) | .exe | djgpp (gcc) | `-march=i386` |
| `nes` | NES (6502) | .nes | cc65 | `-t nes -Cl` |
| `spectrum` | ZX Spectrum (Z80) | .tap | z88dk | `+zx -vn` |
| `genesis` | Sega Genesis (68000) | .bin | m68k-elf-gcc | `-m68000`, `-nostdlib` |
| `c64` | Commodore 64 (6510) | .prg | cc65 | `-t c64` |
| `gb` | Game Boy (LR35902) | .gb | rgbds | `-mgbz80` |
| `gba` | Game Boy Advance (ARM7TDMI) | .gba | arm-none-eabi-gcc | `-mthumb` |

## Configuration

### Built-in profile

For known targets, profile is not needed:

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

### Community profile

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

### Local profile

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

## Platform parameters

### Internal compiler table

| MCU | RAM | usize | heap | fpu | async_stack |
|-----|-----|-------|------|-----|-------------|
| ATmega328p | 2 KB | `u16` | no | no | 256 B |
| ATmega2560 | 8 KB | `u16` | no | no | 512 B |
| Cortex-M0 | 8-32 KB | `u32` | optional | no | 1024 B |
| Cortex-M4 | 64-256 KB | `u32` | optional | yes | 4096 B |
| x86-64 | GBs | `u64` | yes | yes | unlimited |

### declare platform — fields

| Field | Type | Description |
|-------|------|-------------|
| `toolchain` | string | Compiler name |
| `toolchainFile` | string | Path to CMake toolchain file |
| `include` | string | Path to C stdlib implementations |
| `heap` | bool | Is malloc/free available |
| `allocator` | string | `"heap"`, `"static"`, `"pool"`, `"none"` |
| `scheduler` | string | `"libuv"`, `"cooperative"`, `"none"` |
| `fpu` | bool | Has FPU |
| `bits` | u8 | CPU bit width (8, 16, 32, 64) |
| `address_bits` | u8 | Address width |
| `stack_size` | u32 | Stack size in bytes |
| `ram_size` | u32 | Total RAM size |
| `flash_size` | u32 | Flash/ROM size |
| `no_recursion` | bool | Forbid recursion |
| `unaligned_access` | bool | Unaligned access support |

### Allocation strategies

| Value | `new X()` without capacity | `new X(N)` with compile-time N |
|-------|---------------------------|--------------------------------|
| `"heap"` | OK | OK |
| `"static"` | Error | OK → BSS |
| `"pool"` | OK (via `tsc_alloc`) | OK |
| `"none"` | Error | Error |

### Async schedulers

| Value | Where | Behavior |
|-------|-------|----------|
| `"libuv"` | desktop | event loop via libuv / io_uring |
| `"cooperative"` | embedded | round-robin poll loop without heap |
| `"none"` | bare-metal | state machine, `resume()` is called manually |

## Classes without heap

### @embedded.inline — value type

Object lives on the stack as a C struct, without pointer and vtable:

```typescript
@embedded.inline
class Point { x: i16; y: i16 }

let p = Point(10, 20)   // value, like struct
p.x = 15
```

```c
typedef struct { int16_t x, y; } Point;
Point p = {10, 20};
p.x = 15;
```

### @embedded.pool(N) — static pool

`new` takes a slot from a pool of N instances:

```typescript
@embedded.pool(16)
class Sprite {
    x: i16; y: i16; bitmap: u8[8]
    constructor(x: i16, y: i16) { ... }
}

{
    const s = new Sprite(10, 20)
    s.move(5, 0)
}  // ← slot returned automatically

const s = new Sprite(10, 20)
if (s.isOutOfBounds()) {
    drop(s)  // explicit slot return
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

| Decorator | Where object lives | `new` |
|-----------|-------------------|-------|
| `@embedded.inline` | stack (value type) | not used |
| `@embedded.pool(N)` | BSS (static pool) | takes slot from pool |
| *(no decorator)* | heap | requires `allocator: "heap"` |

## Async without heap

State machine — C struct on stack or in BSS:

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

## Map/Set on embedded

`allocator: "static"` — capacity is required:

```typescript
@static const hotkeys = new Map<u8, Action>(32)
@static const visited = new Set<u16>(256)
```

```c
typedef struct { uint8_t key; bool occupied; Action value; } _hotkeys_Entry;
static _hotkeys_Entry _hotkeys_data[32];
static Map_u8_Action hotkeys = { _hotkeys_data, 32, 0 };
```

## Example: Arduino Uno (2 KB RAM)

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

AVR build example:

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

## Errors

| Error | Cause |
|-------|-------|
| `unknown target arch '6502': specify a platform profile` | Unknown architecture without profile |
| `Map without compile-time capacity; platform: allocator: "static"` | `new Map()` without size on static platform |
| `malloc not declared in platform profile` | Import of unavailable libc function |
| `recursion not allowed on this platform (stack_size: 256)` | `no_recursion: true` |
| `async stack exceeds limit (512 > 256)` | Exceeded `async_stack` |
| `Shared<T> requires heap (allocator: "static")` | ARC requires malloc |
| `toolchain 'avr-gcc' not found in PATH` | Compiler not installed |

## See also

- [Project types](./projects.md) — Platform profile
- [Configuration](./config.md) — builds, binaryMode, defaultNumber
- [CMake](./cmake.md) — CMakeLists.txt, toolchain files
- [Concurrency](../07-concurrency/index.md) — cooperative scheduler, async on embedded
- [Classes: decorators](../04-classes/decorators.md) — `@embedded.inline`, `@embedded.pool`
