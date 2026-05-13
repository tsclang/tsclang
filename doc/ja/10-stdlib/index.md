# 標準ライブラリ

[上へ](../index.md) | [次へ](./globals.md)

---

TSClang標準ライブラリは、統一された名前空間 `std/` を持つモジュール群です。すべてのモジュールは `import { ... } from "std/<module>"` で利用可能です。

## 原則

| 原則 | 説明 |
|-----------|-------------|
| **統一API** | `std/` を介してすべて、レベル分けの公開はなし |
| **遅延読み込み** | コンパイラは必要に応じてモジュールを読み込み、起動時に `std/` 全体を解析しない |
| **Tree-shaking** | 使用されたコードのみがバイナリに含まれる |

```typescript
import { parse } from "std/json"   // ok
import { serve } from "std/net"    // ok
import { Regex } from "std/regex"  // ok
```

パッケージ `@tsc/*` — Cラッパーのみ、stdlibモジュールではありません：

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // ok — Cラッパー
import { parse } from "@tsc/json"            // error — std/json を使用
```

## 短いインポート

すべての `std/` モジュールはプレフィックスなしでインポートできます：

```typescript
import { Thread } from "std/threads"   // 明示的な形式（推奨）
import { Thread } from "threads"       // 短い形式
```

解決順序: `./name.tsc` → `std/name` → error。

## プラットフォーム互換性

| モジュール | Desktop | 組み込み (ARM) | 組み込み (AVR) | 注記 |
|--------|---------|----------------|----------------|------|
| グローバルオブジェクト | ✅ | ✅ | ✅ | `console`、`Math`、タイマー |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA、約5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — RNG搭載の組み込みのみ |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM: 壁時計なし |
| `std/io` | ✅ | ❌ | ❌ | ヒープとOSが必要 |
| `std/fs` | ✅ | ❌ | ❌ | ファイルシステムが必要 |
| `std/net` | ✅ | ❌ | ❌ | TCP/IPスタックが必要 |
| `std/ws` | ✅ | ❌ | ❌ | `std/net` の上に構築 |
| `std/threads` | ✅ | ❌ | ❌ | OSスレッドが必要 |
| `std/reactive` | ✅ | ❌ | ❌ | `std/threads` の上に構築 |
| `std/hal` | ✅ | ✅ | ✅ | GPIO、UART、SPI、I2C；desktop — モック |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`、`pointer<T>`、`HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | OSなしの原子操作 |
| `std/avr` | ❌ | ✅ | ✅ | AVR専用 |

**凡例:** ✅ — 完全サポート、🟡 — 部分的、❌ — 利用不可。

コンパイラはインポート時に互換性をチェックします：

```typescript
// target: avr
import { readFile } from "std/fs"   // error: std/fs は AVR でサポートされていない
import { gpio } from "std/embedded"  // ok
```

## サブページ

| ページ | 説明 |
|------|-------------|
| [グローバルオブジェクト](./globals.md) | `console`、`Math`、`process`、タイマー、`performance` |
| [console](./console.md) | ログ出力：`log`、`error`、`warn`、`time`、`timeEnd`、`assert` |
| [Math](./math.md) | 定数と数学関数 |
| [std/io](./io.md) | ストリーム：`Reader`、`Writer`、`Stream` |
| [std/fs](./fs.md) | ファイルシステム：読み込み、書き込み、ディレクトリ |
| [std/net](./net.md) | ネットワーク：`fetch`、HTTPサーバー、TCP/UDP |
| [std/ws](./ws.md) | WebSocket：クライアントとサーバー |
| [std/string](./string.md) | Unicode、エンコーディング、フォーマット |
| [std/json](./json.md) | JSON：`parse` と `stringify` |
| [std/regex](./regex.md) | NFA正規表現 |
| [std/hal と embedded](./hal.md) | HAL、組み込みモジュール、`std/random`、`std/temporal`、`std/reactive` |

## 関連項目

- [メモリモデル](../05-memory/index.md) — 所有権、`Ref<T>`、`Mut<T>`
- [エラー処理](../06-errors/index.md) — `throws`、`try`/`catch`
- [モジュール](../08-modules/index.md) — `import`/`export`、`.d.tsc`、native
- [ビルド](../09-build/index.md) — プラットフォーム、`tsc.package.json`
