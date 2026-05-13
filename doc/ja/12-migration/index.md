# 移行：TypeScript → TSClang

[上へ](../index.md) | [次へ](./automatic.md)

---

TypeScript から TSClang への移行を行う開発者向けガイド。自動変換と手動変換、互換性のないパターン、および新機能について説明します。

## プロセスの概要

TSClangは TypeScript 構文との最大限の互換性を目指しています。ほとんどの TypeScript コードは変更なし、または最小限の編集で移植できます。移行プロセスは3段階に分かれています：

1. **自動修正** — `tsclang migrate` が機械的な変換を適用
2. **手動修正** — 安全に自動化できないパターン
3. **互換性のないパターン** — 直接の類似物がない構造で、再設計が必要

## クイックチェック

```bash
tsclang migrate ./src            # dry-run: 変更内容を表示
tsclang migrate ./src --fix      # 自動修正を適用
tsclang migrate ./src --check    # CI: 互換性の問題があれば exit 1
```

## そのまま移行できるもの

インターフェース、型付き関数、アロー関数、クラス（`extends` なし）、ジェネリクス、`try/catch`、テンプレート文字列、分割代入 — これらすべては TypeScript と同様に動作します。詳細は [手動移行](./manual.md) を参照。

## サブページ

| ページ | 説明 |
|------|-------------|
| [自動移行](./automatic.md) | `tsclang migrate`：dry-run、--fix、--check、自動変換の一覧 |
| [手動移行](./manual.md) | そのまま動作するものと手動修正が必要なもの |
| [互換性のないパターン](./incompatible.md) | 類似物がない構造と代替案 |
| [新機能](./new-features.md) | 所有権、Ref/Mut/Shared、match、throws など |

## エラー

| エラー | 原因 |
|-------|-------|
| `undefined is not defined` | `undefined` の使用 — `null` に置き換え |
| `throw requires Error instance` | 文字列や数値の throw — `new Error()` でラップ |
| `export default is not supported` | 名前付きエクスポートに置き換え |
| `extends is not supported` | クラス継承 — コンポジションに置き換え |

## 関連項目

- [はじめに：TSClangとは](../01-intro/what-is-tsclang.md) — 言語の概要と哲学
- [ビルド：CLI](../09-build/cli.md) — `tsclang build`、`tsclang migrate` コマンド
- [メモリモデル](../05-memory/index.md) — 所有権、borrow checker、Ref/Mut/Shared
