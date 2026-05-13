# 錯誤處理

[← 上一級](../index.md) | [下一頁 →](./throw-try.md)

---

TSClang 使用類似 TypeScript 的 `throw`/`try`/`catch`/`finally` 語法，但將錯誤編譯為 C 中的 **Result 結構體** — 不使用 `setjmp`/`longjmp`。這提供了：

- **零開銷**：無需在每个 `try` 區塊上保存暫存器
- **安全的 C 互操作**：不會透過第三方 C 程式碼進行 `longjmp`
- **正確的所有權**：常規控制流程，編譯器知道所有擁有的變數

## 原理

每個可能失敗的函式在其簽名中宣告 `throws`。在 C 輸出中，回傳型別被包裝在一個 Result 結構體中，包含 `ok` 欄位和一個用於值或錯誤的聯合。`try`/`catch` 處理程式編譯為對 `ok` 欄位和 `_kind` 的普通 `if/else`。

## 核心概念

### throws 宣告

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

沒有 `throws` — 函式不能包含 `throw`（編譯錯誤）。

### Error — 基底類別

所有錯誤都繼承自 `Error`：

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // 僅限桌面端 — 拋出點的 "__FILE__:__LINE__"
}
```

### ? 和 ! 運算子

| 運算子 | 語義 | 是否需要 `throws`？ |
|----------|-----------|-------------------|
| `expr?`  | 傳播 — 從目前函式回傳錯誤 | 是 |
| `expr!`  | 解包 — 錯誤時 panic（`abort()`） | 否 |

### C 中的 Result 結構體

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

### 錯誤與所有權

編譯器追蹤 `try` 區塊中所有擁有的變數。出錯時，所有已初始化的擁有變數透過常規控制流程（`goto cleanup`）釋放。

## 子頁面

| 頁面 | 說明 |
|----------|----------|
| [throw / try / catch / finally](./throw-try.md) | 錯誤處理語法、依型別捕捉、finally |
| [Result structs](./result.md) | Result<T, E>、discriminated union、C 表示 |
| [? and ! operators](./operators.md) | 傳播、解包/panic、C 輸出 |

## 錯誤

| 錯誤 | 原因 |
|--------|---------|
| `throw in non-throws function` | 在沒有 `throws` 的函式中使用 `throw` |
| `? operator in non-throws function` | 在目前函式沒有 `throws` 的情況下使用 `?` 運算子 |
| `extern "C" cannot throw` | 在 `extern "C"` 函式中使用 `throws` |
| `throw/return in finally` | 在 `finally` 區塊中使用 `throw` 或 `return` |
| `error.stack on embedded` | 在嵌入式平台上存取 `stack` |

## 限制

- 禁止在沒有 `throws` 的函式中使用 `throw`
- 禁止在沒有 `throws` 的函式中使用 `?`
- 例外不能跨 C 互操作邊界拋出 — `extern "C"` 不能包含 `throws`
- `finally` 不能包含 `throw` 或 `return`
- 嵌入式平台上無法使用 `error.stack`

## 參見

- [Memory Model: Auto Drop](../05-memory/auto-drop.md) — 多退出點的 `goto cleanup`
- [Memory Model: Owner](../05-memory/owner.md) — 錯誤情況下的 move 和所有權
- [Classes](../04-classes/index.md) — Error 繼承和自訂錯誤型別
