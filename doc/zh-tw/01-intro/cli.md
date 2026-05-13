# CLI — 命令概覽

[上一級](./index.md) | [上一頁](./quick-start.md)

---

## 命令列表

| 命令 | 別名 | 說明 |
|---------|-------|-------------|
| `tsclang init` | — | 建立新專案 |
| `tsclang build` | `b` | 建置專案 |
| `tsclang run` | `r` | 建置並執行 |
| `tsclang lint` | `l` | 檢查格式 |
| `tsclang migrate` | — | TypeScript → TSClang 遷移 *(路線圖)* |
| `tsclang lsp` | — | IDE 的語言伺服器協定 *(路線圖)* |

別名：

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

從範本建立專案。

```bash
tsclang init myapp                    # 可執行檔（預設）
tsclang init mylib --library          # TSClang 函式庫
tsclang init sqlite3 --declaration    # C 包裝器（C 函式庫的包裝）
tsclang init                          # 在目前目錄
```

短旗標：`-l`（函式庫）、`-d`（宣告）。

## tsclang build

將 `.tsc` 編譯為 `.c` → 二進位檔（預設）。

```bash
tsclang build                  # 建置預設建置項目
tsclang build <name>           # 從設定建置特定項目
tsclang build hello.tsc        # 單一檔案
tsclang build --emit c         # 僅產生 C
tsclang build --emit binary    # C + 編譯為二進位檔（預設）
tsclang build --emit hex       # C + avr-gcc → .hex（用於 AVR）
tsclang build --outDir ./dist  # 覆寫 outDir
tsclang build --target desktop # 明確指定目標
tsclang build --clean          # 完整重建（無快取）
```

## tsclang run

建置並執行二進位檔。等同於 `tsclang build` + 執行。

```bash
tsclang run
tsclang run -- args...         # 傳遞引數給程式
```

僅適用於 `emit: "binary"`。

## tsclang lint

檢查程式碼風格。用於 CI 時——`tsclang lint`（不含 `-fix`）若違規則回傳結束碼 1。

```bash
tsclang lint          # 檢查但不修改
tsclang lint --fix    # 就地格式化程式碼（類似 prettier / gofmt）
```

與 `tsclang build` 的差異：

| 命令 | 檢查內容 |
|---------|---------------|
| `tsclang build` | 語意錯誤，忽略格式 |
| `tsclang lint` | 語意 + 風格警告，違規則結束碼 1 |
| `tsclang lint --fix` | 自動格式化程式碼 |

## tsclang migrate *(路線圖)*

將 TypeScript 程式碼遷移至 TSClang。

```bash
tsclang migrate ./src            # 顯示將會變更的內容（乾跑）
tsclang migrate ./src --fix      # 套用變更
tsclang migrate ./src --check    # CI 模式：若存在不相容性則結束碼 1
```

## tsclang lsp *(路線圖)*

IDE（VS Code、Neovim 等）的語言伺服器協定。

```bash
tsclang lsp               # stdio 傳輸
tsclang lsp --port 7777   # TCP 傳輸
```

## 另見

- [快速開始](./quick-start.md) — 安裝與第一個專案
- [建置系統](../09-build/index.md) — 設定、設定檔、平台
- [遷移指南](../12-migration/index.md) — 移植 TS 程式碼
