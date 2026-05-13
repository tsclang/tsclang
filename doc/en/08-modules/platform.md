# @platform — Conditional Compilation

[← Up](./index.md) | [Previous ←](./callbacks.md)

---

`@platform` — decorator for platform-dependent implementations of a single function or class. The compiler includes in the build only the implementation matching the active platform.

## Syntax

```typescript
@platform("avr")
@platform("avr", "arm")   // multiple platforms
@platform("desktop")
```

## Rules

| Situation | Result |
|----------|-----------|
| Function without `@platform` | Available everywhere |
| Function with `@platform` | Only on specified platforms |
| Call on unsupported platform | Compile error |

## Example: Different Implementations

```typescript
@platform("avr")
function delay(ms: u16): void {
    for (let i = 0; i < ms; i++) {
        _delay_ms(1)
    }
}

@platform("arm")
function delay(ms: u32): void {
    HAL_Delay(ms)
}

@platform("desktop")
async function delay(ms: u32): Promise<void> {
    await sleep(ms)
}
```

Calling `delay()` on a platform without a matching `@platform` implementation — compile error.

## Package Structure with Multiple Platforms

Different implementations in different files:

```
@mylib/gpio/
  index.tsc       # export { pinMode } from "./platform"
  avr.tsc         # @platform("avr") implementation
  arm.tsc         # @platform("arm") implementation
  desktop.tsc     # @platform("desktop") mock for tests
```

```typescript
// index.tsc
export { pinMode, digitalWrite } from "./platform"
```

```typescript
// avr.tsc
@platform("avr")
export function pinMode(pin: u8, mode: PinMode): void {
    native `DDR${pin} |= (1 << ${pin});`
}
```

```typescript
// desktop.tsc
@platform("desktop")
export function pinMode(pin: u8, mode: PinMode): void {
    console.log(`pinMode(${pin}, ${mode})`)
}
```

## C-output

The compiler includes in the binary only the implementation for the active platform:

```typescript
// input.tsc (target: avr)
@platform("avr")
function delay(ms: u16): void {
    for (let i = 0; i < ms; i++) {
        _delay_ms(1)
    }
}

@platform("desktop")
function delay(ms: u32): void {
    sleep(ms)
}

delay(100)
```

```c
// output — only avr implementation
void delay(uint16_t ms) {
    for (uint16_t i = 0; i < ms; i++) {
        _delay_ms(1);
    }
}

int main(void) {
    tsc_init_all();
    delay(100);
    return 0;
}
```

The desktop implementation `delay(uint32_t)` did not make it into output — platform is `avr`.

## Errors

| Error | Cause | Solution |
|--------|---------|---------|
| `no @platform implementation for "avr"` | Calling function on platform without implementation | Add `@platform("avr")` implementation |
| `duplicate @platform("avr") for "delay"` | Two implementations for same platform | Remove duplicate |
| `signature mismatch across @platform` | Different signatures for platform variants | Unify signatures |

## See Also

- [native — Inline C](./native.md) — platform-dependent `native` blocks
- [.d.tsc Files](./d-tsc.md) — MMIO registers (embedded)
- [Concurrency](../07-concurrency/index.md) — ISR, platform-specific async
