# 类与对象系统

[← 上一级](../index.md) | [下一页 →](./classes.md)

---

TSClang 的对象系统基于组合而非继承，class 使用名义类型，interface 使用结构类型。泛型采用单态化 — 每个具体类型生成独立的 C 代码。

## 核心原则

- **无继承** — 仅允许 `extends Error` 用于错误层次结构。多态通过 `interface` + `implements` 实现。
- **组合** — 代替 `class Dog extends Animal`，请使用 `class Dog { animal: Animal }`。
- **所有权集成** — `mut`、`move` 方法修饰符控制 `this` 语义。
- **泛型单态化** — `Stack<i32>` 和 `Stack<User>` 生成独立的 C 函数。
- **装饰器为编译期** — 在类型检查前转换 AST，零运行时开销。

## 子页面

| 页面 | 说明 |
|------|-------------|
| [Classes](./classes.md) | 定义、修饰符、`this` 语义、`readonly`、构造函数、值对象、builder |
| [Interfaces](./interfaces.md) | 数据接口与契约、胖指针 vtable、`instanceof`、结构兼容性 |
| [Enum](./enum.md) | 数值、字符串、`const enum`、工具函数、`match` 穷尽性检查 |
| [Generics](./generics.md) | 语法、边界（`implements`/`extends`）、单态化、泛型与所有权 |
| [Decorators](./decorators.md) | `decorator function`、Descriptor API、`@packed`、`@align`、`@static`、`@embedded.*`、`@signal`、`@platform` |

## 扩展方法

TSClang 支持扩展方法 — 在不修改定义的情况下为现有类型添加方法。显式导入，不污染全局作用域。

```typescript
export extension function charCount(this: string): i32 {
    // count codepoints
}

import { charCount } from "std/string"
"привет".charCount()   // ok
```

C 输出 — 静态调用，零开销：

```c
int32_t n = tsc_std_string_charCount(s);
```

扩展与现有方法冲突 — 编译错误。来自不同模块的两个同名扩展 — 通过 `import { format as fmtA } from "./module-a"` 解决。

## 错误

| 错误 | 原因 |
|-------|-------|
| `extends is only allowed for Error` | 尝试从任意 class 继承 |
| `extension 'format' conflicts with existing method` | 扩展名与现有方法同名 |
| `ambiguous extension 'format' for type 'string'` | 导入的两个扩展同名 |

## 参见

- [Memory Model](../05-memory/index.md) — 所有权、`Ref<T>`、`Mut<T>`、move 语义
- [Type System](../03-types/index.md) — 结构性与名义性类型
- [Error Handling](../06-errors/index.md) — `extends Error`、`throws`、`try/catch`
- [Specification: Classes](../../spec/04-classes.md) — 对象系统的完整描述
