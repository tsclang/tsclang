# Callbacks и FnPtr\<T\>

[← Вверх](./index.md) | [Следующий →](./platform.md) | [Предыдущий ←](./unsafe.md)

---

C-библиотеки ожидают function pointer для callbacks. TSClang closure — struct с captures + function pointer — их нельзя передать напрямую. `FnPtr<T>` решает эту задачу: чистый C function pointer без captures.

## FnPtr\<T\>

В `.d.tsc` для C callback используется `FnPtr<T>` — принимает только функцию **без captures**:

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

### Без captures — ok

```typescript
uv_timer_start(timer, (h) => tick(), 1000, 0)    // ✅ нет captures
```

### С captures — ошибка

```typescript
uv_timer_start(timer, [ctx](h) => process(ctx), ...)    // ❌ FnPtr не поддерживает captures
// hint: используй native {} для closure bridging
```

## TSC_CLOSURE_* макросы

Для capturing closures — `native {}` с макросами компилятора. Макросы доступны автоматически, без `#include`:

| Макрос | Описание |
|--------|----------|
| `TSC_CLOSURE_BOX(closure_var)` | Аллоцировать captures на heap, вернуть `void*` |
| `TSC_CLOSURE_CALL(ptr)` | Вызвать boxed closure по `void*` |
| `TSC_CLOSURE_FREE(ptr)` | Освободить boxed closure |
| `TSC_CLOSURE_FN(ptr)` | Получить function pointer из boxed closure (thunk) |

### Паттерн (cb, userdata)

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

### Паттерн handle→data (libuv)

```typescript
function _startTimer(cb: () => void, ms: u64): void {
    native `
        uv_timer_t* _t = (uv_timer_t*)malloc(sizeof(uv_timer_t));
        uv_timer_init(tsc_uv_loop(), _t);
        _t->data = TSC_CLOSURE_BOX(${cb});
        uv_timer_start(_t, _tsc_timer_thunk, ${ms}, 0);
    `
}

// thunk в рантайм-хедере:
// static void _tsc_timer_thunk(uv_timer_t* h) {
//     TSC_CLOSURE_CALL(h->data);
//     TSC_CLOSURE_FREE(h->data);
//     uv_close((uv_handle_t*)h, free);
// }
```

## Правила lifetime для boxed closures

| Правило | Описание |
|---------|----------|
| `TSC_CLOSURE_BOX` перемещает captures | Исходная переменная closure после BOX — invalid |
| `TSC_CLOSURE_FREE` ровно один раз | Двойной вызов — UB |
| Borrow checker не отслеживает | Ответственность на авторе `native {}` блока |
| `heap: false` — compile error | `TSC_CLOSURE_BOX` требует heap-аллокатор |

## Embedded

На `heap: false` платформах `FnPtr<T>` без captures — единственный способ передать callback в C. Для ISR используется `@embedded.isr`, не `FnPtr<T>`.

## C-output

### FnPtr без captures

```typescript
uv_timer_start(timer, (h) => tick(), 1000, 0)
```

```c
static void _thunk_0(uv_timer_t* h) {
    tick();
}

uv_timer_start(timer, _thunk_0, 1000, 0);
```

### Closure bridging

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

## Ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `FnPtr does not support captures` | Capturing closure передана как `FnPtr` | Используйте `native {}` с `TSC_CLOSURE_*` |
| `TSC_CLOSURE_BOX on heap: false` | Heap allocation на embedded | Используйте `FnPtr` без captures |
| `use of invalid closure after BOX` | Обращение к closure после `TSC_CLOSURE_BOX` | Не используйте closure переменную после BOX |

## См. также

- [native — inline C](./native.md) — вербатимная вставка C-кода
- [.d.tsc файлы](./d-tsc.md) — декларации C callbacks через `FnPtr<T>`
- [unsafe {}](./unsafe.md) — отключение проверок внутри native-блоков
- [Замыкания](../05-memory/closures.md) — правила захвата, capture list
- [Конкурентность](../07-concurrency/index.md) — async callbacks, event loop
