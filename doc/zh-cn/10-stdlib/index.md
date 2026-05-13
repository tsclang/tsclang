# 标准库

[← 上一级](../index.md) | [下一页 →](./globals.md)

---

TSClang 标准库是一组具有统一命名空间 `std/` 的模块。所有模块都可通过 `import { ... } from "std/<module>"` 使用。

## 原则

| 原则 | 说明 |
|-----------|-------------|
| **统一 API** | 所有内容都通过 `std/`，不公开划分为不同层级 |
| **懒加载** | 编译器按需加载模块，不会在启动时解析整个 `std/` |
| **摇树优化** | 只有被使用的代码会进入二进制文件 |

```typescript
import { parse } from "std/json"   // 正确
import { serve } from "std/net"    // 正确
import { Regex } from "std/regex"  // 正确
```

`@tsc/*` 包 — 仅限 C 包装器，不是 stdlib 模块：

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // 正确 — C 包装器
import { parse } from "@tsc/json"            // 错误 — 请使用 std/json
```

## 短导入

所有 `std/` 模块都可以无前缀导入：

```typescript
import { Thread } from "std/threads"   // 显式形式（推荐）
import { Thread } from "threads"       // 短形式
```

解析顺序：`./name.tsc` → `std/name` → 错误。

## 平台兼容性

| 模块 | 桌面 | 嵌入式 (ARM) | 嵌入式 (AVR) | 说明 |
|--------|---------|----------------|----------------|------|
| 全局对象 | ✅ | ✅ | ✅ | `console`、`Math`、定时器 |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA，约 5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — 仅带 RNG 的嵌入式 |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM：无时钟 |
| `std/io` | ✅ | ❌ | ❌ | 需要堆和操作系统 |
| `std/fs` | ✅ | ❌ | ❌ | 需要文件系统 |
| `std/net` | ✅ | ❌ | ❌ | 需要 TCP/IP 协议栈 |
| `std/ws` | ✅ | ❌ | ❌ | 基于 `std/net` |
| `std/threads` | ✅ | ❌ | ❌ | 需要操作系统线程 |
| `std/reactive` | ✅ | ❌ | ❌ | 基于 `std/threads` |
| `std/hal` | ✅ | ✅ | ✅ | GPIO、UART、SPI、I2C；桌面 — 模拟 |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`、`pointer<T>`、`HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | 无操作系统的原子操作 |
| `std/avr` | ❌ | ✅ | ✅ | AVR 专用 |

**图例：** ✅ — 完全支持，🟡 — 部分支持，❌ — 不可用。

编译器在导入时检查兼容性：

```typescript
// target: avr
import { readFile } from "std/fs"   // 错误：std/fs 在 AVR 上不受支持
import { gpio } from "std/embedded"  // 正确
```

## 子页面

| 页面 | 说明 |
|------|-------------|
| [全局对象](./globals.md) | `console`、`Math`、`process`、定时器、`performance` |
| [console](./console.md) | 日志：`log`、`error`、`warn`、`time`、`timeEnd`、`assert` |
| [Math](./math.md) | 常量和数学函数 |
| [std/io](./io.md) | 流：`Reader`、`Writer`、`Stream` |
| [std/fs](./fs.md) | 文件系统：读取、写入、目录 |
| [std/net](./net.md) | 网络：`fetch`、HTTP 服务器、TCP/UDP |
| [std/ws](./ws.md) | WebSocket：客户端和服务器 |
| [std/string](./string.md) | Unicode、编码、格式化 |
| [std/json](./json.md) | JSON：`parse` 和 `stringify` |
| [std/regex](./regex.md) | NFA 正则表达式 |
| [std/hal 和 embedded](./hal.md) | HAL、嵌入式模块、`std/random`、`std/temporal`、`std/reactive` |

## 参见

- [内存模型](../05-memory/index.md) — 所有权、`Ref<T>`、`Mut<T>`
- [错误处理](../06-errors/index.md) — `throws`、`try`/`catch`
- [模块](../08-modules/index.md) — `import`/`export`、`.d.tsc`、native
- [构建](../09-build/index.md) — 平台、`tsc.package.json`
