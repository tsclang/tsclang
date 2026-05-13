# TSClangとは

[← 上へ](./index.md) | [次へ →](./design-philosophy.md)

---

TSClangはTypeScript構文を持つコンパイル言語で、`.tsc` ファイルを読みやすいCコードに変換し、`CMakeLists.txt` を自動生成します。

## なぜ

多くの開発者がTypeScriptからCへ移行します — そしてそれはつらいものです。Cにはまともなエコシステムがありません: パッケージマネージャがなく、便利なクロスコンパイルがなく、組み込みのメモリ安全性チェックがありません。

TSClangはこれを解決します:

- **馴染みのある構文** — TS開発者は構文を認識し、すぐに生産的になります
- **安全なメモリ** — コンパイル時の所有権と借用チェッカー、GCなし
- **統一されたエコシステム** — 依存関係、クロスコンパイル、すぐに使えるビルド
- **読みやすいC出力** — 検査、デバッグ、手書きのCとの組み合わせが可能です

## 用途

**現在:**

- サーバーコード — HTTP、ソケット、バックエンド
- デスクトップ — CLI/TUI、ファイルマネージャー、オフィスアプリケーション

**重要:**

- システムレベル — ドライバー、OS
- 組み込み — Arduino、ESP、Raspberry Pi
- ゲーム — OpenGL、DirectX経由

**将来の展望:**

- クロスプラットフォーム — Windows、Linux、Mac、Android、iOS
- レトロプラットフォーム — ZX Spectrum、NES、Sega、MS-DOS

## ファイル拡張子

`.tsc` — TSClangソースファイルです。

```typescript
// hello.tsc
console.log("Hello world")
```

コンパイル結果:

```c
// hello.c
#include "runtime.h"
int main(void) {
    tsc_console_log(tsc_string_from_cstr("Hello world"));
    return 0;
}
```

## 関連項目

- [設計哲学](./design-philosophy.md) — 言語の3つの優先事項
- [クイックスタート](./quick-start.md) — インストールと最初のプロジェクト
- [メモリモデル](../05-memory/index.md) — 所有権と借用チェッカー
