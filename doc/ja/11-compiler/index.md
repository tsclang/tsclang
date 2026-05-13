# コンパイラアーキテクチャ

[上へ](../index.md) | [次へ](./phases.md)

---

TSClangコンパイラのアーキテクチャ（貢献者向け）。コンパイラは `.tsc` をC99に翻訳し、機械語最適化をCコンパイラ（gcc/clang/avr-gcc）に委譲します。

## パイプライン

```
.tsc ソース
    ↓
Parse (lexer + parser)      →  AST
    ↓
Decorator pass              →  変更後の AST
    ↓
Typecheck                   →  型付き AST
    ↓
Lower to IR                 →  SSA-like IR (基本ブロック)
    ↓
Ownership Analysis          →  borrow checker + ARC 挿入
    ↓
Codegen                     →  C99 + #line + CMakeLists.txt
    ↓
C compiler                  →  binary / .hex
```

## ソースコード

| パス | 目的 |
|------|---------|
| `src/compiler/lexer.js` | Lexer |
| `src/compiler/parser.js` | Parser → AST |
| `src/compiler/types.js` | ヘルパー型とマングリング |
| `src/compiler/codegen.js` | Codegen エントリーポイント、Context クラス |
| `src/compiler/codegen/top-level/` | クラス、関数、インターフェース、enum、型エイリアス |
| `src/compiler/codegen/stmt/` | 変数宣言、制御フロー、分割代入、match |
| `src/compiler/codegen/expr/` | 式ディスパッチャー、演算子、代入、リテラル |
| `src/compiler/codegen/calls/` | 呼び出し：メソッド、console、stdlib、builtin、変換、並行性 |
| `src/compiler/codegen/types/` | 型解決、推論、ヘルパー |
| `src/compiler/codegen/misc/` | ヘルパー、new-expr、クロージャ、配列 |
| `src/compiler/codegen/async/` | Async：ステートメント、emit、ジェネレーター、ヘルパー、スキャン |
| `src/compiler/codegen/generics.js` | ジェネリックの単相化 |
| `src/runtime/runtime.h` | Cランタイムヘッダーファイル |

## テスト手法

各コンポーネントは以下のサイクルで実装されます：

```
1. Tests     — コーパス (input.tsc → expected.c / expected.error)
2. Implementation — すべてのテストが通るまで
3. Log       — log/<component>.md: 決定事項、問題、変更
```

テストコーパス: `test/cases/phase0–phase19`、合計 1028 テスト。形式は `test/CORPUS.md` に記載。

## サブページ

| ページ | 説明 |
|------|-------------|
| [コンパイルフェーズ](./phases.md) | Parse → AST → Decorator → Typecheck → IR → Ownership → Codegen |
| [名前マングリング](./name-mangling.md) | 正式な方式、型エンコーディング、モジュールスラッグ、衝突 |
| [デバッグ情報](./debug.md) | `#line` ディレクティブ、DAPサーバー、組み込みデバッグ |
| [最適化](./optimization.md) | レベル O0–O3/Os、利用者側単相化、増分 *(ロードマップ)* |

## エラー

| エラー | 原因 |
|-------|-------|
| `type name must start with uppercase letter` | クラス/インターフェース名が PascalCase でない |
| `type name uses reserved mangling prefix` | 型名に `ref_`、`mut_`、`arc_`、`opt_`、`arr_` を使用 |
| `error[TSC-EXXX]` | 安定したエラーコード — ドキュメントで検索可能 |

## 関連項目

- [デコレーター](../04-classes/decorators.md) — デコレーターパス：アルゴリズムと制限
- [メモリモデル](../05-memory/index.md) — 所有権、borrow checker、IR命令
- [ビルドシステム](../09-build/index.md) — CMake、プロファイル、組み込みターゲット
