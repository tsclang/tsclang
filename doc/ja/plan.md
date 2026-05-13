# TSClang ドキュメント計画

## 目標

仕様に基づき、包括的な開発者向けドキュメントを作成します。
ドキュメントは実践的で、開発者指向（コンパイラ作者ではなく）である必要があります。

## 対象読者

1. TypeScriptから来て、TSClangでの開発を始めたい開発者
2. 組み込み開発のために言語を評価している開発者
3. 特定のAPI（文字列メソッド、所有権型、HTTPサーバーなど）を探している開発者

## 執筆原則

- 言語: 日本語
- コード例: 動作するもの、最小限のもの、コメントは日本語
- 構造: 簡単なものから複雑なものへ
- 各セクションは独立している — 単独で読むことができます
- 深く学ぶためのセクション間の相互参照

## ファイル構造

**入れ子構造:** メソッド、関数、型、および構文のそれぞれに専用のファイルを設けます。
50 KBの巨大なページは作りません。メソッドに3つの呼び出しバリエーションがある場合、それはメソッドのディレクトリ内に3つのファイルになります。

構造例:

```
doc/
  02-syntax/
    index.md                        # セクション概要 + リンク
    variables/
      let.md
      const.md
    functions/
      declaration.md
      arrow.md
      anonymous.md
      iife.md
      default-params.md
      overload.md
        by-type.md
        by-count.md
        priority.md
    loops/
      for.md
      for-of.md
      while.md
      do-while.md
      break-continue.md
    match/
      syntax.md
      patterns/
        literal.md
        range.md
        destructuring.md
        wildcard.md
        union.md
      exhaustiveness.md
      vs-switch.md
    operators/
      arithmetic.md
      assignment.md
      comparison.md
      logical.md
      bitwise.md
      ternary.md
      optional-chaining.md
      nullish-coalescing.md
      spread.md
    truthy-falsy.md
    slices.md
```

## ファイル内容のルール

各ファイルは**1つ**のメソッド / 関数 / 構文 / 型を記述し、以下を含める必要があります:

### 1. 完全な説明

それが何であるか、なぜ必要か、どのように動作するか。余計な飾りは不要です — 具体的で簡潔に。
エッジケースや自明でない動作にも言及します。

### 2. シグネチャ / 構文

パラメータ型と戻り型を含む正確なシグネチャ。
メソッドに複数のバリエーション（オーバーロード）がある場合 — それぞれを個別に記述します。

### 3. 使用例または実装例

バリエーションごとに少なくとも1つの動作する例。
例は最小限である必要があります — 不要なコンテキストを含めません。
各例には結果を示すコメント（`// →`）を付けます。

### 4. C出力

各例について — Cへのコンパイル方法。
生成されたCコードを表示し、開発者が内部で何が起こっているかを理解できるようにします。
所有権構文（move、borrow、drop、cleanup）において特に重要です。

### 5. エラーと修正

誤って使用した場合の典型的なコンパイラエラー。
形式: `誤ったコード → エラーテキスト → 修正済みコード`。
コンパイラのヒントも含める必要があります。

### 6. ナビゲーションとリンク

すべてのファイルにナビゲーションリンクを含める必要があります:

**ナビゲーションバー** — ファイルの先頭、見出しの直後:

```markdown
[← 上へ](./index.md) | [次へ →](./filter.md) | [前へ ←](./sort.md)
```

3つのリンク:
- **上へ** (`←`) — 親ディレクトリの `index.md`（セクション概要）へ移動
- **次へ** (`→`) — このレベルの次のファイルへ（論理的な順序、アルファベット順ではなく）
- **前へ** (`←`) — このレベルの前のファイルへ

セクションの最初のファイルには「前へ」はなく、最後のファイルには「次へ」はありません。

**相互参照** — ファイルの末尾、「関連項目」セクション:

```markdown
## 関連項目

- [filter](./filter.md) — 要素のフィルタリング
- [reduce](./reduce.md) — 蓄積
- [forEach](./for-each.md) — 結果を返さない反復処理
```

他のセクションにある関連構文へのリンク — フルパスで記述:

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) — 要素の借用
```

**各ディレクトリの index.md** — 子ファイルへのリンクを含むセクション概要。
トップダウンナビゲーションのエントリーポイントとして機能します。

ファイルテンプレートの例:

```markdown
# map

ソース配列の各要素に関数を適用して新しい配列を作成します。

## シグネチャ

\`\`\`typescript
arr.map<U>(f: (Ref<T>) => U): U[]
\`\`\`

コールバックは `Ref<T>` を受け取ります — 要素の借用であり、所有権ではありません。

## 例

### 基本的な使い方

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
const doubled = nums.map(x => x * 2)
// → [2, 4, 6]
\`\`\`

### C出力

\`\`\`c
int32_t* doubled = malloc(3 * sizeof(int32_t));
for (size_t i = 0; i < 3; i++) {
    doubled[i] = nums[i] * 2;
}
\`\`\`

### 型変換

\`\`\`typescript
const names: string[] = users.map(u => u.name)
// → ["Alice", "Bob"]
\`\`\`

## エラー

### コールバックが要素を変更する

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => { x++ })  // error: cannot assign to Ref<i32>
\`\`\`

修正:

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => x * 2)  // 新しい値を返す
\`\`\`

## 関連項目

- [filter](./filter.md)
- [reduce](./reduce.md)
- [flatMap](./flat-map.md)
```

---

## ドキュメント構造

### 01-intro.md — TSClang入門

**目標:** それが何であるか、なぜ存在するかを説明し、最初の動作する例を提供します。

- TSClangとは（TS構文 → C、Rustの安全性、npmエコシステム）
- 設計哲学（3つの優先事項: 安全性、パフォーマンス、TS構文）
- ユースケース（デスクトップ、組み込み、サーバー、レトロプラットフォーム）
- クイックスタート: インストール、`hello world`、ビルドと実行
- 必要条件（Node.js、CMake、gcc/clang）
- CLI概要: `tsclang build`、`tsclang lint`、`tsclang lsp`

**ソース:** `spec/01-intro.md`

---

### 02-syntax.md — 構文

**目標:** 言語構文の完全な説明。

- フォーマット（ASI、K&R、インデント、クォート、末尾カンマ）
- 変数: `let` / `const` — 所有権の文脈での違い
- 関数: `function`、アロー、匿名、IIFE
- パラメータ: デフォルト、rest
- 関数のオーバーロード（型と数による、解決の優先順位）
- 演算子: 算術、代入、比較、論理、ビット
- Truthy / Falsy（型別の表）
- ループ: `for`、`for-of`、`while`、`do-while`、`break`/`continue`、ラベル付き
- `switch` / `match` — 比較、網羅性
- スプレッド演算子（配列、オブジェクト、所有権のルール）
- インデックスとスライス（配列と文字列、負のインデックス）

**ソース:** `spec/02-syntax.md`

---

### 03-types.md — 型システム

**目標:** 型付け、すべての型、および変換の説明。

- 構造的 vs 公称的型付け（`type`、`interface`、`class`）
- 型推論
- 数値型（`i8`..`i64`、`u8`..`u64`、`f32`、`f64`）
  - リテラル（16進数、2進数、8進数、`_`区切り）
  - 自動キャスト（3つのメカニズム: 拡張、コンパイル時、`as`）
  - `usize` — プラットフォーム型
  - `number` = `f64`（上書き可能）
  - AVRでのパフォーマンス警告
- `string` — UTF-8バイト、Cレイアウト、インデックス、反復、ビルトインメソッド
- 特殊型: `void`、`never`、`any`
- Null: `T | null`、オプション `?`、オプショナルチェイニング `?.`、nullish coalescing `??`
  - `T | null` のC表現（フラグ付き構造体）
  - 組み込みパターン: センチネル値、別個のフラグ
- 型変換: number ↔ string、JS互換関数（`parseInt`、`parseFloat`）
- `Date` — 作成、メソッド、フォーマット
- 配列: `T[]`（動的）、`T[N]`（固定）、メソッド、関数型メソッド
- `Slice<T>` / `MutSlice<T>` — ゼロコピービュー
- `Map<K,V>`、`Set<T>` — API、所有権、組み込みパターン
- `Object` — 静的メソッド
- タプル: 固定、ラベル付き、readonly、オプション、rest、スプレッド
- `Clone` — インターフェース、`clone()`、`structuredClone()`
- 型エイリアス（`type`）
- 文字列リテラルユニオン
- ユーティリティ型: `Partial`、`Required`、`Readonly`、`NonNullable`、`Pick`、`Omit`、`Record`、`ReturnType`、`Parameters`、`Awaited`
- `Buffer`、`DataView`

**ソース:** `spec/03-types.md`

---

### 04-classes.md — クラス、インターフェース、列挙型、ジェネリック

**目標:** 言語のオブジェクトシステム。

- ジェネリック: 構文、境界（`implements`/`extends`）、単相化、ジェネリックと所有権
- 拡張メソッド: 宣言、インポート、競合
- 列挙型: 数値、文字列、`const enum`、ユーティリティ、switch/match内での使用
- インターフェース: メソッドを持つデータ vs 契約、ファットポインタ、vtable
- `instanceof` — vtableによる型の絞り込み
- クラス:
  - 継承なし（`extends Error` を除く）、コンポジション
  - 修飾子: `public`、`private`、`static`、`mut`、`move`
  - `this` とフィールドアクセスのセマンティクス
  - `readonly` フィールド
  - コンストラクタ: 自動生成、明示的、`private`
  - 値オブジェクトパターン
  - `move` を使ったビルダーパターン
- アラインメント: `@packed`、`@align(N)`、パディング診断
- デコレータ: 概要、完全なセクションへの参照

**ソース:** `spec/04-classes.md`、`spec/13-decorators.md`

---

### 05-memory.md — メモリモデルと所有権

**目標:** 言語の主要機能 — 安全なメモリ管理。

- 所有権型: `T`（オーナー）、`Ref<T>`、`Mut<T>`、`Shared<T>`、`Weak<T>`、`Slice<T>`
- 基本ルール: プリミティブはコピー、複合型は所有権
- オーナー（T）: 代入と渡しでのmove
- `Ref<T>`: 不変借用、ルール、フィールドでの禁止、回避パターン
- `Mut<T>`: 可変借用、一度に1つ
- `Shared<T>`: ARC、循環を防ぐ `Weak<T>`
- 借用チェッカーのルール（4つのルール）
- 引数渡しのマトリクス（let/const/Ref/Mut/Shared → Ref/Mut/T/Shared）
- 内部可変性 — なぜ存在しないのか
- `@static let` — グローバル可変状態
- スコープ制約（ライフタイム注釈なし）: 4つのルール
- 自動Dropと `goto cleanup`
- `Iterable<T>` — ユーザー定義の反復可能型
- フィールドアクセスと分割（借用 vs move）
- スライス（借用 vs 所有）
- 配列からのmove、借用中の変更
- メソッドからの借用の返却
- クロージャ: キャプチャのルール、明示的なキャプチャリスト、awaitによるMutクロージャ

**ソース:** `spec/05-memory.md`

---

### 06-errors.md — エラー処理

**目標:** setjmp/longjmpなしのResultベースのエラーシステム。

- 原則: TSでの `throw`/`try`/`catch` → CでのResult構造体
- シグネチャでの `throws` の宣言
- `Error` — 基底クラス、`error.stack`
- `throw`、`try`/`catch`/`finally`
- ユニオンcatch、網羅的な処理
- `?` 演算子（伝播）
- `!` 演算子（アンラップ/パニック）
- C出力: Result構造体、`ok` と `_kind` に対する `if/else`
- エラー時の所有権（`goto` によるクリーンアップ）
- 制限事項

**ソース:** `spec/06-errors.md`

---

### 07-concurrency.md — 並行処理

**目標:** 3つのレベルの並行処理とその使い方。

- 3つのメカニズムの概要（非同期/待機、スレッド、ISR）
- **非同期/待機:**
  - 非同期ランタイムアーキテクチャ（ステートマシン）
  - ステートマシンのサイズ、組み込みでのスタック安全性
  - `Promise<T>`: 作成、`.then`/`.catch`/`.finally`
  - `Promise.all`、`Promise.any`、`Promise.race`、`Promise.allSettled`
  - `await`、`async main` のルール
  - 再帰的な非同期関数
  - `@embedded.stack` — 明示的なスタック
  - タスクキャンセル: `AbortController`、`AbortSignal`
  - `AsyncMutex`
- **スレッド（std/threads）:**
  - 共有メモリなしのアイソレート
  - `Atomic<T>`、`AtomicArray<T>`
  - `channel<T>`: 境界付きMPMC、ISR安全な操作
  - `select`: 複数チャンネルでの待機
  - `Readonly<T>`: ゼロコピー共有
  - `Thread<T>`: 型付き結果
  - Thread.spawnのルール、Sendチェック
- **@embedded.isr:**
  - `Volatile<T>` — MMIOレジスタ
  - ISR: シグネチャ、ルール、パターン
  - `std/sync` — クリティカルセクション
  - `EmbeddedSignal` — ISR → 非同期ブリッジ
- 組み込み注釈: `@embedded.inline`、`@embedded.noHeap`
- `@signal` — POSIXシグナル（デスクトップ）
- 非同期ジェネレータ: `async function*`、`for await`、`close()`
- ジェネレータによる協調的マルチタスク

**ソース:** `spec/07-concurrency.md`

---

### 08-modules.md — モジュールとC相互運用

**目標:** モジュールシステムの仕組みとC相互運用。

- エクスポート: 名前付き、`export default` は禁止
- インポート: 名前付き、名前空間、`import type`
- モジュールの初期化順序、循環インポート
- モジュールレベル変数
- パスエイリアス（`#`、`~`）
- エントリポイント: `"main"`、`"builds"`、C mainの生成
- ライブラリ: `"type": "library"`
- `.d.tsc` ファイル: 5種類の宣言
  - C構造体、不透明型、C関数、定数、MMIOレジスタ
  - リンク設定（system、bundled、fetch）
- `native` — インラインC（構文、補間、制限事項）
- コールバック: `FnPtr<T>`、`TSC_CLOSURE_*` マクロ
- `unsafe {}` — チェックの無効化
- `@platform` — 条件付きコンパイル
- 宣言のマージ
- 可変長C関数: `Scalar` 型

**ソース:** `spec/08-modules.md`

---

### 09-build.md — ビルドシステム

**目標:** プロジェクト、ビルド、およびパッケージの構造方法。

- プロジェクト型: 実行ファイル、ライブラリ、Cラッパー、プラットフォームパッケージ
- `tsc.package.json`: すべてのフィールド
- Cラッパー: 構造、公開、リンク設定（system/bundled/fetch）
- プラットフォームパッケージ: `declare platform {}`、プラットフォームフィールド
- CLI: `tsclang build`、フラグ（`--outDir`、`--target`、`--profile`、`--optimize`）
- パッケージマネージャ: `tsclang install`、`tsclang publish`、`tsclang search`
- モノレポ: `"workspaces"`
- 組み込みビルド: AVR、ARM、レトロプラットフォーム
- CMakeLists.txt: 生成、カスタマイズ
- プロファイル: debug/release、最適化

**ソース:** `spec/09-build.md`

---

### 10-stdlib.md — 標準ライブラリ

**目標:** すべてのstdlibモジュールのリファレンス。

- 原則: `std/` による統一API、遅延ロード、ツリーシェイキング
- グローバルオブジェクト: `console`、`Math`、`process`、タイマー、`performance`
- `Error` — 基底クラス
- `Map<K,V>`、`Set<T>` — API、所有権
- `Buffer`、`DataView`
- `std/io` — Reader/Writer
- `std/fs` — ファイル操作
- `std/net` — fetch、HTTPサーバー、TCP/UDP
- `std/ws` — WebSocket
- `std/math` — 定数とメソッド（完全な表）
- `std/string` — Unicode、エンコーディング、フォーマット
- `std/json` — パースとシリアライゼーション
- `std/url` — URLとURLSearchParams
- `std/blob` — BlobとFile
- `std/formdata` — multipart/form-data
- `std/regex` — NFA正規表現、構文、API
- `std/random` — Random、HardwareRandom
- `std/temporal` — PlainDateTime、Instant、Duration
- `std/reactive` — ReactiveVar、computed、effect
- `std/hal` — GPIO、UART、SPI、I2C
- `std/embedded` — Volatile、pointer、HashMap、StaticMap
- プラットフォーム互換性（表）

**ソース:** `spec/10-stdlib.md`、`spec/19-stdlib-*.md`

---

### 11-compiler.md — コンパイラアーキテクチャ

**目標:** コントリビューターと内部を理解したい人向け。

- コンパイルフェーズ（Parse → AST → Decorator → Typecheck → IR → Codegen）
- IR: 基本ブロック、命令、phiノード
- 名前マングリング（正式なスキーム）
- デバッグ情報: `#line` ディレクティブ、DAPサーバー
- コンシューマ側の単相化
- 増分コンパイル（ロードマップ）
- 最適化レベル（O0–O3、Os）
- エラーメッセージ: 形式、カテゴリ、エラーコード

**ソース:** `spec/11-compiler.md`

---

### 12-migration.md — 移行ガイド: TypeScript → TSClang

**目標:** TS開発者がコードを移行するのを助けます。

- 自動修正（`tsclang migrate`）
- そのまま動作するもの（例）
- 手動での修正が必要なもの（具体的なパターン）
- 互換性のないパターン（代替案の表）
- TSClangが追加するもの（TSにないもの）

**ソース:** `spec/12-migration.md`

---

## セクション概要表

| # | ファイル | 内容 | ソース | サイズ |
|---|------|---------|--------|------|
| 01 | intro | TSClangとは、クイックスタート、CLI | `spec/01-intro.md` | ~30 KB |
| 02 | syntax | 構文、演算子、ループ、match/switch | `spec/02-syntax.md` | ~50 KB |
| 03 | types | 型、数値、文字列、配列、Map/Set、タプル、ユーティリティ型 | `spec/03-types.md` | ~80 KB |
| 04 | classes | クラス、インターフェース、列挙型、ジェネリック、拡張メソッド | `spec/04-classes.md`、`spec/13-decorators.md` | ~40 KB |
| 05 | memory | 所有権、借用チェッカー、Ref/Mut/Shared、クロージャ | `spec/05-memory.md` | ~50 KB |
| 06 | errors | throw/try/catch、Result、`?`/`!` 演算子 | `spec/06-errors.md` | ~15 KB |
| 07 | concurrency | 非同期/待機、スレッド、ISR、atomic、チャンネル、ジェネレータ | `spec/07-concurrency.md` | ~70 KB |
| 08 | modules | インポート/エクスポート、.d.tsc、native、unsafe、@platform | `spec/08-modules.md` | ~50 KB |
| 09 | build | ビルド、パッケージ、Cラッパー、プラットフォーム | `spec/09-build.md` | ~50 KB |
| 10 | stdlib | すべてのstdモジュールのリファレンス | `spec/10-stdlib.md`、`spec/19-stdlib-*.md` | ~60 KB |
| 11 | compiler | コンパイラアーキテクチャ（コントリビューター向け） | `spec/11-compiler.md` | ~30 KB |
| 12 | migration | TypeScript → TSClang 移行ガイド | `spec/12-migration.md` | ~15 KB |
| | | | **合計** | **~540 KB** |

## 推奨する執筆順序

推奨順序（最も重要で一般的なものから高度なものへ）:

1. `01-intro.md` — すべての人のエントリーポイント
2. `02-syntax.md` — 基本構文
3. `05-memory.md` — 主要機能、すべての人に必要
4. `03-types.md` — 型システム
5. `04-classes.md` — オブジェクトシステム
6. `06-errors.md` — エラー処理
7. `08-modules.md` — モジュールとC相互運用
8. `07-concurrency.md` — 並行処理
9. `10-stdlib.md` — APIリファレンス
10. `09-build.md` — ビルドシステム
11. `12-migration.md` — TSからの移行
12. `11-compiler.md` — 内部（コントリビューター向け）

## サイズ見積もり

| ドキュメント | 推定サイズ |
|----------|----------------|
| 01-intro | ~30 KB |
| 02-syntax | ~50 KB |
| 03-types | ~80 KB |
| 04-classes | ~40 KB |
| 05-memory | ~50 KB |
| 06-errors | ~15 KB |
| 07-concurrency | ~70 KB |
| 08-modules | ~50 KB |
| 09-build | ~50 KB |
| 10-stdlib | ~60 KB |
| 11-compiler | ~30 KB |
| 12-migration | ~15 KB |
| **合計** | **~540 KB** |

## 書式

- Markdown（.md）
- 各ファイルは独立したセクション
- セクションタイトルはH1見出し、サブセクションはH2/H3
- リファレンス情報は表で
- コードブロックには言語指定子を付ける（```typescript、```c、```bash）
- 重要な注釈には `> **注:**`
- 重大な制限には `> **警告:**`
