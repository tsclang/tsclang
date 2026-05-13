# 標準函式庫

[← 上一級](../index.md) | [下一頁 →](./globals.md)

---

TSClang 標準函式庫是一組具有統一命名空間 `std/` 的模組。所有模組都可透過 `import { ... } from "std/<module>"` 使用。

## 原則

| 原則 | 說明 |
|-----------|-------------|
| **統一 API** | 所有內容都透過 `std/`，不公開劃分為不同層級 |
| **懶載入** | 編譯器按需載入模組，不會在啟動時解析整個 `std/` |
| **搖樹最佳化** | 只有被使用的程式碼會進入二進位檔案 |

```typescript
import { parse } from "std/json"   // 正確
import { serve } from "std/net"    // 正確
import { Regex } from "std/regex"  // 正確
```

`@tsc/*` 套件 — 僅限 C 包裝器，不是 stdlib 模組：

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // 正確 — C 包裝器
import { parse } from "@tsc/json"            // 錯誤 — 請使用 std/json
```

## 短匯入

所有 `std/` 模組都可以無前綴匯入：

```typescript
import { Thread } from "std/threads"   // 顯式形式（推薦）
import { Thread } from "threads"       // 短形式
```

解析順序：`./name.tsc` → `std/name` → 錯誤。

## 平台相容性

| 模組 | 桌面 | 嵌入式 (ARM) | 嵌入式 (AVR) | 說明 |
|--------|---------|----------------|----------------|------|
| 全域物件 | ✅ | ✅ | ✅ | `console`、`Math`、計時器 |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA，約 5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — 僅帶 RNG 的嵌入式 |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM：無時鐘 |
| `std/io` | ✅ | ❌ | ❌ | 需要堆積和作業系統 |
| `std/fs` | ✅ | ❌ | ❌ | 需要檔案系統 |
| `std/net` | ✅ | ❌ | ❌ | 需要 TCP/IP 協定堆疊 |
| `std/ws` | ✅ | ❌ | ❌ | 基於 `std/net` |
| `std/threads` | ✅ | ❌ | ❌ | 需要作業系統執行緒 |
| `std/reactive` | ✅ | ❌ | ❌ | 基於 `std/threads` |
| `std/hal` | ✅ | ✅ | ✅ | GPIO、UART、SPI、I2C；桌面 — 模擬 |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`、`pointer<T>`、`HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | 無作業系統的原子操作 |
| `std/avr` | ❌ | ✅ | ✅ | AVR 專用 |

**圖例：** ✅ — 完全支援，🟡 — 部分支援，❌ — 不可用。

編譯器在匯入時檢查相容性：

```typescript
// target: avr
import { readFile } from "std/fs"   // 錯誤：std/fs 在 AVR 上不受支援
import { gpio } from "std/embedded"  // 正確
```

## 子頁面

| 頁面 | 說明 |
|------|-------------|
| [全域物件](./globals.md) | `console`、`Math`、`process`、計時器、`performance` |
| [console](./console.md) | 日誌：`log`、`error`、`warn`、`time`、`timeEnd`、`assert` |
| [Math](./math.md) | 常數和數學函式 |
| [std/io](./io.md) | 流：`Reader`、`Writer`、`Stream` |
| [std/fs](./fs.md) | 檔案系統：讀取、寫入、目錄 |
| [std/net](./net.md) | 網路：`fetch`、HTTP 伺服器、TCP/UDP |
| [std/ws](./ws.md) | WebSocket：用戶端和伺服器 |
| [std/string](./string.md) | Unicode、編碼、格式化 |
| [std/json](./json.md) | JSON：`parse` 和 `stringify` |
| [std/regex](./regex.md) | NFA 正規表示式 |
| [std/hal 和 embedded](./hal.md) | HAL、嵌入式模組、`std/random`、`std/temporal`、`std/reactive` |

## 參見

- [記憶體模型](../05-memory/index.md) — 所有權、`Ref<T>`、`Mut<T>`
- [錯誤處理](../06-errors/index.md) — `throws`、`try`/`catch`
- [模組](../08-modules/index.md) — `import`/`export`、`.d.tsc`、native
- [建置](../09-build/index.md) — 平台、`tsc.package.json`
