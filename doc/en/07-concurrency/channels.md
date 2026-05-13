# Channels and select

[← Up](./index.md) | [Next →](./isr.md) | [Previous ←](./threads.md)

---

`channel<T>` — bounded MPMC (multiple producer, multiple consumer) ring buffer. Primary means of transferring data between threads, between ISR and async code, and between async tasks.

## Creation

```typescript
import { Thread, channel, select, after } from "std/threads"

const [tx, rx] = channel<Message>(128)   // capacity = 128, required
```

Returns a tuple `[Sender<T>, Receiver<T>]`. Capacity is a compile-time constant.

## Sending (Sender)

```typescript
// async context: yields event loop if full (backpressure)
await tx.send(msg)

// thread context: blocks OS thread if full
tx.send(msg)

// non-blocking: boolean — false if full
tx.trySend(msg)

// close channel; receiver drains remainder, then gets null
tx.close()
```

## Receiving (Receiver)

```typescript
// async context: yields event loop while empty
const msg = await rx.receive()

// thread context: blocks OS thread while empty
const msg = rx.receive()

// non-blocking: Message | null
rx.tryReceive()
```

## Ownership

`tx.send(msg)` — **moves** `msg` into the channel. After sending, `msg` is unavailable. When a channel with unread items is dropped, the compiler calls destructors for all remaining objects.

## ISR-safe Operations

`trySend`, `tryReceive`, `size`, `capacity`, `isFull`, `isEmpty` make no system calls and do not allocate memory — safe to call from interrupts:

```typescript
tx.size       // i32 — current number of elements
tx.capacity   // i32 — maximum capacity
tx.isFull     // boolean — size == capacity
tx.isEmpty    // boolean — size == 0
```

`size` and `isFull` are snapshots: the value may change by the next instruction.

### Adaptive Producer in ISR

Typical pattern for robotics and real-time systems:

```typescript
// Binary adaptation: two quality modes
@embedded.isr("LIDAR_SCAN")
function onScan(): void {
    const resolution = tx.isFull ? Resolution.Low : Resolution.High
    tx.trySend(captureScan(resolution))
}

// Gradual adaptation: three quality levels
@embedded.isr("CAMERA_FRAME")
function onFrame(): void {
    const quality = tx.size < tx.capacity / 3  ? Quality.High
                  : tx.size < tx.capacity * 2/3 ? Quality.Medium
                  : Quality.Low

    tx.trySend(captureFrame(quality))
}
```

For "exactly once" guarantees use `trySend()` — it is atomic.

## select

Waits for the first ready channel among several. Exactly one field of the result is non-null. **Only for async context** (event loop).

```typescript
const result = await select({
    msg:     rx1.receive(),   // wait for Message
    err:     errCh.receive(), // wait for AppError
    timeout: after(500)       // 500 ms timeout
})

match (result) {
    { msg }     => handleMsg(msg),
    { err }     => handleErr(err),
    { timeout } => handleTimeout(),
}
```

- `result` — opaque type. Direct field access (`result.msg`) — compile error
- Consume only via `match` — compiler checks exhaustiveness
- `after(ms)` — Timer Task, not a full channel (no buffer allocation)

### Fairness

Before registering callbacks, the compiler traverses channels in random order via `tryReceive()`. If at least one is ready — returns immediately without registering in the event loop.

### From Threads

In `Thread.spawn`, `await` is forbidden, so `await select(...)` will not compile. Use `rx.receive()` directly.

## C-output

### Channel — MPMC Ring Buffer

```c
typedef struct {
    pthread_mutex_t  mutex;
    pthread_cond_t   not_full;
    pthread_cond_t   not_empty;
    void**           buf;          // ring buffer
    size_t           capacity;
    size_t           head, tail, count;
    atomic_size_t    ref_count;
    bool             closed;
} Channel;
```

### select — SelectState

```c
typedef struct {
    void*    channel;      // pointer to channel or timer
    void*    result_buf;   // where to write value
    size_t   val_size;     // how many bytes to copy
    int      arm_id;       // index → field name (msg=0, err=1, timeout=2)
} SelectArm;

typedef struct {
    SelectArm*    arms;
    size_t        count;
    atomic_bool   resolved;   // CAS — only one arm wins
    atomic_size_t ref_count;  // = count; each callback does release()
    void*         promise;
} SelectState;
```

### SelectResult — Tagged Union

```c
struct SelectResult {
    int arm_id;   // discriminant: 0=msg, 1=err, 2=timeout
    union {
        Message*  msg;
        AppError* err;
    } data;
};
```

The compiler generates `SelectResult` for a specific `select{}` call.

Lifecycle: `ref_count = arms_count`. Each callback does `dec_ref`. The last one frees memory. After one wins — the rest unsubscribe.

## Errors

| Error | Cause |
|--------|---------|
| `channel capacity required` | Capacity not specified on creation |
| `await select in Thread.spawn` | `select` is only for async context |
| `direct field access on select result` | `result.msg` — opaque, use `match` |
| `cannot send to closed channel` | `tx.send()` after `tx.close()` |

## See Also

- [Threads](./threads.md) — Thread.spawn, Atomic\<T\>, Readonly\<T\>
- [ISR (Embedded)](./isr.md) — ISR-safe channel operations
- [Async/Await](./async.md) — event loop, async context
