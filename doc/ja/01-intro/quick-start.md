# クイックスタート

[← 上へ](./index.md) | [次へ →](./cli.md) | [前へ ←](./design-philosophy.md)

---

## 必要条件

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16（バイナリコンパイル用）
- **Cコンパイラ** — gcc、clang、または avr-gcc（AVR用）

## インストール

```bash
npm install -g tsclang

tsclang --version
```

インストールなしで実行:

```bash
npx tsclang build
```

## プロジェクトの作成

```bash
tsclang init myapp
cd myapp
```

以下の構造が作成されます:

```
myapp/
  tsc.package.json
  src/
    main.tsc
```

`tsc.package.json`:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc"
}
```

## Hello world

`src/main.tsc`:

```typescript
console.log("Hello world")
```

## ビルドと実行

```bash
tsclang build                  # Cを生成 + バイナリにコンパイル
tsclang build --emit c         # C生成のみ（コンパイルなし）
tsclang run                    # ビルドして実行
```

ビルド結果:

```
dist/
  main.c              # 生成されたCコード
  CMakeLists.txt      # 手動ビルド用
  myapp               # バイナリ（--emit binary の場合）
```

## 単一ファイルのビルド

`tsc.package.json` なし — ファイルを直接指定します:

```bash
tsclang build hello.tsc
```

## 次のステップ

- [構文](../02-syntax/index.md) — 言語構文
- [メモリモデル](../05-memory/index.md) — 所有権、借用、`Ref<T>`
- [CLI](./cli.md) — すべてのコマンド

## 関連項目

- [CLI](./cli.md) — コマンドの完全な説明
- [ビルドシステム](../09-build/index.md) — 設定、プラットフォーム、プロファイル
