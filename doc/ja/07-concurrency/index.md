# コンカレンシー

[上へ](../index.md) | [次へ](./async.md)

---

TSClangはコンカレンシーを**3つの独立したメカニズム**に分けており、それぞれが独自の抽象化レベルとプラットフォームで動作します。

## 概要

| メカニズム | プラットフォーム | レベル | 説明 |
|-----------|----------|-------|-------------|
| `async/await` | すべて | 標準 | イベントループ、ステートマシン、Promise |
| `std/threads` | OS（デスクトップ/サーバー） | 上級 | アイソレート、チャネル、Atomic |
| `@embedded.isr` | 組み込み（AVR/Cortex） | システム | ハードウェア割り込み、MMIO |

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

## 主な原則

- **非同期/待機** — シングルスレッドのイベントループ、`Shared<T>` と `Weak<T>` はアトミックではありません、オーバーヘッドゼロ
- **スレッド** — 共有メモリのないアイソレート、チャネル（所有権転送）または `Atomic<T>` による通信
- **ISR** — ハードウェア割り込み、コンテキストキャプチャなし、ヒープ禁止

## 非同期とスレッド — 別々の世界

`Thread.spawn` 内での `await` — コンパイルエラーです。スレッドにはイベントループがありません。チャネルが唯一の橋渡しとなります：

```
Event loop:   await rx.receive()  ←──────────────┐  ノンブロッキング
                                                │
Thread:       tx.send(result)  ────────────────┘  ブロッキング（満杯の場合）
```

## サブページ

| ページ | 説明 |
|------|-------------|
| [非同期/待機](./async.md) | ステートマシン、待機ルール、非同期main、AbortController、AsyncMutex |
| [Promise](./promise.md) | Promise<T>、.then/.catch/.finally、all/any/race/allSettled |
| [スレッド](./threads.md) | Thread.spawn、Atomic<T>、AtomicArray<T>、Readonly<T>、Send-check |
| [チャネルとselect](./channels.md) | channel<T>、境界付きMPMC、ISR安全な操作、select |
| [ISR（組み込み）](./isr.md) | @embedded.isr、Volatile<T>、std/sync、EmbeddedSignal |
| [ジェネレータ](./generators.md) | async function*、for await、close()、協調的マルチタスク |

## 関連項目

- [メモリモデル](../05-memory/index.md) — 所有権、借用チェッカー、Shared/Weak
- [エラー](../06-errors/index.md) — throws、try/catch、?演算子
- [モジュールとプラットフォーム](../08-modules/index.md) — ランタイム、プラットフォームプロファイル
