# TSClang 簡介

[上一級](../index.md) | [下一頁](./what-is-tsclang.md)

---

TSClang 是一種具備 TypeScript 語法並編譯至 C 的語言。

- **TypeScript 作為語法** — 熟悉的 `let`/`const`、類別、箭頭函式、`async`/`await`
- **C 作為編譯目標** — 產生可讀的 C 程式碼與 `CMakeLists.txt`
- **Rust 作為安全模型** — 所有權、借用檢查、`Ref<T>`、`Mut<T>`
- **npm 作為生態系體驗** — `tsc.package.json`、`tsclang install`、套件註冊表

## 章節

- [什麼是 TSClang](./what-is-tsclang.md) — 為何誕生、適用對象、使用案例
- [設計哲學](./design-philosophy.md) — 三個優先順序：安全性、效能、TS 語法
- [快速開始](./quick-start.md) — 安裝、Hello world、建置與執行
- [CLI](./cli.md) — 命令概覽：`build`、`init`、`lint`、`migrate`、`lsp`

## 另見

- [語法](../02-syntax/index.md) — 語言結構
- [記憶體模型](../05-memory/index.md) — 所有權與借用檢查
