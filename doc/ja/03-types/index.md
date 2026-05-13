# 型システム

[上へ](../index.md) | [次へ](./numbers.md)

---

TSClangの型システムは静的で、型推論と3つの安全性レベルを持ちます：コンパイル時チェック、所有権/借用チェッカー、およびオプションのARC。

## 型付けの2つのレベル

TSClangは型を**構造的**と**名目的**に分けます：

| 構文 | 型付け | オブジェクトリテラル | C出力 |
|-----------|--------|-----------------|----------|
| `type Foo = { ... }` | 構造的 | ✅ | `typedef struct`、メソッド禁止 |
| `interface Foo { ... }` | 構造的 | ✅（メソッドがない場合） | `typedef struct` または fat pointer + vtable |
| `class Foo { ... }` | **名目的** | ❌ | struct + メソッド |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // ok — 構造的互換性
const v: Vector = p                     // ok — 同じフィールド

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // error — クラスは名目的
```

`type` と `interface` の主な違い：
- `type Point = { x: f64; y: f64 }` — vtableなしのデータ構造が**保証される**。メソッドはコンパイルエラーで禁止される。組み込みのMMIO、バイナリ構造体、ABIが重要なコードに使用。
- `interface Point { x: f64; y: f64 }` — 現時点ではデータ構造だが、将来メソッドで拡張可能（その際ABIはvtableに切り替わる）。

## 型推論

明示的に指定されない場合、型は推論されます：

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — 匿名構造体
const s = "hello"            // → string
const n = 42                 // → number (= f64 on desktop)
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[] (= f64[])
```

明示的なアノテーションが優先されます：`const i: i32 = 1` → `i32`。

## 数値型の自動キャスト

3つのメカニズムが順次適用されます。最初に該当するものが適用されます。

### メカニズム1 — 型レベルの拡張（letおよびconst）

型にのみ作用し、値は見ません。無条件に安全です。

| From | To | コメント |
|------|-----|---------|
| `i8`/`i16`/`i32` | `i64` | 同符号、損失なし |
| `u8`/`u16`/`u32` | `u64` | 同符号、損失なし |
| `u8` | `i16` | 256値すべてが収まる |
| `u16` | `i32` | 65,536が収まる |
| `u32` | `i64` | 43億が収まる |
| `i32`, `u32` | `f64` | 損失なし（53ビット仮数） |
| `f32` | `f64` | 損失なし |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32は常にi64に収まる
```

### メカニズム2 — コンパイル時値解析（constのみ）

両方のオペランドが既知のリテラル値を持つ`const`であり、メカニズム1が適用されない場合。ステップバイステップのアルゴリズム — [数値型 → 自動キャスト](./numbers.md)を参照。

### メカニズム3 — 明示的な `as`（letの場合）

メカニズム1が`let`変数に適用されない場合 — 明示的なキャストが必要です：

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // error — 型レベルの拡張なし
let c: f64 = (a + (b as i64)) as f64  // ok
```

各メカニズムの詳細 — [数値型](./numbers.md)のページを参照。

## サブページ

| ページ | 説明 |
|------|-------------|
| [数値型](./numbers.md) | i8..i64, u8..u64, f32, f64, usize, number, 自動キャスト, `as` |
| [文字列](./strings.md) | UTF-8文字列、リテラル、メソッド、std/string |
| [特殊型](./special-types.md) | any, never, void, unknown |
| [Null](./null.md) | Nullable型、オプショナルチェイン、`??` |
| [配列](./arrays.md) | 動的、固定、Slice<T> |
| [MapとSet](./map-set.md) | ハッシュテーブルとセット |
| [タプル](./tuples.md) | タプル、ラベル付き、readonly、optional、rest |
| [Clone](./clone.md) | 所有値の明示的なクローン |
| [型エイリアス](./type-aliases.md) | `type`、opaqueエイリアス、String Literal Union |
| [ユーティリティ型](./utility-types.md) | Partial, Required, Readonly, Pick, Omit, Record, etc. |
| [Date](./date.md) | レガシーJS互換の日付/時刻型 |

## エラー

| エラー | 原因 |
|-------|-------|
| `expected f64, got i32` | 自動キャストなしの互換性のない数値型 |
| `empty object literal is forbidden` | 空の `{}` — `Map<K,V>` を使用するか型を宣言 |
| `cannot use "void" as variable type` | `void` は関数の戻り値の型のみ |
| `non-nullable runtime union: string \| i32` | Non-nullableなunionは禁止、interfaceまたは判別unionを使用 |

## 関連項目

- [変数: let / const](../02-syntax/variables/index.md) — `let`/`const` が型と自動キャストに与える影響
- [メモリモデル](../05-memory/index.md) — 所有権、`Ref<T>`、`Mut<T>`
- [クラスとインターフェース](../04-classes/index.md) — 名目的型付け、ジェネリック
- [エラー処理](../06-errors/index.md) — `throws`、`T \| null` と `T throws E`
