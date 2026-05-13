# 構文

[上へ](../index.md) | [次へ](./formatting.md)

---

TSClang構文の完全な解説。この言語はTypeScript/JavaScriptの慣習に従い、安全なメモリ管理のための拡張が加えられています。

## セクション

### 基本
- [Formatting](./formatting.md) — セミコロン、インデント、引用符、リンター
- [Truthy / Falsy](./truthy-falsy.md) — どの値が真/偽と見なされるか

### 変数
- [let / const](./variables/index.md) — 可変性、所有権の違い

### 関数
- [Declaration](./functions/declaration.md) — `function`、パラメータ、戻り値の型
- [Arrow](./functions/arrow.md) — `=>` 構文
- [Overloading](./functions/overload.md) — 型とパラメータ数によるオーバーロード
- [Default Parameters](./functions/default-params.md) — デフォルト値

### 演算子
- [Arithmetic](./operators/arithmetic.md) — `+`、`-`、`*`、`/`、`%`、`**`
- [Assignment](./operators/assignment.md) — `=`、`+=`、`-=` など
- [Comparison](./operators/comparison.md) — `==`、`!=`、`===`、`!==`
- [Logical](./operators/logical.md) — `&&`、`||`、`!`、`??`
- [Bitwise](./operators/bitwise.md) — `&`、`|`、`^`、`~`、`<<`、`>>`
- [Optional](./operators/optional.md) — `?.`、`??`、スプレッド `...`
- [Operator Precedence](./operators/precedence.md) — 優先順位表

### ループ
- [for](./loops/for.md) — クラシックなループ
- [for-of](./loops/for-of.md) — コレクションの反復
- [while / do-while](./loops/while.md) — 条件ループ
- [break / continue](./loops/break-continue.md) — 反復制御

### フロー制御
- [switch](./match/switch.md) — 値の選択
- [match](./match/index.md) — パターンマッチング

### スライス
- [Indexing and Slices](./slices.md) — `[]`、`[a..b]`、負のインデックス

## 関連項目

- [型](../03-types/index.md) — 型システム
- [メモリ](../05-memory/index.md) — 所有権と借用チェッカー
