# std/hal and embedded modules

[← Up](./index.md) | [Previous ←](./regex.md)

---

Hardware Abstraction Layer, embedded utilities, and additional modules: `std/random`, `std/temporal`, `std/reactive`, `std/url`, `std/blob`, `std/formdata`.

---

## std/hal

Platform-independent interfaces for hardware access: GPIO, UART, SPI, I2C. Available on all platforms — on embedded via platform profile, on desktop — mock for testing.

### Import

```typescript
import { GPIO, UART, SPI, I2C, PinMode } from "std/hal"
```

### Interfaces

```typescript
export enum PinMode { Input, Output, InputPullup }

export interface GPIO {
    pinMode(pin: u8, mode: PinMode): void
    digitalWrite(pin: u8, value: bool): void
    digitalRead(pin: u8): bool
}

export interface UART {
    begin(baud: u32): void
    write(data: Ref<u8[]>): void
    read(): u8
    available(): bool
}

export interface SPI {
    begin(): void
    transfer(data: u8): u8
}

export interface I2C {
    begin(): void
    write(addr: u8, data: Ref<u8[]>): bool
    read(addr: u8, buf: Mut<u8[]>, len: u8): bool
}
```

### C-functions

| TSClang | C-function | Status |
|---------|-----------|--------|
| `GPIO.mode(pin, mode)` | `tsc_gpio_mode(pin, mode)` | ✓ |
| `GPIO.write(pin, val)` | `tsc_gpio_write(pin, val)` | ✓ |
| `GPIO.read(pin)` | `tsc_gpio_read(pin)` | ✓ |
| `I2C.begin()` | `tsc_i2c_begin()` | ✓ |
| `I2C.write(addr, data)` | `tsc_i2c_write(addr, data)` | ✓ |
| `I2C.read(addr, n)` | `tsc_i2c_read(addr, n)` | ✓ |
| `SPI.begin()` | `tsc_spi_begin()` | ✓ |
| `SPI.transfer(byte)` | `tsc_spi_transfer(byte)` | ✓ |
| `UART.init(opts)` | `tsc_uart_init(baud)` | ✓ |
| `UART.write(byte)` | `tsc_uart_write(byte)` | ✓ |
| `UART.read()` | `tsc_uart_read()` | ✓ |
| `UART.available()` | `tsc_uart_available()` | ✓ |

### Example: portable library

```typescript
import { GPIO, PinMode } from "std/hal"

export class Lcd {
    constructor(
        private gpio: GPIO,
        private rs: u8,
        private en: u8,
        private d4: u8,
        private d5: u8,
        private d6: u8,
        private d7: u8
    ) {}

    init(): void {
        this.gpio.pinMode(this.rs, PinMode.Output)
        this.gpio.pinMode(this.en, PinMode.Output)
        // ...
    }

    print(text: string): void {
        for (const c of text) {
            this.writeChar(c)
        }
    }
}
```

Library is ported to AVR/ARM/desktop by changing platform profile.

---

## std/embedded

Tools for embedded: low-level memory access, data structures without heap, cooperative scheduler. Embedded only.

```typescript
import { Volatile, pointer, HashMap, Tasks } from "std/embedded"
```

### Volatile\<T\>

Guarantees that every read/write reaches memory (not cached). Translates to `volatile T*`.

```typescript
type UartRegs = {
    dr:        Volatile<u32>
    sr:        Volatile<u32>
    _reserved: u32[4]
    fr:        Volatile<u32>
}

const UART0 = pointer<UartRegs>(0x101f1000)

UART0.dr.write(0x41)              // *(volatile uint32_t*)0x101f1000 = 0x41
const status = UART0.fr.read()    // *(volatile uint32_t*)0x101f1018
```

> `Volatile<T>` ≠ `Atomic<T>`: atomics use synchronization instructions that peripherals do not understand. For MMIO — only `Volatile<T>`.

### pointer\<T\>

Type mapping to a physical address:

```typescript
const UART0 = pointer<UartRegs>(0x101f1000)
```

### HashMap\<K, V, N\>

Fixed-size hash table for `allocator: "none"`. All memory in BSS, no heap at all.

```typescript
const map = new HashMap<string, i32, 32>()
map.set("health", 100)
map.set("ammo", 50)

const hp = map.get("health")   // i32 | null
```

C-output:

```c
typedef struct {
    const char* keys[32];
    int32_t     values[32];
    uint8_t     used[32];
} HashMap_string_i32_32;
```

### Tasks\<N\>

Cooperative round-robin scheduler. Fixed pool of slots in BSS.

```typescript
@static const tasks = new Tasks<8>()

@static async function blinkTask(): Promise<void> {
    while (true) {
        GPIO.write(Pin.LED, true)
        await sleep(500)
        GPIO.write(Pin.LED, false)
        await sleep(500)
    }
}

@static async function inputTask(): Promise<void> {
    while (true) {
        if (keyboard.available()) handleKey(keyboard.read())
        await sleep(10)
    }
}

async function main(): Promise<void> {
    tasks.add(blinkTask)
    tasks.add(inputTask)
    tasks.run()       // blocking loop
}
```

API: `tasks.add(fn)`, `tasks.remove(fn)`, `tasks.run()`, `tasks.stop()`.

### StaticMap

Compile-time perfect hash. Keys must be compile-time constants.

```typescript
const opcodes = new StaticMap({
    "LDA": 0xA9,
    "STA": 0x8D,
    "JMP": 0x4C,
    "NOP": 0xEA,
})

const opcode = opcodes.get("LDA")   // 0xA9
```

Generates `switch` — O(1), no struct overhead.

---

## std/random

Typed random number generation API. `Math.random()` remains as JS-compatible legacy.

```typescript
import { Random, SecureRandom, HardwareRandom } from "std/random"
```

### Random (all platforms)

```typescript
const rng = new Random(42)          // fixed seed — reproducible
const rng = new Random()            // auto-seed (desktop only, embedded — error)

rng.next<i32>()           // random i32 (full range)
rng.next<i16>(0, 100)     // i16 in [0, 100)
rng.next<u8>(0, 255)      // u8 in [0, 255)
rng.next<f64>()           // f64 in [0.0, 1.0)
rng.next<f32>(0.0, 5.0)   // f32 in [0.0, 5.0)
rng.next<boolean>()       // boolean
rng.next<u8[]>(16)        // u8[] of length 16
rng.next<i32[]>(10)       // i32[] of length 10

rng.shuffle(arr)          // shuffle array in place
rng.pick<T>(arr)          // T | null — random element
```

### SecureRandom (desktop/server)

```typescript
const secure = new SecureRandom()
const key = secure.next<u8[]>(32)   // 32 random bytes from OS
```

### HardwareRandom (embedded)

```typescript
const hw = new HardwareRandom()     // ADC noise, hardware RNG
const seed = hw.next<u32>()         // seed from hardware
const rng = new Random(seed)        // use as seed
```

---

## std/temporal

Full replacement for legacy `Date`. Based on TC39 Temporal proposal. All objects are **immutable**. Months are **1-based** (January = 1).

```typescript
import { PlainDate, PlainTime, PlainDateTime, Instant, ZonedDateTime, Duration, Now } from "std/temporal"
```

### PlainDate

```typescript
const d = PlainDate.from("2024-03-20")
const d = new PlainDate(2024, 3, 20)    // year, month (1-12), day

d.year       // 2024
d.month      // 3 (March, 1-based!)
d.day        // 20
d.dayOfWeek  // 1=Mon, 7=Sun

d.add({ days: 10 })        // PlainDate
d.subtract({ months: 1 })   // PlainDate
d.until(other)              // Duration
d.toString()                // "2024-03-20"
```

### PlainTime

```typescript
const t = PlainTime.from("14:30:00")
const t = new PlainTime(14, 30, 0)

t.hour       // i32
t.minute     // i32
t.second     // i32

t.add({ hours: 2 })   // PlainTime
t.toString()          // "14:30:00"
```

### PlainDateTime

```typescript
const dt = PlainDateTime.from("2024-03-20T14:30:00")
const dt = new PlainDateTime(2024, 3, 20, 14, 30, 0)

dt.date    // PlainDate
dt.time    // PlainTime
dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second

dt.add({ days: 1, hours: 2 })  // PlainDateTime
dt.toString()                   // "2024-03-20T14:30:00"
```

### Instant

```typescript
const i = Now.instant()

i.epochSeconds       // i64
i.epochMilliseconds  // i64
i.epochNanoseconds   // i64

i.add({ hours: 1 })  // Instant
i.toString()         // "2024-03-20T14:30:00Z"
```

### Duration

```typescript
const dur = Duration.from({ years: 1, months: 2, days: 3, hours: 4 })

dur.years, dur.months, dur.days, dur.hours, dur.minutes, dur.seconds  // i32
dur.total("hours")    // f64 — everything in hours
dur.toString()        // "P1Y2M3DT4H"
```

### ZonedDateTime (desktop/server only)

```typescript
const zdt = Now.zonedDateTime("Europe/Moscow")

zdt.timeZone           // "Europe/Moscow"
zdt.offset             // "+03:00"
zdt.toPlainDateTime()  // PlainDateTime
zdt.toInstant()        // Instant
```

On embedded — compiler error (no tzdata).

### Now

```typescript
Now.instant()                      // Instant — current UTC moment
Now.plainDate()                    // PlainDate — today
Now.plainTime()                    // PlainTime — current time
Now.plainDateTime()                // PlainDateTime
Now.zonedDateTime("Europe/Moscow") // ZonedDateTime (desktop/server only)
```

---

## std/reactive

Reactivity with explicit dependencies (React-style). Desktop only — on embedded compiler error.

```typescript
import { signal, computed, effect } from "std/reactive"
```

### Signal\<T\>

```typescript
class CounterStore {
    count:   Signal<i32>    = signal(0)
    name:    Signal<string>  = signal("Alice")
    doubled: Signal<i32>    = computed([this.count], () => this.count.get() * 2)

    mut increment(): void { this.count.set(this.count.get() + 1) }
}
```

### effect

```typescript
let store = new CounterStore()

effect([store.count, store.name], () => {
    console.log(`${store.name.get()}: ${store.count.get()} (x2 = ${store.doubled.get()})`)
})
// → immediately: "Alice: 0 (x2 = 0)"

store.increment()  // → "Alice: 1 (x2 = 2)"
```

### computed

```typescript
let doubled = computed([store.count], () => store.count.get() * 2)
// doubled — Signal<i32>
```

### async inside effect — forbidden

`effect` callback is synchronous. `await` inside — compiler error. Use `signal.subscribe` for async logic:

```typescript
// ok: async not inside effect
async function loadData(url: string): Promise<void> {
    const data = await fetch(url)
    store.data.set(await data.json<ResponseData>())
}

effect([store.url], () => {
    loadData(store.url.get())   // launch async, don't wait
})
```

---

## std/url

URL parsing and construction. Works on all platforms.

```typescript
import { URL, URLSearchParams } from "std/url"
```

```typescript
const u = new URL("https://example.com/path?foo=bar#hash")
u.href        // "https://example.com/path?foo=bar#hash"
u.protocol    // "https:"
u.host        // "example.com"
u.pathname    // "/path"
u.search      // "?foo=bar"
u.hash        // "#hash"
u.origin      // "https://example.com"

u.searchParams.get("foo")     // "bar"
u.searchParams.set("baz", "1")
u.searchParams.delete("foo")
u.searchParams.has("baz")     // true
u.searchParams.toString()     // "baz=1"

// New URL based on base
const abs = new URL("/other", "https://example.com")  // https://example.com/other
```

`URLSearchParams` can be used separately:

```typescript
const params = new URLSearchParams("a=1&b=2")
params.get("a")         // "1"
params.append("c", "3")
params.toString()       // "a=1&b=2&c=3"
```

> `URLSearchParams` with mutation uses `Map` — on `allocator: "none"` error, on `"static"` requires capacity.

---

## std/blob

Types for binary data with MIME type. Desktop/server only.

```typescript
import { Blob, File } from "std/blob"
```

```typescript
const b = new Blob([buf], { type: "image/png" })
b.data            // Buffer
b.type            // string — "image/png"
b.size            // i32 — size in bytes
b.arrayBuffer()   // Buffer — zero-copy
b.text()          // string — UTF-8 decoding (synchronous, unlike JS)
b.slice(0, 100)   // Blob — zero-copy view

const f = new File([buf], "photo.png", { type: "image/png" })
f.name      // "photo.png"
f.data      // Buffer
f.type      // "image/png"
```

C-layout:

```c
typedef struct { Buffer data; String type; } Blob;
typedef struct { Blob base; String name; } File;
```

---

## std/formdata

Construction and parsing of `multipart/form-data`. Desktop/server only.

```typescript
import { FormData } from "std/formdata"
```

```typescript
const fd = new FormData()

fd.append("name", "Alice")            // string field
fd.append("data", buf)                // Buffer
fd.append("file", blob)               // Blob
fd.append("upload", file)             // File with name

fd.set("name", "Bob")                 // overwrite

fd.get("name")      // string | Blob | null
fd.getAll("name")   // (string | Blob)[]
fd.has("name")      // boolean
fd.delete("name")   // void

for (const [name, value] of fd) { }   // iteration
```

---

## std/avr

AVR-specific API — only `#[target(avr)]`. Complements `std/hal` with direct peripheral access.

```typescript
import {
    pinMode, digitalWrite, digitalRead, PinMode,
    delay, delayMicroseconds,
    serialBegin, serialWrite, serialRead, serialAvailable,
    analogRead, analogWrite,
    interruptEnable, interruptDisable
} from "std/avr"
```

### Example: LED blink

```typescript
import { pinMode, digitalWrite, PinMode, delay } from "std/avr"

pinMode(13, PinMode.Output)

while (true) {
    digitalWrite(13, true)
    delay(500)
    digitalWrite(13, false)
    delay(500)
}
```

---

## Errors

| Error | Cause |
|-------|-------|
| `std/hal is not available on target "desktop"` | `std/avr` is AVR only |
| `std/embedded is not available on target "desktop"` | Embedded only |
| `HardwareRandom is not available on target "desktop"` | Embedded only |
| `ZonedDateTime requires tzdata` | No tzdata on embedded |
| `await inside effect callback` | `effect` is synchronous |
| `URLSearchParams requires allocator` | `allocator: "none"` does not support `Map` |
| `Volatile<T> is not Atomic<T>` | Hint to use the correct type |

## See also

- [Global objects](./globals.md) — `Map`, `Buffer`, `DataView`
- [Concurrency](../07-concurrency/index.md) — async/await, threads, ISR
- [Modules](../08-modules/index.md) — `declare module`, platform profiles
- [Build](../09-build/index.md) — `tsc.package.json`, platforms, allocator
