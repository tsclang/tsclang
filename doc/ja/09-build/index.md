# ビルドシステム

[上へ](../index.md) | [次へ](./projects.md)

---

TSClangのビルドシステムは `.tsc` ファイルをC99にコンパイルし、CMakeを介してバイナリをビルドします。デスクトップアプリケーション、ライブラリ、ネイティブCライブラリのCラッパー、および組み込みターゲット（AVR、ARM、レトロプラットフォーム）をサポートします。

## パイプライン

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (または .hex)
              ↑                                    ↑
           tsclang build (トランスパイル)          cmake + gcc/avr-gcc
```

`outDir` の構造：

```
build/desktop/
  c/              ← 生成された .c と .h
  CMakeLists.txt
  myapp           ← バイナリ (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## クイックスタート

```bash
npm install -g tsclang   # コンパイラのインストール
tsclang init myapp       # プロジェクトの作成
cd myapp
tsclang install          # 依存関係のインストール
tsclang run              # ビルドと実行
```

## プロジェクトタイプ

| タイプ | 説明 | `"type"` | エントリーポイント |
|------|-------------|----------|-------------|
| **Executable** | アプリケーション | 未指定（デフォルト） | `"main"`（必須） |
| **TSClang library** | TSClangライブラリ | `"library"` | `index.tsc`（規約） |
| **C-wrapper** | Cライブラリのラッパー | `"library"` | `index.d.tsc` |
| **Platform profile** | プラットフォームプロファイル | `"platform"` | `index.d.tsc` |

## CLIコマンド

| コマンド | エイリアス | 説明 |
|---------|-------|-------------|
| `tsclang init` | — | 新規プロジェクトの作成 |
| `tsclang build` | `b` | プロジェクトのビルド |
| `tsclang run` | — | ビルドと実行 |
| `tsclang dev` | — | ウォッチモード |
| `tsclang install` | `i` | 依存関係のインストール |
| `tsclang update` | `u` | 依存関係の更新 |
| `tsclang remove` | `r` | 依存関係の削除 |
| `tsclang clean` | `c` | ビルド成果物の削除 |
| `tsclang lint` | `l` | フォーマットのチェック |
| `tsclang migrate` | — | TypeScript → TSClang 移行 *(ロードマップ)* |
| `tsclang lsp` | — | Language Server Protocol *(ロードマップ)* |

## サブページ

| ページ | 説明 |
|------|-------------|
| [プロジェクトタイプ](./projects.md) | Executable、library、C-wrapper、platform profile |
| [設定](./config.md) | `tsc.package.json` のフィールド、builds、platformSettings |
| [CLI](./cli.md) | build、run、init、lint、migrate、lsp コマンド |
| [パッケージマネージャー](./packages.md) | install、publish、search、workspaces、lock file |
| [組み込みビルド](./embedded.md) | AVR、ARM、レトロプラットフォーム、binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt、debug/release プロファイル、最適化 |

## C出力

```c
// build/desktop/c/main.c — src/main.tsc から生成
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## エラー

| エラー | 原因 |
|-------|-------|
| `cannot determine entry point` | executable に `"main"` フィールドが指定されていない |
| `unknown target arch '6502'` | プラットフォームプロファイルなしの不明なアーキテクチャ |
| `toolchain 'avr-gcc' not found in PATH` | コンパイラがインストールされていない |
| `dependency conflict` | 互換性のない semver 制約 |

## 関連項目

- [モジュール：インポート/エクスポート](../08-modules/import-export.md) — エントリーポイントと初期化
- [メモリ：所有権](../05-memory/ownership-types.md) — FFI時の owned/borrow
- [並行性](../07-concurrency/index.md) — 非同期ランタイム：libuv、cooperative、none
