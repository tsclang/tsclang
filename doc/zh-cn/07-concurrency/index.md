# 并发

[← 上一级](../index.md) | [下一页 →](./async.md)

---

TSClang 将并发划分为**三个独立的机制**，每个机制在不同的抽象层级和平台上运行。

## 概览

| 机制 | 平台 | 层级 | 说明 |
|-----------|----------|-------|-------------|
| `async/await` | 所有平台 | 标准 | 事件循环、状态机、Promise |
| `std/threads` | OS（桌面/服务器） | 高级 | Isolates、通道、Atomic |
| `@embedded.isr` | 嵌入式（AVR/Cortex） | 系统 | 硬件中断、MMIO |

```
┌─────────────────────────────────────────────────────┐
│  TSC 并发模型                                         │
│                                                      │
│  async/await ──── 事件循环 ──── 所有平台               │
│       │                                              │
│       ├── Promise<T> — async 函数的结果              │
│       ├── AbortController — 协作式取消                │
│       └── async generators — 数据流                  │
│                                                      │
│  std/threads ───── isolates ────── 仅限 OS           │
│       │                                              │
│       ├── channel<T>: 所有权转移                     │
│       ├── Atomic<T> / AtomicArray<T>: 共享计数器      │
│       ├── Readonly<T>: 零拷贝不可变共享              │
│       └── Thread<T>: 带类型的结果                    │
│                                                      │
│  @embedded.isr ─── ISR ─────────── 仅限嵌入式        │
│       │                                              │
│       ├── Volatile<T> — MMIO 寄存器                  │
│       ├── EmbeddedSignal — ISR → async 桥接          │
│       └── interrupts.disable() — 临界区              │
└─────────────────────────────────────────────────────┘
```

## 核心原则

- **async/await** — 单线程事件循环，`Shared<T>` 和 `Weak<T>` 非原子操作，零开销
- **Threads** — 无共享内存的 isolates，通过通道（所有权转移）或 `Atomic<T>` 通信
- **ISR** — 硬件中断，不捕获上下文，禁止使用堆

## 异步与线程 — 两个独立的世界

在 `Thread.spawn` 内部使用 `await` — 编译错误。线程没有事件循环。通道是唯一的桥梁：

```
事件循环:   await rx.receive()  ←──────────────┐  非阻塞
                                                │
线程:       tx.send(result)  ────────────────┘  阻塞（若满）
```

## 子页面

| 页面 | 说明 |
|------|-------------|
| [Async/Await](./async.md) | 状态机、await 规则、async main、AbortController、AsyncMutex |
| [Promise](./promise.md) | Promise<T>、.then/.catch/.finally、all/any/race/allSettled |
| [Threads](./threads.md) | Thread.spawn、Atomic<T>、AtomicArray<T>、Readonly<T>、Send-check |
| [Channels and select](./channels.md) | channel<T>、有界 MPMC、ISR 安全操作、select |
| [ISR (Embedded)](./isr.md) | @embedded.isr、Volatile<T>、std/sync、EmbeddedSignal |
| [Generators](./generators.md) | async function*、for await、close()、协作式多任务 |

## 参见

- [Memory Model](../05-memory/index.md) — 所有权、借用检查器、Shared/Weak
- [Errors](../06-errors/index.md) — throws、try/catch、?-运算符
- [Modules and Platforms](../08-modules/index.md) — runtime、平台配置文件
