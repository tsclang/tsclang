# unsafe {} — Disabling Checks

[← Up](./index.md) | [Next →](./callbacks.md) | [Previous ←](./native.md)

---

`unsafe {}` disables the borrow checker and ownership checks for a block of TSClang code. Used when the type system gets in the way, but inline C is not needed.

## Syntax

```typescript
unsafe {
    const x = doRiskyThing()
    const y = value as Ref<u8[]>
    const z = ptr
}
```

Inside `unsafe {}`:
- **Borrow checker** — disabled
- **Type checker** — disabled
- **Ownership checks** — disabled

## When to Use

### Unsafe Type Cast

```typescript
let raw: u8[] = getBuffer()
unsafe {
    const view = raw as Ref<u8[]>    // unchecked reinterpret
    processBytes(view)
}
```

### Bypassing move-after-use

```typescript
let ptr = getPointer()
unsafe {
    const a = ptr          // move
    const b = ptr          // another move — no error
    process(a, b)
}
```

### Interaction with native

```typescript
unsafe {
    const handle = native `get_handle()` as Ref<Handle>
    useHandle(handle)
}
```

## Compiler Warning

```
warning: unsafe block — ownership and type checks disabled
```

Suppression in `tsc.package.json`:

```json
{ "allowUnsafe": true }
```

## Difference Between native and unsafe

| | `native` | `unsafe {}` |
|---|---|---|
| Code inside | C (verbatim) | TSClang |
| Purpose | Calling C code, macros, asm | Bypassing borrow checker |
| Borrow checker | Disabled (C knows nothing about it) | Disabled explicitly |
| Type checker | Disabled | Disabled |
| Warning | ✅ | ✅ |
| Suppress | `allowNative` | `allowUnsafe` |

**Rule:** if code can be written in TSClang — use `unsafe {}`. If C is needed — use `native`.

## C-output

Code inside `unsafe {}` compiles as regular TSClang, but without checks:

```typescript
let data = getBuffer()
unsafe {
    const view = data as Ref<u8[]>
    processBytes(view)
}
```

```c
Array_u8 data = getBuffer();
const Array_u8 *view = (const Array_u8*)&data;
processBytes_ref_Array_u8(view);
```

## Errors

| Error / Warning | Cause | Solution |
|-----------------|---------|---------|
| `warning: unsafe block` | Warning on every block | Suppress via `"allowUnsafe": true` |
| Incorrect C-output | Wrong cast or use-after-free inside unsafe | Check code manually — checks are disabled |

## See Also

- [native — Inline C](./native.md) — verbatim C code insertion
- [Borrow Checker](../05-memory/borrow-rules.md) — rules disabled by `unsafe`
- [Ref\<T\> / Mut\<T\>](../05-memory/ref.md) — ownership system
- [@platform — Conditional Compilation](./platform.md) — platform-dependent unsafe blocks
