# 模組系統

[← 上一級](../index.md) | [下一頁 →](./import-export.md)

---

TSClang 採用與 TypeScript 語法相容的**模組系統**：命名 `export` / `import { } from ""`。一個檔案 = 一個模組。編譯器會自動在 C 輸出中生成 `#include`、前置宣告和初始化函式。

## 原則

- **一個檔案 — 一個模組** — 沒有 `namespace`，沒有 `module`
- **僅命名匯出** — 禁止使用 `export default`（C 要求每個符號必須有顯式名稱）
- **允許循環匯入** — 編譯器在 `.h` 中生成前置宣告
- **`.d.tsc` 檔案** — 用於 C 互操作的宣告（類似 TypeScript 中的 `.d.ts`）
- **路徑別名** — 使用 `#/`、`~/` 短名稱代替 `../../../`

## 匯入與匯出

```typescript
// math.tsc — 帶有匯出的模組
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — 匯入
import { PI, add } from "./math"
console.log(add(1, 2))
```

## 入口點

入口點由 `tsc.package.json` 中的 `"main"` 欄位定義。入口檔案的頂層程式碼將成為 C 中 `main()` 的函式本體：

```typescript
const a: i32 = 1
console.log(a)
```

```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

## 模組初始化

編譯器建構依賴圖並執行**拓撲排序**。每個帶有模組級變數的模組都會獲得一個 `_init()` 函式。最終生成一個按正確呼叫順序排列的 `tsc_init_all()`。

## C 互操作性

為了與 C 函式庫互動，TSClang 提供了幾種機制：

| 機制 | 用途 |
|----------|------------|
| `.d.tsc` | C 型別、函式、常數的宣告 |
| `native` | 內嵌 C 程式碼（原文插入） |
| `unsafe {}` | 禁用借用/型別檢查器 |
| `FnPtr<T>` | 用於 C 回呼的函式指標 |
| `@platform` | 按平台的條件編譯 |

## 子頁面

| 頁面 | 說明 |
|----------|----------|
| [匯入 / 匯出](./import-export.md) | 命名匯出/匯入、命名空間匯入、`import type`、初始化、循環匯入、路徑別名 |
| [.d.tsc 檔案](./d-tsc.md) | 用於 C 互操作的宣告：結構、不透明型別、函式、常數、MMIO |
| [native — 內嵌 C](./native.md) | 語法、插值、限制、組譯插入 |
| [unsafe {} — 禁用檢查](./unsafe.md) | 何時使用、禁用什麼、與 `native` 的區別 |
| [回呼和 FnPtr\<T\>](./callbacks.md) | 函式指標、TSC_CLOSURE_* 巨集、閉包橋接 |
| [@platform — 條件編譯](./platform.md) | 平台相關實作、套件結構 |

## C 輸出

```c
// 編譯多個模組的結果
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... main.tsc 的頂層程式碼 ...
    return 0;
}
```

## 錯誤

| 錯誤 | 原因 |
|--------|---------|
| `cannot determine entry point` | `tsc.package.json` 中缺少 `"main"` 欄位 |
| `main file not found: src/main.tsc` | `"main"` 指定的檔案不存在 |
| `circular initialization dependency detected` | 模組級變數之間存在循環依賴 |
| `export default is not allowed` | 嘗試使用預設匯出 |
| `native block — C code inserted verbatim` | 每個 `native` 區塊的警告 |

## 參見

- [語法：變數](../02-syntax/variables/index.md) — 模組級變數
- [記憶體：所有權](../05-memory/ownership-types.md) — 在模組間傳遞時的 owned/borrow
- [並發](../07-concurrency/index.md) — 模組級變數的執行緒安全
