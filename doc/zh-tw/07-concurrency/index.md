# 並發

[← 上一級](../index.md) | [下一頁 →](./async.md)

---

TSClang 將並發劃分為**三個獨立的機制**，每個機制在不同的抽象層級和平台上運作。

## 概覽

| 機制 | 平台 | 層級 | 說明 |
|-----------|----------|-------|-------------|
| `async/await` | 所有平台 | 標準 | 事件迴圈、狀態機、Promise |
| `std/threads` | OS（桌面/伺服器） | 進階 | Isolates、通道、Atomic |
| `@embedded.isr` | 嵌入式（AVR/Cortex） | 系統 | 硬體中斷、MMIO |

```
┌─────────────────────────────────────────────────────┐
│  TSC 並發模型                                         │
│                                                      │
│  async/await ──── 事件迴圈 ──── 所有平台               │
│       │                                              │
│       ├── Promise<T> — async 函式的結果              │
│       ├── AbortController — 協作式取消                │
│       └── async generators — 資料流                  │
│                                                      │
│  std/threads ───── isolates ────── 僅限 OS           │
│       │                                              │
│       ├── channel<T>: 所有權轉移                     │
│       ├── Atomic<T> / AtomicArray<T>: 共享計數器      │
│       ├── Readonly<T>: 零複製不可變共享              │
│       └── Thread<T>: 帶型別的結果                    │
│                                                      │
│  @embedded.isr ─── ISR ─────────── 僅限嵌入式        │
│       │                                              │
│       ├── Volatile<T> — MMIO 暫存器                  │
│       ├── EmbeddedSignal — ISR → async 橋接          │
│       └── interrupts.disable() — 臨界區              │
└─────────────────────────────────────────────────────┘
```

## 核心原則

- **async/await** — 單執行緒事件迴圈，`Shared<T>` 和 `Weak<T>` 非原子操作，零開銷
- **Threads** — 無共享記憶體的 isolates，透過通道（所有權轉移）或 `Atomic<T>` 通訊
- **ISR** — 硬體中斷，不捕捉上下文，禁止使用堆積

## 非同步與執行緒 — 兩個獨立的世界

在 `Thread.spawn` 內部使用 `await` — 編譯錯誤。執行緒沒有事件迴圈。通道是唯一的橋樑：

```
事件迴圈:   await rx.receive()  ←──────────────┐  非阻塞
                                                │
執行緒:       tx.send(result)  ────────────────┘  阻塞（若滿）
```

## 子頁面

| 頁面 | 說明 |
|------|-------------|
| [Async/Await](./async.md) | 狀態機、await 規則、async main、AbortController、AsyncMutex |
| [Promise](./promise.md) | Promise<T>、.then/.catch/.finally、all/any/race/allSettled |
| [Threads](./threads.md) | Thread.spawn、Atomic<T>、AtomicArray<T>、Readonly<T>、Send-check |
| [Channels and select](./channels.md) | channel<T>、有界 MPMC、ISR 安全操作、select |
| [ISR (Embedded)](./isr.md) | @embedded.isr、Volatile<T>、std/sync、EmbeddedSignal |
| [Generators](./generators.md) | async function*、for await、close()、協作式多工 |

## 參見

- [Memory Model](../05-memory/index.md) — 所有權、借用檢查器、Shared/Weak
- [Errors](../06-errors/index.md) — throws、try/catch、?-運算子
- [Modules and Platforms](../08-modules/index.md) — runtime、平台設定檔
