# Concurrency

[← Up](../index.md) | [Next →](./async.md)

---

TSClang divides concurrency into **three independent mechanisms**, each operating at its own abstraction level and platform.

## Overview

| Mechanism | Platform | Level | Description |
|-----------|----------|-------|-------------|
| `async/await` | all | standard | Event loop, state machines, Promise |
| `std/threads` | OS (desktop/server) | advanced | Isolates, channels, Atomic |
| `@embedded.isr` | embedded (AVR/Cortex) | system | Hardware interrupts, MMIO |

```
┌─────────────────────────────────────────────────────┐
│  TSC Concurrency Model                               │
│                                                      │
│  async/await ──── event loop ──── all platforms      │
│       │                                              │
│       ├── Promise<T> — result of async functions     │
│       ├── AbortController — cooperative cancellation  │
│       └── async generators — data streaming          │
│                                                      │
│  std/threads ───── isolates ────── OS only           │
│       │                                              │
│       ├── channel<T>: ownership transfer             │
│       ├── Atomic<T> / AtomicArray<T>: shared counters│
│       ├── Readonly<T>: zero-copy immutable sharing   │
│       └── Thread<T>: typed result                    │
│                                                      │
│  @embedded.isr ─── ISR ─────────── embedded only     │
│       │                                              │
│       ├── Volatile<T> — MMIO registers               │
│       ├── EmbeddedSignal — ISR → async bridge        │
│       └── interrupts.disable() — critical sections   │
└─────────────────────────────────────────────────────┘
```

## Key Principles

- **async/await** — single-threaded event loop, `Shared<T>` and `Weak<T>` are not atomic, zero overhead
- **Threads** — isolates without shared memory, communication via channels (ownership transfer) or `Atomic<T>`
- **ISR** — hardware interrupts, no context capture, heap forbidden

## Async and threads — separate worlds

`await` inside `Thread.spawn` — compiler error. A thread has no event loop. Channel is the only bridge:

```
Event loop:   await rx.receive()  ←──────────────┐  non-blocking
                                                │
Thread:       tx.send(result)  ────────────────┘  blocking (if full)
```

## Subpages

| Page | Description |
|------|-------------|
| [Async/Await](./async.md) | State machines, await rules, async main, AbortController, AsyncMutex |
| [Promise](./promise.md) | Promise<T>, .then/.catch/.finally, all/any/race/allSettled |
| [Threads](./threads.md) | Thread.spawn, Atomic<T>, AtomicArray<T>, Readonly<T>, Send-check |
| [Channels and select](./channels.md) | channel<T>, bounded MPMC, ISR-safe operations, select |
| [ISR (Embedded)](./isr.md) | @embedded.isr, Volatile<T>, std/sync, EmbeddedSignal |
| [Generators](./generators.md) | async function*, for await, close(), cooperative multitasking |

## See also

- [Memory Model](../05-memory/index.md) — ownership, borrow checker, Shared/Weak
- [Errors](../06-errors/index.md) — throws, try/catch, ?-operator
- [Modules and Platforms](../08-modules/index.md) — runtime, platform profiles
