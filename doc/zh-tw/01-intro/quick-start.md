# 快速開始

[上一級](./index.md) | [下一頁](./cli.md) | [上一頁](./design-philosophy.md)

---

## 需求

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16（用於二進位檔編譯）
- **C 編譯器** — gcc、clang 或 avr-gcc（用於 AVR）

## 安裝

```bash
npm install -g tsclang

tsclang --version
```

不安裝直接執行：

```bash
npx tsclang build
```

## 建立專案

```bash
tsclang init myapp
cd myapp
```

建立以下結構：

```
myapp/
  tsc.package.json
  src/
    main.tsc
```

`tsc.package.json`：

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc"
}
```

## Hello world

`src/main.tsc`：

```typescript
console.log("Hello world")
```

## 建置與執行

```bash
tsclang build                  # 產生 C 並編譯為二進位檔
tsclang build --emit c         # 僅產生 C（不編譯）
tsclang run                    # 建置並執行
```

建置結果：

```
dist/
  main.c              # 產生的 C 程式碼
  CMakeLists.txt      # 供手動建置
  myapp               # 二進位檔（若使用 --emit binary）
```

## 單檔建置

沒有 `tsc.package.json` 時——直接傳入檔案：

```bash
tsclang build hello.tsc
```

## 下一步

- [語法](../02-syntax/index.md) — 語言結構
- [記憶體模型](../05-memory/index.md) — 所有權、借用、`Ref<T>`
- [CLI](./cli.md) — 所有命令

## 另見

- [CLI](./cli.md) — 完整命令說明
- [建置系統](../09-build/index.md) — 設定、平台、設定檔
