# 什麼是 TSClang

[上一級](./index.md) | [下一頁](./design-philosophy.md)

---

TSClang 是一種具備 TypeScript 語法的編譯語言，將 `.tsc` 檔案翻譯成可讀的 C 程式碼，並自動產生 `CMakeLists.txt`。

## 為何誕生

許多開發者從 TypeScript 轉向 C——而這個過程很痛苦。C 缺乏完善的生態系：沒有套件管理員、沒有便捷的交叉編譯、沒有內建的記憶體安全檢查。

TSClang 解決了這些問題：

- **熟悉的語法** — TS 開發者一看就認得這些結構，能立即上手
- **安全記憶體** — 編譯期的所有權與借用檢查，無垃圾回收
- **統一生態系** — 依賴管理、交叉編譯、開箱即用的建置
- **可讀的 C 輸出** — 可供檢視、除錯，並與手寫 C 結合

## 適用對象

**現在：**

- 伺服器程式碼 — HTTP、通訊端、後端
- 桌面應用 — CLI/TUI、檔案管理員、辦公軟體

**重要：**

- 系統層級 — 驅動程式、作業系統
- 嵌入式 — Arduino、ESP、Raspberry Pi
- 遊戲 — 透過 OpenGL、DirectX

**願景：**

- 跨平台 — Windows、Linux、Mac、Android、iOS
- 復古平台 — ZX Spectrum、NES、Sega、MS-DOS

## 副檔名

`.tsc` — TSClang 原始碼檔案。

```typescript
// hello.tsc
console.log("Hello world")
```

編譯為：

```c
// hello.c
#include "runtime.h"
int main(void) {
    tsc_console_log(tsc_string_from_cstr("Hello world"));
    return 0;
}
```

## 另見

- [設計哲學](./design-philosophy.md) — 語言的三個優先順序
- [快速開始](./quick-start.md) — 安裝與第一個專案
- [記憶體模型](../05-memory/index.md) — 所有權與借用檢查
