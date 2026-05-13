# @embedded.isr — Hardware Interrupts

[← Up](./index.md) | [Next →](./generators.md) | [Previous ←](./channels.md)

---

ISR (Interrupt Service Routine) — hardware interrupt. Not a thread, not a closure. No context capture. Available **only on embedded** (AVR, ARM Cortex-M).

## Volatile\<T\> — MMIO Registers

`Volatile<T>` guarantees that every read/write reaches memory (not cached in a CPU register). Translates to `volatile T*` in C.

```typescript
import { Volatile, pointer } from "std/embedded"

type UartRegs = {
    dr:        Volatile<u32>   // Data Register
    rsr:       Volatile<u32>   // Status Register
    _reserved: u32[4]          // memory gap
    fr:        Volatile<u32>   // Flag Register
}

const UART0 = pointer<UartRegs>(0x101f1000)

UART0.dr.write(0x41)              // *(volatile uint32_t*)0x101f1000 = 0x41
const status = UART0.fr.read()   // *(volatile uint32_t*)0x101f1018
```

> `Volatile<T>` ≠ `Atomic<T>`: atomics use synchronization instructions that peripherals do not understand. For MMIO — only `Volatile<T>`.

Two guarantees:
1. **No cache** — every read/write goes to the bus
2. **No reordering** — compiler does not reorder volatile operations

## @embedded.isr

### Signature

Always `(): void` — no parameters, no return value, no `throws`:

```typescript
@embedded.isr(14)
function handler(): void { ... }          // ✅

@embedded.isr(14)
function handler(x: i32): void { ... }   // ❌ parameters forbidden

@embedded.isr(14)
function handler(): i32 { ... }          // ❌ return type must be void

@embedded.isr(14)
function handler(): void throws E { ... } // ❌ throws forbidden
```

### Decorator Argument

Two variants:

```typescript
@embedded.isr("TIMER1_OVF")   // by vector name — AVR (avr-libc naming)
@embedded.isr(14)              // by vector number — ARM Cortex-M (IRQn)
```

### Example

```typescript
import { Atomic, RmwOrdering } from "std/threads"

type TimerEvent = { irq: u32; tick: u32 }

static readonly irqCount = new Atomic<u32>(0)
static readonly [tx, rx] = channel<TimerEvent>(32)

@embedded.isr(14)   // ARM Cortex-M: IRQ14
function onTimerInterrupt(): void {
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)

    const ev: TimerEvent = { irq: 14, tick: irqCount.load(RmwOrdering.Relaxed) }
    tx.trySend(ev)   // non-blocking

    TIMER_REG.sr.write(0x0)   // clear interrupt flag
}

@embedded.isr("TIMER1_OVF")   // AVR: named vector
function onTimerOverflow(): void {
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)
}
```

### C-output

```c
// GCC/Clang (ARM Cortex) — numeric argument
__attribute__((interrupt("IRQ")))
void onTimerInterrupt(void) { ... }

// AVR — string argument
ISR(TIMER1_OVF_vect) {
    counter++;
}
```

Context saving — fully handled by the C compiler via `__attribute__((interrupt))`.

## @embedded.isr Rules

| Operation | Allowed |
|----------|-----------|
| `Atomic<T>` / `AtomicArray<T>` | ✅ |
| `Volatile<T>` (MMIO) | ✅ |
| `tx.trySend()` / `rx.tryReceive()` | ✅ (non-blocking) |
| Stack primitives (`i32`, `u8`, etc.) | ✅ |
| Stack `type` literals (`{ field: u32 }`) | ✅ |
| Module variables (`static`, `const`, `let`) | ✅ |
| Fixed arrays `T[N]` | ✅ |
| `await` | ❌ compile error |
| `new` (heap allocation) | ❌ compile error |
| `tx.send()` / `rx.receive()` (blocking) | ❌ compile error |
| `Shared<T>` / `Weak<T>` | ❌ compile error |
| String concatenation | ❌ compile error (heap) |
| `throw` / `throws` | ❌ compile error |
| `interrupts.disable()` inside ISR | ❌ compile error |
| Two `@embedded.isr` with same vector | ❌ duplicate vector |

### Why Heap Is Forbidden in ISR

1. **Safety** — OOM → system crash
2. **Determinism** — unpredictable time → real-time violation
3. **Atomicity** — allocator uses locks → deadlock
4. **Stack** — ISR runs on a limited stack

### Correct Patterns

```typescript
// ✅ Primitive + channel
const _sensorChannel = channel<u16>(32)

@embedded.isr(14)
function handler(): void {
    const reading: u16 = ADC.read()
    _sensorChannel.trySend(reading)
}

// ✅ Global static buffer
const _buffer: u8[64] = [0, ...]
let _bufferLen: i32 = 0

@embedded.isr("UART_RX")
function uartRx(): void {
    if (_bufferLen < 64) {
        _buffer[_bufferLen++] = UART.read()
    }
}

// ✅ Atomic counter
const _counter = new Atomic<u32>(0)

@embedded.isr("TIMER1_OVF")
function timerOverflow(): void {
    _counter.fetchAdd(1, RmwOrdering.Relaxed)
}
```

## std/sync — Critical Sections

For safe access to composite data modified by IRQ — temporary interrupt disable:

```typescript
import { interrupts } from "std/sync"

interrupts.disable(() => {
    // interrupts disabled
    const snapshot = sensorData.x
    const y = sensorData.y
    process(snapshot, y)
})
// interrupts automatically re-enabled
```

> Same restrictions as in `@embedded.isr`: no `await`, no `new`.

### C-output (Platform-dependent)

```c
// ARM Cortex-M
__asm volatile("cpsid i");   // disable
{ /* body */ }
__asm volatile("cpsie i");   // enable

// x86
__asm volatile("cli");
{ /* body */ }
__asm volatile("sti");

// AVR
uint8_t sreg = SREG; cli();
{ /* body */ }
SREG = sreg;  // restores flags (not just sei())
```

## EmbeddedSignal — ISR → async Bridge

For simple events without payload (ADC ready, timer, button). Zero overhead: one `volatile bool` in BSS.

```typescript
import { EmbeddedSignal } from "std/embedded"

const adcReady = new EmbeddedSignal()

@embedded.isr("ADC_vect")
function adc_isr(): void {
    ADCSRA
    adcReady.set()    // ISR-safe: volatile bool = true
}

async function readADC(): u16 {
    ADCSRA |= (1 << 6)         // start conversion
    await adcReady.wait()      // wait for signal from ISR
    return ADCL | (ADCH << 8)
}
```

### API

```typescript
class EmbeddedSignal {
    set(): void              // ISR-safe: volatile store
    wait(): Promise<void>    // async: flag polling, auto-reset
    clear(): void            // manual reset
    readonly isSet: bool     // ISR-safe: check without waiting
}
```

### Rules

- `new EmbeddedSignal()` — one bit in BSS, no heap
- `await signal.wait()` — only in async function
- `signal.set()` / `signal.isSet` / `signal.clear()` — ISR-safe
- One `EmbeddedSignal` per event

### Automatic Bit Packing

The compiler collects all `EmbeddedSignal`s in a module and packs them into a single `volatile uint32_t`. Each signal is one bit. Fast check in the main loop: **one `if` for all 32 events**.

```c
static volatile uint32_t _sig_bank_0 = 0;
#define _SIG_adcReady    (1u << 0)
#define _SIG_timerTick   (1u << 1)
#define _SIG_buttonPress (1u << 2)

ISR(ADC_vect)       { _sig_bank_0 |= _SIG_adcReady; }
ISR(TIMER1_OVF_vect){ _sig_bank_0 |= _SIG_timerTick; }
ISR(INT0_vect)      { _sig_bank_0 |= _SIG_buttonPress; }

void main_loop(void) {
    while (1) {
        if (!_sig_bank_0) continue;   // no events — skip EVERYTHING

        uint32_t pending = _tsc_signal_snapshot(&_sig_bank_0);

        if (pending & _SIG_adcReady)    readADC_poll(&sm_readADC);
        if (pending & _SIG_timerTick)   onTimer_poll(&sm_onTimer);
        if (pending & _SIG_buttonPress) onButton_poll(&sm_onButton);
    }
}
```

### EmbeddedSignal C-output

```c
// BSS — one volatile bool (or bit in bank)
static volatile bool _sig_adcReady = false;

ISR(ADC_vect) {
    (void)ADCSRA;
    _sig_adcReady = true;
}

bool readADC_poll(ReadADC_SM* sm) {
    switch (sm->_state) {
    case 0:
        ADCSRA |= (1 << 6);
        sm->_state = 1;
        return false;
    case 1:
        if (!_sig_adcReady) return false;
        _sig_adcReady = false;              // auto-reset
        sm->_result = ADCL | (ADCH << 8);
        sm->_state = 0xFF;
        return true;
    }
}
```

## When to Use What

| Scenario | Tool |
|----------|-----------|
| ISR → "event occurred" flag | `EmbeddedSignal` |
| ISR → data transfer (ADC value, UART byte) | `channel<T>.trySend()` |
| ISR → shared counter | `Atomic<T>.fetchAdd()` |
| ISR → complex composite structure | `interrupts.disable()` + global variable |

## Summary Table

| Task | TSC Syntax | Guarantee |
|--------|---------------|----------|
| MMIO registers | `Volatile<T>` | Direct bus access, no reorder |
| Interrupt handler | `@embedded.isr(N)` / `@embedded.isr("NAME")` | Context saved by C compiler |
| Shared state with IRQ | `static Atomic<T>` | Atomic access, no races |
| Composite data with IRQ | `interrupts.disable()` | Critical section |
| Signal ISR → async | `EmbeddedSignal` | bit in uint32_t, auto-reset, fast idle |
| Data ISR → async | `channel.trySend()` | Non-blocking transfer |

## Errors

| Error | Cause |
|--------|---------|
| `ISR not supported on "desktop"` | `@embedded.isr` outside embedded |
| `heap allocation in ISR context` | `new` inside ISR |
| `parameters forbidden in ISR` | ISR with parameters |
| `throws forbidden in ISR` | ISR with `throws` |
| `duplicate ISR vector` | Two ISRs on one vector |
| `interrupts.disable() inside ISR` | Interrupts already disabled |

## See Also

- [Channels and select](./channels.md) — channel.trySend() from ISR
- [Threads](./threads.md) — Atomic\<T\> and AtomicArray\<T\>
- [Async/Await](./async.md) — EmbeddedSignal → async
- [Generators](./generators.md) — ISR patterns for streaming
