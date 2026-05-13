# Callbacks and FnPtr\<T\>

[← Up](./index.md) | [Next →](./platform.md) | [Previous ←](./unsafe.md)

---

C libraries expect a function pointer for callbacks. A TSClang closure — struct with captures + function pointer — cannot be passed directly. `FnPtr<T>` solves this: a pure C function pointer without captures.

## FnPtr\<T\>

In `.d.tsc` for C callbacks, use `FnPtr<T>` — accepts only a function **without captures**:

```typescript
// .d.tsc
declare type uv_timer_cb = FnPtr<(handle: Ref<uv_timer_t>) => void>

declare function uv_timer_start(
    timer: Ref<uv_timer_t>,
    cb:    uv_timer_cb,
    timeout: u64,
    repeat:  u64
): i32
```

### Without Captures — OK

```typescript
uv_timer_start(timer, (h) => tick(), 1000, 0)    // ✅ no captures
```

### With Captures — Error

```typescript
uv_timer_start(timer, [ctx](h) => process(ctx), ...)    // ❌ FnPtr does not support captures
// hint: use native {} for closure bridging
```

## TSC_CLOSURE_* Macros

For capturing closures — `native {}` with compiler macros. Macros are available automatically, without `#include`:

| Macro | Description |
|--------|----------|
| `TSC_CLOSURE_BOX(closure_var)` | Allocate captures on heap, return `void*` |
| `TSC_CLOSURE_CALL(ptr)` | Call boxed closure by `void*` |
| `TSC_CLOSURE_FREE(ptr)` | Free boxed closure |
| `TSC_CLOSURE_FN(ptr)` | Get function pointer from boxed closure (thunk) |

### Pattern (cb, userdata)

```typescript
// .d.tsc
declare function lib_on_event(
    cb:   FnPtr<(result: i32, ctx: void*) => void>,
    data: void*
): void

// wrapper
function onEvent(handler: (result: i32) => void): void {
    native `
        void* _boxed = TSC_CLOSURE_BOX(${handler});
        lib_on_event(TSC_CLOSURE_FN(_boxed), _boxed);
    `
}
```

### Pattern handle→data (libuv)

```typescript
function _startTimer(cb: () => void, ms: u64): void {
    native `
        uv_timer_t* _t = (uv_timer_t*)malloc(sizeof(uv_timer_t));
        uv_timer_init(tsc_uv_loop(), _t);
        _t->data = TSC_CLOSURE_BOX(${cb});
        uv_timer_start(_t, _tsc_timer_thunk, ${ms}, 0);
    `
}

// thunk in runtime header:
// static void _tsc_timer_thunk(uv_timer_t* h) {
//     TSC_CLOSURE_CALL(h->data);
//     TSC_CLOSURE_FREE(h->data);
//     uv_close((uv_handle_t*)h, free);
// }
```

## Lifetime Rules for Boxed Closures

| Rule | Description |
|---------|----------|
| `TSC_CLOSURE_BOX` moves captures | Original closure variable after BOX — invalid |
| `TSC_CLOSURE_FREE` exactly once | Double call — UB |
| Borrow checker does not track | Responsibility of the `native {}` block author |
| `heap: false` — compile error | `TSC_CLOSURE_BOX` requires heap allocator |

## Embedded

On `heap: false` platforms, `FnPtr<T>` without captures is the only way to pass a callback to C. For ISR, use `@embedded.isr`, not `FnPtr<T>`.

## C-output

### FnPtr Without Captures

```typescript
uv_timer_start(timer, (h) => tick(), 1000, 0)
```

```c
static void _thunk_0(uv_timer_t* h) {
    tick();
}

uv_timer_start(timer, _thunk_0, 1000, 0);
```

### Closure Bridging

```typescript
function onEvent(handler: (result: i32) => void): void {
    native `
        void* _boxed = TSC_CLOSURE_BOX(${handler});
        lib_on_event(TSC_CLOSURE_FN(_boxed), _boxed);
    `
}
```

```c
void onEvent(Closure_i32* handler) {
    void* _boxed = TSC_CLOSURE_BOX(handler);
    lib_on_event(TSC_CLOSURE_FN(_boxed), _boxed);
}
```

## Errors

| Error | Cause | Solution |
|--------|---------|---------|
| `FnPtr does not support captures` | Capturing closure passed as `FnPtr` | Use `native {}` with `TSC_CLOSURE_*` |
| `TSC_CLOSURE_BOX on heap: false` | Heap allocation on embedded | Use `FnPtr` without captures |
| `use of invalid closure after BOX` | Accessing closure after `TSC_CLOSURE_BOX` | Do not use closure variable after BOX |

## See Also

- [native — inline C](./native.md) — verbatim C code insertion
- [.d.tsc files](./d-tsc.md) — C callback declarations via `FnPtr<T>`
- [unsafe {}](./unsafe.md) — disabling checks inside native blocks
- [Closures](../05-memory/closures.md) — capture rules, capture list
- [Concurrency](../07-concurrency/index.md) — async callbacks, event loop
