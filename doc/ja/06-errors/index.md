# エラー処理

[上へ](../index.md) | [次へ](./throw-try.md)

---

TSClangは `throw`/`try`/`catch`/`finally` 構文をTypeScriptと同様に使用しますが、エラーを **CのResult構造体** にコンパイルします — `setjmp`/`longjmp` を使用しません。これにより以下が実現されます：

- **ゼロコスト**：すべての `try` ブロックでレジスタを保存する必要がありません
- **安全なC相互運用**：サードパーティのCコードを `longjmp` で通過しません
- **正しい所有権管理**：通常の制御フローであり、コンパイラはすべての所有変数を把握しています

## 原則

失敗する可能性のある関数は、シグネチャに `throws` を宣言します。C出力では、戻り値の型は `ok` フィールドと、値またはエラーの共用体を持つResult構造体でラップされます。`try`/`catch` ハンドラは、通常の `if/else` で `ok` フィールドと `_kind` を判定するコードにコンパイルされます。

## 主要な概念

### throws宣言

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

`throws` がない場合 — 関数は `throw` を含むことができません（コンパイルエラーです）。

### Error — 基底クラス

すべてのエラーは `Error` を継承します：

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // デスクトップのみ — スローポイントの "__FILE__:__LINE__"
}
```

### ? と ! 演算子

| 演算子 | セマンティクス | `throws` が必要？ |
|----------|-----------|-------------------|
| `expr?`  | 伝播 — 現在の関数からエラーを返す | はい |
| `expr!`  | アンラップ — エラー時にパニック (`abort()`) | いいえ |

### CでのResult構造体

```c
typedef struct {
    bool ok;
    union {
        Response value;
        struct {
            _fetch_err_kind _kind;
            union {
                IOError io;
                NetworkError net;
            } _err;
        };
    };
} _Result_Response_IOError_NetworkError;
```

### エラーにおける所有権

コンパイラは `try` ブロック内のすべての所有変数を追跡します。エラー発生時には、既に初期化されたすべての所有変数が通常の制御フロー（`goto cleanup`）を通じて解放されます。

## サブページ

| ページ | 説明 |
|----------|----------|
| [throw / try / catch / finally](./throw-try.md) | エラー処理の構文、型によるcatch、finally |
| [Result構造体](./result.md) | Result<T, E>、判別共用体、Cでの表現 |
| [? と ! 演算子](./operators.md) | 伝播、アンラップ/パニック、C出力 |

## エラー

| エラー | 原因 |
|--------|---------|
| `throw in non-throws function` | `throws` のない関数での `throw` |
| `? operator in non-throws function` | 現在の関数に `throws` がない状態での `?` 演算子 |
| `extern "C" cannot throw` | `extern "C"` 関数での `throws` |
| `throw/return in finally` | `finally` ブロック内での `throw` または `return` |
| `error.stack on embedded` | 組み込みプラットフォームでの `stack` へのアクセス |

## 制限事項

- `throws` のない関数では `throw` が禁止されています
- `throws` のない関数では `?` が禁止されています
- C相互運用境界を越えて例外を投げることはできません — `extern "C"` は `throws` を含むことができません
- `finally` は `throw` または `return` を含むことができません
- `error.stack` は組み込みプラットフォームでは使用できません

## 関連項目

- [メモリモデル：自動ドロップ](../05-memory/auto-drop.md) — 複数の出口ポイントにおける `goto cleanup`
- [メモリモデル：所有者](../05-memory/owner.md) — エラーにおけるムーブと所有権
- [クラス](../04-classes/index.md) — Errorの継承とカスタムエラー型
