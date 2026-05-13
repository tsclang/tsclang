# 错误处理

[← 上一级](../index.md) | [下一页 →](./throw-try.md)

---

TSClang 使用类似 TypeScript 的 `throw`/`try`/`catch`/`finally` 语法，但将错误编译为 C 中的 **Result 结构体** — 不使用 `setjmp`/`longjmp`。这提供了：

- **零开销**：无需在每个 `try` 块上保存寄存器
- **安全的 C 互操作**：不会通过第三方 C 代码进行 `longjmp`
- **正确的所有权**：常规控制流，编译器知道所有拥有的变量

## 原理

每个可能失败的函数在其签名中声明 `throws`。在 C 输出中，返回类型被包装在一个 Result 结构体中，包含 `ok` 字段和一个用于值或错误的联合。`try`/`catch` 处理程序编译为对 `ok` 字段和 `_kind` 的普通 `if/else`。

## 核心概念

### throws 声明

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

没有 `throws` — 函数不能包含 `throw`（编译错误）。

### Error — 基类

所有错误都继承自 `Error`：

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // 仅限桌面端 — 抛出点的 "__FILE__:__LINE__"
}
```

### ? 和 ! 运算符

| 运算符 | 语义 | 是否需要 `throws`？ |
|----------|-----------|-------------------|
| `expr?`  | 传播 — 从当前函数返回错误 | 是 |
| `expr!`  | 解包 — 错误时 panic（`abort()`） | 否 |

### C 中的 Result 结构体

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

### 错误与所有权

编译器跟踪 `try` 块中所有拥有的变量。出错时，所有已初始化的拥有变量通过常规控制流（`goto cleanup`）释放。

## 子页面

| 页面 | 说明 |
|----------|----------|
| [throw / try / catch / finally](./throw-try.md) | 错误处理语法、按类型捕获、finally |
| [Result structs](./result.md) | Result<T, E>、discriminated union、C 表示 |
| [? and ! operators](./operators.md) | 传播、解包/panic、C 输出 |

## 错误

| 错误 | 原因 |
|--------|---------|
| `throw in non-throws function` | 在没有 `throws` 的函数中使用 `throw` |
| `? operator in non-throws function` | 在当前函数没有 `throws` 的情况下使用 `?` 运算符 |
| `extern "C" cannot throw` | 在 `extern "C"` 函数中使用 `throws` |
| `throw/return in finally` | 在 `finally` 块中使用 `throw` 或 `return` |
| `error.stack on embedded` | 在嵌入式平台上访问 `stack` |

## 限制

- 禁止在没有 `throws` 的函数中使用 `throw`
- 禁止在没有 `throws` 的函数中使用 `?`
- 异常不能跨 C 互操作边界抛出 — `extern "C"` 不能包含 `throws`
- `finally` 不能包含 `throw` 或 `return`
- 嵌入式平台上无法使用 `error.stack`

## 参见

- [Memory Model: Auto Drop](../05-memory/auto-drop.md) — 多退出点的 `goto cleanup`
- [Memory Model: Owner](../05-memory/owner.md) — 错误情况下的 move 和所有权
- [Classes](../04-classes/index.md) — Error 继承和自定义错误类型
