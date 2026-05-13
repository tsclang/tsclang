# Конкурентность

[← Вверх](../index.md) | [Следующий →](./async.md)

---

TSClang разделяет конкурентность на **три независимых механизма**, каждый из которых работает на своём уровне абстракции и платформе.

## Обзор

| Механизм | Платформа | Уровень | Описание |
|----------|-----------|---------|----------|
| `async/await` | все | стандартный | Event loop, state machines, Promise |
| `std/threads` | OS (desktop/server) | продвинутый | Изоляты, каналы, Atomic |
| `@embedded.isr` | embedded (AVR/Cortex) | системный | Аппаратные прерывания, MMIO |

```
┌─────────────────────────────────────────────────────┐
│  TSC Concurrency Model                               │
│                                                      │
│  async/await ──── event loop ──── все платформы      │
│       │                                              │
│       ├── Promise<T> — результат async-функций       │
│       ├── AbortController — кооперативная отмена      │
│       └── async generators — стриминг данных          │
│                                                      │
│  std/threads ───── isolates ────── OS only            │
│       │                                              │
│       ├── channel<T>: передача владения               │
│       ├── Atomic<T> / AtomicArray<T>: shared счётчики │
│       ├── Readonly<T>: zero-copy immutable sharing    │
│       └── Thread<T>: типизированный результат         │
│                                                      │
│  @embedded.isr ─── ISR ─────────── embedded only     │
│       │                                              │
│       ├── Volatile<T> — MMIO-регистры                │
│       ├── EmbeddedSignal — мост ISR → async           │
│       └── interrupts.disable() — критические секции   │
└─────────────────────────────────────────────────────┘
```

## Ключевые принципы

- **async/await** — однопоточный event loop, `Shared<T>` и `Weak<T>` не атомарны, никаких накладных расходов
- **Threads** — изоляты без общей памяти, связь через каналы (передача владения) или `Atomic<T>`
- **ISR** — аппаратные прерывания, нет захвата контекста, heap запрещён

## Async и threads — разделённые миры

`await` внутри `Thread.spawn` — ошибка компилятора. Поток не имеет event loop. Канал — единственный bridge:

```
Event loop:   await rx.receive()  ←──────────────┐  неблокирующий
                                                │
Thread:       tx.send(result)  ────────────────┘  блокирующий (если полный)
```

## Подстраницы

| Страница | Описание |
|----------|----------|
| [Async/Await](./async.md) | State machines, await-правила, async main, AbortController, AsyncMutex |
| [Promise](./promise.md) | Promise\<T\>, .then/.catch/.finally, all/any/race/allSettled |
| [Threads](./threads.md) | Thread.spawn, Atomic\<T\>, AtomicArray\<T\>, Readonly\<T\>, Send-проверка |
| [Каналы и select](./channels.md) | channel\<T\>, bounded MPMC, ISR-safe операции, select |
| [ISR (Embedded)](./isr.md) | @embedded.isr, Volatile\<T\>, std/sync, EmbeddedSignal |
| [Генераторы](./generators.md) | async function\*, for await, close(), кооперативная многозадачность |

## См. также

- [Модель памяти](../05-memory/index.md) — ownership, borrow checker, Shared/Weak
- [Ошибки](../06-errors/index.md) — throws, try/catch, ?-оператор
- [Модули и платформы](../08-modules/index.md) — runtime, platform profiles
