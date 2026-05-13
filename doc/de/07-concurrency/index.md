# Nebenläufigkeit

[← Hoch](../index.md) | [Weiter →](./async.md)

---

TSClang teilt Nebenläufigkeit in **drei unabhängige Mechanismen** auf, die jeweils auf ihrer eigenen Abstraktionsebene und Plattform arbeiten.

## Übersicht

| Mechanismus | Plattform | Ebene | Beschreibung |
|-----------|----------|-------|-------------|
| `async/await` | alle | Standard | Event-Loop, Zustandsmaschinen, Promise |
| `std/threads` | OS (Desktop/Server) | erweitert | Isolates, Kanäle, Atomic |
| `@embedded.isr` | Embedded (AVR/Cortex) | System | Hardware-Interrupts, MMIO |

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

## Grundprinzipien

- **async/await** — single-threaded Event-Loop, `Shared<T>` und `Weak<T>` sind nicht atomar, Zero-Overhead
- **Threads** — Isolates ohne gemeinsamen Speicher, Kommunikation über Kanäle (Ownership-Transfer) oder `Atomic<T>`
- **ISR** — Hardware-Interrupts, kein Context-Capture, Heap verboten

## Async und Threads — getrennte Welten

`await` innerhalb von `Thread.spawn` — Compilerfehler. Ein Thread hat keine Event-Loop. Kanal ist die einzige Brücke:

```
Event loop:   await rx.receive()  ←──────────────┐  non-blocking
                                                │
Thread:       tx.send(result)  ────────────────┘  blocking (if full)
```

## Unterseiten

| Seite | Beschreibung |
|------|-------------|
| [Async/Await](./async.md) | Zustandsmaschinen, Await-Regeln, async main, AbortController, AsyncMutex |
| [Promise](./promise.md) | Promise<T>, .then/.catch/.finally, all/any/race/allSettled |
| [Threads](./threads.md) | Thread.spawn, Atomic<T>, AtomicArray<T>, Readonly<T>, Send-check |
| [Kanäle und select](./channels.md) | channel<T>, bounded MPMC, ISR-sichere Operationen, select |
| [ISR (Embedded)](./isr.md) | @embedded.isr, Volatile<T>, std/sync, EmbeddedSignal |
| [Generatoren](./generators.md) | async function*, for await, close(), kooperatives Multitasking |

## Siehe auch

- [Speichermodell](../05-memory/index.md) — Ownership, Borrow-Checker, Shared/Weak
- [Fehler](../06-errors/index.md) — throws, try/catch, ?-Operator
- [Module und Plattformen](../08-modules/index.md) — Laufzeit, Plattform-Profile
