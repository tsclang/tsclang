# メモリモデル

[上へ](../index.md) | [次へ](./ownership-types.md)

---

TSClangは**ハイブリッドなメモリ管理モデル**を採用しています：静的な所有権/借用チェッカーに加え、オプションでARCを使用します。GCはなく、手動の `free` も必要ありません。

## 原則

コンパイラは各値の所有者を静的に追跡します。メモリの解放は決定論的に行われ、所有者のスコープ終了時に行われます。静的解析では不十分なケース（グラフ、循環参照）では — `Shared<T>` とアトミックな参照カウント（ARC）を使用します。

## 所有権の型

| 型 | セマンティクス | 説明 |
|------|-----------|-------------|
| `T` | **所有者** | 完全な所有権、転送時にムーブ |
| `Ref<T>` | **不変借用** | 読み取り専用、変更や削除は不可 |
| `Mut<T>` | **可変借用** | 読み書き可能、`Mut` は同時に1つのみ |
| `Shared<T>` | **ARC** | 強い参照、参照カウントを増加、デスクトップのみ |
| `Weak<T>` | **弱い参照** | 参照カウントを増加させない、循環を破壊 |
| `Slice<T>` | **借用された配列ビュー** | ゼロコピーの部分範囲、ポインタ + 長さ |

## 基本ルール

- **プリミティブ型** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — 常に**コピー**され、借用チェッカーの対象外です
- **複合型**（配列、オブジェクト、文字列、クラス）— 所有権システムによって管理されます
- `string` — ヒープに割り当てられた所有者、`Ref<string>` として渡され、`clone()` でコピーされます

## 借用チェッカー

**エイリアシングと可変性の排他**ルール：2つの `Mut` を同時に使用することはできません、`Mut` + `Ref` もできませんが、複数の `Ref` を同時に使用することは可能です。

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // ok — 複数のRefが許可される
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // error: 既にアクティブなMutが存在します
```

## 自動ドロップ

コンパイラは所有者のスコープ終了時に `free()` を挿入します。複数の `return` や `throw` がある場合 — `goto cleanup` によって単一のクリーンアップポイントとします：

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... work ...
cleanup:
    if (u) User_free(u);
}
```

## サブページ

| ページ | 説明 |
|------|-------------|
| [所有権の型](./ownership-types.md) | すべての所有権型とそのCでの表現の概要 |
| [所有者 (T)](./owner.md) | 完全な所有権、代入と転送時のムーブ |
| [Ref<T>](./ref.md) | 不変借用、ビューパターン |
| [Mut<T>](./mut.md) | 可変借用、排他性ルール |
| [Shared<T> と Weak<T>](./shared.md) | グラフと循環参照のためのARCと弱い参照 |
| [Slice<T>](./slice.md) | 配列や文字列の一部に対するゼロコピービュー |
| [借用チェッカー](./borrow-checker.md) | エイリアシングルール、ライフタイム、スコープ制約 |
| [Drop とクリーンアップ](./drop.md) | 自動解放、`goto cleanup` |
| [構造化束縛](./destructuring.md) | フィールドの分解時の借用とムーブ |
| [クロージャ](./closures.md) | キャプチャルール：コピー、Ref、Mut、ムーブ |
| [イテレータ](./iterators.md) | `Iterable<T>`、プル型のスタックイテレータ |

## C出力

```typescript
let user = new User();
user.name = "Alice";
// end of scope — User_free called automatically
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... usage ...
User_free(&user);   // inserted by compiler
```

## エラー

| エラー | 原因 |
|-------|-------|
| `use of moved value: "x"` | ムーブ後の変数へのアクセス |
| `already borrowed as Mut` | `Mut` がアクティブな間に2つ目の `Mut` または `Ref` |
| `already borrowed as Ref` | `Ref` がアクティブな間に `Mut` |
| `Ref<T> not allowed in class field` | クラスのフィールドに借用を保存しようとした |
| `cannot move out of array by index` | `.remove()` なしで所有型の `arr[i]` |

## 関連項目

- [変数：let / const](../02-syntax/variables/index.md) — `let`/`const` が `Mut<T>` / `Ref<T>` に与える影響
- [関数](../02-syntax/functions/declaration.md) — 引数渡しのルール
- [クラス](../04-classes/index.md) — `mut` メソッドと `readonly` フィールド
- [エラー](../06-errors/index.md) — `throw` / `?` における `goto cleanup`
