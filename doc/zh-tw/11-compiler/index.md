# 編譯器架構

[← 上一級](../index.md) | [下一頁 →](./phases.md)

---

TSClang 編譯器架構，供貢獻者參考。編譯器將 `.tsc` 翻譯為 C99，將機器最佳化委託給 C 編譯器（gcc/clang/avr-gcc）。

## 編譯流程

```
.tsc 原始碼
    ↓
解析（詞法分析 + 語法分析）      →  AST
    ↓
裝飾器處理                      →  修改後的 AST
    ↓
型別檢查                        →  帶型別的 AST
    ↓
降級到 IR                       →  類 SSA IR（基本塊）
    ↓
所有權分析                      →  借用檢查器 + ARC 注入
    ↓
程式碼生成                      →  C99 + #line + CMakeLists.txt
    ↓
C 編譯器                        →  二進位 / .hex
```

## 原始碼

| 路徑 | 用途 |
|------|---------|
| `src/compiler/lexer.js` | 詞法分析器 |
| `src/compiler/parser.js` | 語法分析器 → AST |
| `src/compiler/types.js` | 輔助型別和名稱修飾 |
| `src/compiler/codegen.js` | 程式碼生成進入點，Context 類別 |
| `src/compiler/codegen/top-level/` | 類別、函式、介面、列舉、型別別名 |
| `src/compiler/codegen/stmt/` | 變數宣告、控制流、解構、match |
| `src/compiler/codegen/expr/` | 運算式分派器、運算子、賦值、字面量 |
| `src/compiler/codegen/calls/` | 呼叫：方法、console、stdlib、內建、轉換、並行 |
| `src/compiler/codegen/types/` | 型別解析、推斷、輔助函式 |
| `src/compiler/codegen/misc/` | 輔助函式、new-expr、閉包、陣列 |
| `src/compiler/codegen/async/` | 非同步：陳述式、生成、產生器、輔助函式、掃描 |
| `src/compiler/codegen/generics.js` | 泛型單態化 |
| `src/runtime/runtime.h` | C 執行時期標頭檔 |

## 測試方法

每個元件按以下週期實作：

```
1. 測試     — 語料庫（input.tsc → expected.c / expected.error）
2. 實作     — 直到所有測試通過
3. 日誌     — log/<component>.md：決策、問題、變更
```

測試語料庫：`test/cases/phase0–phase19`，共 1028 個測試。格式說明見 `test/CORPUS.md`。

## 子頁面

| 頁面 | 說明 |
|------|-------------|
| [編譯階段](./phases.md) | 解析 → AST → 裝飾器 → 型別檢查 → IR → 所有權 → 程式碼生成 |
| [名稱修飾](./name-mangling.md) | 正式方案、型別編碼、模組識別碼、衝突處理 |
| [偵錯資訊](./debug.md) | `#line` 指令、DAP 伺服器、嵌入式偵錯 |
| [最佳化](./optimization.md) | 級別 O0–O3/Os、使用者端單態化、增量編譯 *(路線圖中)* |

## 錯誤

| 錯誤 | 原因 |
|-------|-------|
| `type name must start with uppercase letter` | 類別/介面名稱不是 PascalCase |
| `type name uses reserved mangling prefix` | 在型別名稱中使用了 `ref_`、`mut_`、`arc_`、`opt_`、`arr_` |
| `error[TSC-EXXX]` | 穩定的錯誤代碼 — 可在文件中搜尋 |

## 參見

- [裝飾器](../04-classes/decorators.md) — 裝飾器處理：演算法和限制
- [記憶體模型](../05-memory/index.md) — 所有權、借用檢查器、IR 指令
- [建置系統](../09-build/index.md) — CMake、設定檔、嵌入式目標
