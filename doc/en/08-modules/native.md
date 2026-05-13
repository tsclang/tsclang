# native — Inline C

[← Up](./index.md) | [Next →](./unsafe.md) | [Previous ←](./d-tsc.md)

---

`native` — verbatim insertion of C code into generated output. Last resort when `.d.tsc` is insufficient: C macros, direct register access, inline asm, platform ifdefs.

## Syntax

```typescript
native `<C-code>`
```

### Simple Insertion

```typescript
native `PORTB |= (1 << PB5);`
```

### With TSClang Variable Interpolation

The compiler substitutes the C variable name:

```typescript
const pin: u8 = 5
native `PORTB |= (1 << ${pin});`
```

### Multiline Insertion

```typescript
native `
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        counter++;
    }
`
```

### Inline Assembly

There is no separate syntax for asm — TSClang compiles to C, so asm goes through GCC/clang inline asm:

```typescript
native `asm volatile("nop");`
native `asm volatile("sei");`   // enable interrupts (AVR)
native `asm volatile("cli");`   // disable interrupts (AVR)
```

GCC inline asm with input/output operands:

```typescript
const val: u8 = 0xFF
native `
    asm volatile(
        "out %0, %1"
        :
        : "I" (_SFR_IO_ADDR(PORTB)), "r" (${val})
    );
`
```

### Platform #ifdef

```typescript
native `
    #ifdef __AVR__
    power_usart0_disable();
    #endif
`
```

## As an Expression

`native` can return a value — requires **explicit type annotation** (inference from C is impossible):

```typescript
const val: i32 = native `read_register(PINB)`      // ✅
const ptr: Ref<u8[]> = native `get_buffer_ptr()`   // ✅
const val = native `read_register(PINB)`            // ❌ requires explicit type annotation
```

## Compiler Warning

The compiler and linter emit a warning on every `native` block:

```
warning: native block — C code inserted verbatim, memory management is manual
```

Suppression in `tsc.package.json`:

```json
{ "allowNative": true }
```

## Limitations

| Limitation | Description |
|-------------|----------|
| Explicit type for expression | `const x = native ...` — error without annotation |
| No type inference | C variables are invisible to type checker |
| Borrow checker disabled | Memory management is manual |
| `${expr}` — only variables | Not arbitrary expressions, only simple names |

## Comparison with .d.tsc

| Approach | Pros | Cons |
|--------|-------|--------|
| `.d.tsc` (`declare`) | Type safety, autocomplete | Only for functions/types |
| `native` | Arbitrary C, macros, asm | No type checking |

For everything expressible via `declare function` — use `.d.tsc`. `native` is an escape hatch.

## C-output

Code is inserted verbatim — without changes:

```typescript
const pin: u8 = 5
native `PORTB |= (1 << ${pin});`
```

```c
uint8_t pin = 5;
PORTB |= (1 << pin);
```

Multiline insertion — also verbatim:

```typescript
native `
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        counter++;
    }
`
```

```c
ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    counter++;
}
```

## Errors

| Error | Cause | Solution |
|--------|---------|---------|
| `native expression requires explicit type annotation` | `native` as expression without type | Add annotation: `const x: i32 = native ...` |
| `warning: native block` | Warning on every block | Suppress via `"allowNative": true` |
| `${expr}` is not a variable | Interpolation of complex expressions | Extract into variable before `native` |

## See Also

- [.d.tsc Files](./d-tsc.md) — type-safe declarations instead of inline C
- [unsafe {}](./unsafe.md) — disabling checks without inline C
- [Callbacks and FnPtr\<T\>](./callbacks.md) — closure bridging via `native {}`
- [@platform — Conditional Compilation](./platform.md) — platform-dependent `native` blocks
