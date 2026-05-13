# モジュールシステム

[上へ](../index.md) | [次へ](./import-export.md)

---

TSClangは、構文においてTypeScriptと互換性のある**モジュールシステム**を採用しています。名前付き `export` / `import { } from ""`。1ファイル = 1モジュール。コンパイラはC出力に `#include`、前方宣言、初期化関数を自動生成します。

## 原則

- **1ファイル — 1モジュール** — `namespace`、`module` はなし
- **名前付きエクスポートのみ** — `export default` は禁止（Cでは各シンボルに明示的な名前が必要）
- **循環インポートを許可** — コンパイラは `.h` に前方宣言を生成
- **`.d.tsc` ファイル** — C相互運用のための宣言（TypeScriptにおける `.d.ts` に相当）
- **パスエイリアス** — `../../../` の代わりに短い名前 `#/`、`~/`

## インポートとエクスポート

```typescript
// math.tsc — エクスポートを持つモジュール
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — インポート
import { PI, add } from "./math"
console.log(add(1, 2))
```

## エントリーポイント

エントリーポイントは `tsc.package.json` の `"main"` フィールドで定義されます。エントリファイルのトップレベルコードは、Cの `main()` の本体になります：

```typescript
const a: i32 = 1
console.log(a)
```

```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

## モジュールの初期化

コンパイラは依存関係グラフを構築し、**トポロジカルソート**を実行します。モジュールレベルの変数を持つ各モジュールは `_init()` 関数を取得します。結果は正しい呼び出し順序を持つ単一の `tsc_init_all()` になります。

## C相互運用

Cライブラリとの連携のために、TSClangはいくつかのメカニズムを提供します：

| メカニズム | 目的 |
|----------|------------|
| `.d.tsc` | Cの型、関数、定数の宣言 |
| `native` | インラインCコード（逐語的） |
| `unsafe {}` | 借用/型チェッカーの無効化 |
| `FnPtr<T>` | Cコールバックのための関数ポインタ |
| `@platform` | プラットフォームごとの条件付きコンパイル |

## サブページ

| ページ | 説明 |
|----------|----------|
| [インポート / エクスポート](./import-export.md) | 名前付きエクスポート/インポート、名前空間インポート、`import type`、初期化、循環インポート、パスエイリアス |
| [.d.tsc ファイル](./d-tsc.md) | C相互運用のための宣言：struct、opaque型、関数、定数、MMIO |
| [native — インラインC](./native.md) | 構文、補間、制限、アセンブリ挿入 |
| [unsafe {} — チェックの無効化](./unsafe.md) | 使用する場面、無効化されるもの、`native` との違い |
| [コールバックと FnPtr\<T\>](./callbacks.md) | 関数ポインタ、TSC_CLOSURE_* マクロ、クロージャブリッジ |
| [@platform — 条件付きコンパイル](./platform.md) | プラットフォーム依存実装、パッケージ構造 |

## C出力

```c
// 複数モジュールのコンパイル結果
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... main.tsc のトップレベルコード ...
    return 0;
}
```

## エラー

| エラー | 原因 |
|--------|---------|
| `cannot determine entry point` | `tsc.package.json` に `"main"` フィールドがない |
| `main file not found: src/main.tsc` | `"main"` で指定されたファイルが存在しない |
| `circular initialization dependency detected` | モジュールレベルの変数を介した循環 |
| `export default is not allowed` | デフォルトエクスポートの使用を試みた |
| `native block — C code inserted verbatim` | 各 `native` ブロックに対する警告 |

## 関連項目

- [構文：変数](../02-syntax/variables/index.md) — モジュールレベルの変数
- [メモリ：所有権](../05-memory/ownership-types.md) — モジュール間での受け渡し時の owned/borrow
- [並行性](../07-concurrency/index.md) — モジュールレベル変数のスレッド安全性
