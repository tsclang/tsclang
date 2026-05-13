# Concurrencia

[← Arriba](../index.md) | [Siguiente →](./async.md)

---

TSClang divide la concurrencia en **tres mecanismos independientes**, cada uno operando en su propio nivel de abstracción y plataforma.

## Vista general

| Mecanismo | Plataforma | Nivel | Descripción |
|-----------|----------|-------|-------------|
| `async/await` | todas | estándar | Bucle de eventos, máquinas de estado, Promise |
| `std/threads` | OS (desktop/servidor) | avanzado | Isolates, canales, Atomic |
| `@embedded.isr` | embebido (AVR/Cortex) | sistema | Interrupciones de hardware, MMIO |

```
┌─────────────────────────────────────────────────────┐
│  Modelo de concurrencia TSC                          │
│                                                      │
│  async/await ──── bucle de eventos ──── todas       │
│       │                                              │
│       ├── Promise<T> — resultado de funciones async  │
│       ├── AbortController — cancelación cooperativa  │
│       └── async generators — flujo de datos          │
│                                                      │
│  std/threads ───── isolates ────── solo OS           │
│       │                                              │
│       ├── channel<T>: transferencia de propiedad     │
│       ├── Atomic<T> / AtomicArray<T>: contadores compartidos│
│       ├── Readonly<T>: compartición inmutable sin copia│
│       └── Thread<T>: resultado tipado                │
│                                                      │
│  @embedded.isr ─── ISR ─────────── solo embebido     │
│       │                                              │
│       ├── Volatile<T> — registros MMIO               │
│       ├── EmbeddedSignal — puente ISR → async        │
│       └── interrupts.disable() — secciones críticas  │
└─────────────────────────────────────────────────────┘
```

## Principios clave

- **async/await** — bucle de eventos mono-hilo, `Shared<T>` y `Weak<T>` no son atómicos, cero sobrecarga
- **Threads** — isolates sin memoria compartida, comunicación mediante canales (transferencia de propiedad) o `Atomic<T>`
- **ISR** — interrupciones de hardware, sin captura de contexto, heap prohibido

## Async y threads — mundos separados

`await` dentro de `Thread.spawn` — error de compilación. Un thread no tiene bucle de eventos. El canal es el único puente:

```
Bucle de eventos:  await rx.receive()  ←──────────────┐  no bloqueante
                                                      │
Thread:            tx.send(result)  ────────────────┘  bloqueante (si lleno)
```

## Subpáginas

| Página | Descripción |
|------|-------------|
| [Async/Await](./async.md) | Máquinas de estado, reglas de await, async main, AbortController, AsyncMutex |
| [Promise](./promise.md) | Promise<T>, .then/.catch/.finally, all/any/race/allSettled |
| [Threads](./threads.md) | Thread.spawn, Atomic<T>, AtomicArray<T>, Readonly<T>, Send-check |
| [Canales y select](./channels.md) | channel<T>, MPMC acotado, operaciones ISR-safe, select |
| [ISR (Embebido)](./isr.md) | @embedded.isr, Volatile<T>, std/sync, EmbeddedSignal |
| [Generadores](./generators.md) | async function*, for await, close(), multitarea cooperativa |

## Ver también

- [Modelo de memoria](../05-memory/index.md) — propiedad, verificador de préstamo, Shared/Weak
- [Errores](../06-errors/index.md) — throws, try/catch, operador ?
- [Módulos y plataformas](../08-modules/index.md) — runtime, perfiles de plataforma
