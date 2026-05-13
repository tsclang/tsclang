# Concorrência

[Acima](../index.md) | [Próximo](./async.md)

---

O TSClang divide a concorrência em **três mecanismos independentes**, cada um operando em seu próprio nível de abstração e plataforma.

## Visão Geral

| Mecanismo | Plataforma | Nível | Descrição |
|-----------|----------|-------|-------------|
| `async/await` | todas | padrão | Event loop, máquinas de estado, Promise |
| `std/threads` | OS (desktop/servidor) | avançado | Isolates, canais, Atomic |
| `@embedded.isr` | embarcado (AVR/Cortex) | sistema | Interrupções de hardware, MMIO |

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

## Princípios-chave

- **async/await** — event loop single-threaded, `Shared<T>` e `Weak<T>` não são atômicos, zero overhead
- **Threads** — isolates sem memória compartilhada, comunicação via canais (transferência de propriedade) ou `Atomic<T>`
- **ISR** — interrupções de hardware, sem captura de contexto, heap proibido

## Async e threads — mundos separados

`await` dentro de `Thread.spawn` — erro de compilador. Uma thread não tem event loop. Canal é a única ponte:

```
Event loop:   await rx.receive()  ←──────────────┐  não-bloqueante
                                                │
Thread:       tx.send(result)  ────────────────┘  bloqueante (se cheio)
```

## Subpáginas

| Página | Descrição |
|------|-------------|
| [Async/Await](./async.md) | Máquinas de estado, regras de await, async main, AbortController, AsyncMutex |
| [Promise](./promise.md) | Promise<T>, .then/.catch/.finally, all/any/race/allSettled |
| [Threads](./threads.md) | Thread.spawn, Atomic<T>, AtomicArray<T>, Readonly<T>, Send-check |
| [Canais e select](./channels.md) | channel<T>, bounded MPMC, operações ISR-safe, select |
| [ISR (Embarcado)](./isr.md) | @embedded.isr, Volatile<T>, std/sync, EmbeddedSignal |
| [Generators](./generators.md) | async function*, for await, close(), multitarefa cooperativa |

## Veja também

- [Modelo de Memória](../05-memory/index.md) — propriedade, verificador de empréstimo, Shared/Weak
- [Erros](../06-errors/index.md) — throws, try/catch, operador ?
- [Módulos e Plataformas](../08-modules/index.md) — runtime, perfis de plataforma
