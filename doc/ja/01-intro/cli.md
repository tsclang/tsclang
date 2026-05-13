# CLI — コマンド概要

[← 上へ](./index.md) | [前へ ←](./quick-start.md)

---

## コマンド一覧

| コマンド | エイリアス | 説明 |
|---------|-------|-------------|
| `tsclang init` | — | 新しいプロジェクトを作成 |
| `tsclang build` | `b` | プロジェクトをビルド |
| `tsclang run` | `r` | ビルドして実行 |
| `tsclang lint` | `l` | フォーマットをチェック |
| `tsclang migrate` | — | TypeScript → TSClang移行 *(ロードマップ)* |
| `tsclang lsp` | — | IDE向けLanguage Server Protocol *(ロードマップ)* |

エイリアス:

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

テンプレートからプロジェクトを作成します。

```bash
tsclang init myapp                    # 実行ファイル（デフォルト）
tsclang init mylib --library          # TSClangライブラリ
tsclang init sqlite3 --declaration    # Cラッパー（Cライブラリのラッパー）
tsclang init                          # 現在のディレクトリに
```

短縮フラグ: `-l`（ライブラリ）、`-d`（declaration）。

## tsclang build

`.tsc` → `.c` → バイナリをコンパイルします（デフォルト）。

```bash
tsclang build                  # デフォルトビルドをビルド
tsclang build <name>           # 設定から特定のビルドをビルド
tsclang build hello.tsc        # 単一ファイル
tsclang build --emit c         # C生成のみ
tsclang build --emit binary    # C + バイナリにコンパイル（デフォルト）
tsclang build --emit hex       # C + avr-gcc → .hex（AVR用）
tsclang build --outDir ./dist  # outDirを上書き
tsclang build --target desktop # ターゲットを明示的に指定
tsclang build --clean          # 完全再ビルド（キャッシュなし）
```

## tsclang run

バイナリをビルドして実行します。`tsclang build` + 実行と同等です。

```bash
tsclang run
tsclang run -- args...         # プログラムに引数を渡す
```

`emit: "binary"` の場合のみ使用できます。

## tsclang lint

コードスタイルをチェックします。CI用 — `tsclang lint`（`-fix` なし）は違反時に終了コード1を返します。

```bash
tsclang lint          # 変更なしでチェック
tsclang lint --fix    # その場でコードをフォーマット（prettier / gofmt のような）
```

`tsclang build` との違い:

| コマンド | チェック内容 |
|---------|---------------|
| `tsclang build` | セマンティックエラー、フォーマットは無視 |
| `tsclang lint` | セマンティクス + スタイル警告、違反時に終了コード1 |
| `tsclang lint --fix` | コードを自動的にフォーマット |

## tsclang migrate *(ロードマップ)*

TypeScriptコードをTSClangに移行します。

```bash
tsclang migrate ./src            # 変更内容を表示（ドライラン）
tsclang migrate ./src --fix      # 変更を適用
tsclang migrate ./src --check    # CIモード: 非互換性があれば終了コード1
```

## tsclang lsp *(ロードマップ)*

IDE向けLanguage Server Protocol（VS Code、Neovimなど）。

```bash
tsclang lsp               # stdioトランスポート
tsclang lsp --port 7777   # TCPトランスポート
```

## 関連項目

- [クイックスタート](./quick-start.md) — インストールと最初のプロジェクト
- [ビルドシステム](../09-build/index.md) — 設定、プロファイル、プラットフォーム
- [移行ガイド](../12-migration/index.md) — TSコードの移植
