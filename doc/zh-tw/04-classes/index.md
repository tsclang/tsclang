# 類別與物件系統

[← 上一級](../index.md) | [下一頁 →](./classes.md)

---

TSClang 的物件系統基於組合而非繼承，class 使用名義型別，interface 使用結構型別。泛型採用單態化 — 每個具體型別生成獨立的 C 程式碼。

## 核心原則

- **無繼承** — 僅允許 `extends Error` 用於錯誤階層結構。多型透過 `interface` + `implements` 實現。
- **組合** — 代替 `class Dog extends Animal`，請使用 `class Dog { animal: Animal }`。
- **所有權整合** — `mut`、`move` 方法修飾詞控制 `this` 語義。
- **泛型單態化** — `Stack<i32>` 和 `Stack<User>` 生成獨立的 C 函式。
- **裝飾器為編譯期** — 在型別檢查前轉換 AST，零執行時期開銷。

## 子頁面

| 頁面 | 說明 |
|------|-------------|
| [Classes](./classes.md) | 定義、修飾詞、`this` 語義、`readonly`、建構函式、值物件、builder |
| [Interfaces](./interfaces.md) | 資料介面與契約、胖指標 vtable、`instanceof`、結構相容性 |
| [Enum](./enum.md) | 數值、字串、`const enum`、工具函式、`match` 窮盡性檢查 |
| [Generics](./generics.md) | 語法、邊界（`implements`/`extends`）、單態化、泛型與所有權 |
| [Decorators](./decorators.md) | `decorator function`、Descriptor API、`@packed`、`@align`、`@static`、`@embedded.*`、`@signal`、`@platform` |

## 擴充方法

TSClang 支援擴充方法 — 在不修改定義的情況下為現有型別添加方法。顯式匯入，不污染全域作用域。

```typescript
export extension function charCount(this: string): i32 {
    // count codepoints
}

import { charCount } from "std/string"
"привет".charCount()   // ok
```

C 輸出 — 靜態呼叫，零開銷：

```c
int32_t n = tsc_std_string_charCount(s);
```

擴充與現有方法衝突 — 編譯錯誤。來自不同模組的兩個同名擴充 — 透過 `import { format as fmtA } from "./module-a"` 解決。

## 錯誤

| 錯誤 | 原因 |
|-------|-------|
| `extends is only allowed for Error` | 嘗試從任意 class 繼承 |
| `extension 'format' conflicts with existing method` | 擴充名與現有方法同名 |
| `ambiguous extension 'format' for type 'string'` | 匯入的兩個擴充同名 |

## 參見

- [Memory Model](../05-memory/index.md) — 所有權、`Ref<T>`、`Mut<T>`、move 語義
- [Type System](../03-types/index.md) — 結構性與名義性型別
- [Error Handling](../06-errors/index.md) — `extends Error`、`throws`、`try/catch`
- [Specification: Classes](../../spec/04-classes.md) — 物件系統的完整描述
