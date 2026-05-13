# クラスとオブジェクトシステム

[上へ](../index.md) | [次へ](./classes.md)

---

TSClangのオブジェクトシステムは、継承ではなく合成、クラスの公称的型付け、インターフェースの構造的型付けを基本としています。ジェネリックは単相化され、具体的な型ごとに別々のCコードが生成されます。

## 主な原則

- **継承はありません** — エラーの階層構造のための `extends Error` のみが許可されます。多態性は `interface` + `implements` で実現します。
- **合成** — `class Dog extends Animal` の代わりに `class Dog { animal: Animal }` を使用します。
- **所有権が統合されています** — `mut` や `move` メソッド修飾子が `this` のセマンティクスを制御します。
- **ジェネリックは単相化されます** — `Stack<i32>` と `Stack<User>` は別々のC関数を生成します。
- **デコレーターはコンパイル時に処理されます** — 型チェックの前にASTを変換し、実行時オーバーヘッドはゼロです。

## サブページ

| ページ | 説明 |
|------|-------------|
| [クラス](./classes.md) | 定義、修飾子、`this` のセマンティクス、`readonly`、コンストラクタ、値オブジェクト、ビルダー |
| [インターフェース](./interfaces.md) | データインターフェースとコントラクト、ファットポインタvtable、`instanceof`、構造的互換性 |
| [列挙型](./enum.md) | 数値、文字列、`const enum`、ユーティリティ、`match` での網羅性 |
| [ジェネリック](./generics.md) | 構文、境界 (`implements`/`extends`)、単相化、ジェネリックと所有権 |
| [デコレーター](./decorators.md) | `decorator function`、Descriptor API、`@packed`、`@align`、`@static`、`@embedded.*`、`@signal`、`@platform` |

## 拡張メソッド

TSClangは拡張メソッドをサポートしています — 定義を変更せずに既存の型にメソッドを追加できます。明示的にインポートされ、グローバルスコープを汚染しません。

```typescript
export extension function charCount(this: string): i32 {
    // count codepoints
}

import { charCount } from "std/string"
"привет".charCount()   // ok
```

C出力 — 静的呼び出し、オーバーヘッドゼロ：

```c
int32_t n = tsc_std_string_charCount(s);
```

既存のメソッドと競合する拡張メソッド — コンパイルエラーです。異なるモジュールから同じ名前の拡張メソッドが2つある場合 — `import { format as fmtA } from "./module-a"` で解決します。

## エラー

| エラー | 原因 |
|-------|-------|
| `extends is only allowed for Error` | 任意のクラスからの継承を試みた |
| `extension 'format' conflicts with existing method` | 既存のメソッドと同名の拡張メソッド |
| `ambiguous extension 'format' for type 'string'` | 同じ名前の拡張メソッドが2つインポートされている |

## 関連項目

- [メモリモデル](../05-memory/index.md) — 所有権、`Ref<T>`、`Mut<T>`、ムーブセマンティクス
- [型システム](../03-types/index.md) — 構造的型付けと公称的型付け
- [エラー処理](../06-errors/index.md) — `extends Error`、`throws`、`try/catch`
- [仕様：クラス](../../spec/04-classes.md) — オブジェクトシステムの完全な説明
