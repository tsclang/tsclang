# TSClang入門

[← 上へ](../index.md) | [次へ →](./what-is-tsclang.md)

---

TSClangはTypeScript構文を持ち、Cにコンパイルされる言語です。

- **TypeScriptを構文として** — 馴染みのある `let`/`const`、クラス、アロー関数、`async`/`await`
- **Cをコンパイルターゲットとして** — 読みやすいCコード + `CMakeLists.txt` が生成されます
- **Rustを安全性モデルとして** — 所有権、借用チェッカー、`Ref<T>`、`Mut<T>`
- **npmをエコシステム体験として** — `tsc.package.json`、`tsclang install`、パッケージレジストリ

## セクション

- [TSClangとは](./what-is-tsclang.md) — なぜ、誰のために、ユースケース
- [設計哲学](./design-philosophy.md) — 3つの優先事項: 安全性、パフォーマンス、TS構文
- [クイックスタート](./quick-start.md) — インストール、hello world、ビルドと実行
- [CLI](./cli.md) — コマンド概要: `build`、`init`、`lint`、`migrate`、`lsp`

## 関連項目

- [構文](../02-syntax/index.md) — 言語構文
- [メモリモデル](../05-memory/index.md) — 所有権と借用チェッカー
