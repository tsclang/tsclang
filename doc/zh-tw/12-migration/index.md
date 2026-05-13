# 遷移：TypeScript → TSClang

[← 上一級](../index.md) | [下一頁 →](./automatic.md)

---

面向從 TypeScript 遷移到 TSClang 的開發者的指南。介紹自動和手動轉換、不相容的模式以及新功能。

## 流程概覽

TSClang 力求與 TypeScript 語法實現最大相容性。大多數 TypeScript 程式碼無需修改或只需少量編輯即可移植。遷移過程分為三個階段：

1. **自動修復** — `tsclang migrate` 應用機械性轉換
2. **手動修復** — 無法安全自動化的模式
3. **不相容模式** — 沒有直接對應的建構，需要重新設計

## 快速檢查

```bash
tsclang migrate ./src            # 試執行：顯示將要變更的內容
tsclang migrate ./src --fix      # 應用自動修復
tsclang migrate ./src --check    # CI：如果存在不相容性則退出碼 1
```

## 無需變更即可遷移的內容

介面、帶型別的函式、箭頭函式、類別（不含 `extends`）、泛型、`try/catch`、模板字串、解構 — 所有這些都能像 TypeScript 一樣運作。詳情見 [手動遷移](./manual.md)。

## 子頁面

| 頁面 | 說明 |
|------|-------------|
| [自動遷移](./automatic.md) | `tsclang migrate`：試執行、--fix、--check、自動轉換列表 |
| [手動遷移](./manual.md) | 哪些可以原樣運作，哪些需要手動修復 |
| [不相容模式](./incompatible.md) | 沒有對應的建構和替代方案 |
| [新功能](./new-features.md) | 所有權、Ref/Mut/Shared、match、throws 等 |

## 錯誤

| 錯誤 | 原因 |
|-------|-------|
| `undefined is not defined` | 使用了 `undefined` — 取代為 `null` |
| `throw requires Error instance` | 拋出字串或數字 — 用 `new Error()` 包裝 |
| `export default is not supported` | 取代為命名匯出 |
| `extends is not supported` | 類別繼承 — 取代為組合 |

## 參見

- [簡介：什麼是 TSClang](../01-intro/what-is-tsclang.md) — 語言概覽和理念
- [建置：CLI](../09-build/cli.md) — `tsclang build`、`tsclang migrate` 命令
- [記憶體模型](../05-memory/index.md) — 所有權、借用檢查器、Ref/Mut/Shared
