# 语法

[← 上一级](../index.md) | [下一页 →](./formatting.md)

---

TSClang 语法的完整描述。该语言遵循 TypeScript/JavaScript 约定，并扩展了安全内存管理功能。

## 章节

### 基础
- [Formatting](./formatting.md) — 分号、缩进、引号、linter
- [Truthy / Falsy](./truthy-falsy.md) — 哪些值被视为 true/false

### 变量
- [let / const](./variables/index.md) — 可变性、所有权差异

### 函数
- [Declaration](./functions/declaration.md) — `function`、参数、返回类型
- [Arrow](./functions/arrow.md) — `=>` 语法
- [Overloading](./functions/overload.md) — 按类型和参数数量重载
- [Default Parameters](./functions/default-params.md) — 默认值

### 运算符
- [Arithmetic](./operators/arithmetic.md) — `+`、`-`、`*`、`/`、`%`、`**`
- [Assignment](./operators/assignment.md) — `=`、`+=`、`-=` 等
- [Comparison](./operators/comparison.md) — `==`、`!=`、`===`、`!==`
- [Logical](./operators/logical.md) — `&&`、`||`、`!`、`??`
- [Bitwise](./operators/bitwise.md) — `&`、`|`、`^`、`~`、`<<`、`>>`
- [Optional](./operators/optional.md) — `?.`、`??`、展开 `...`
- [Operator Precedence](./operators/precedence.md) — 优先级表

### 循环
- [for](./loops/for.md) — 经典循环
- [for-of](./loops/for-of.md) — 集合遍历
- [while / do-while](./loops/while.md) — 条件循环
- [break / continue](./loops/break-continue.md) — 迭代控制

### 流程控制
- [switch](./match/switch.md) — 值选择
- [match](./match/index.md) — 模式匹配

### 切片
- [Indexing and Slices](./slices.md) — `[]`、`[a..b]`、负索引

## 参见

- [Types](../03-types/index.md) — 类型系统
- [Memory Model](../05-memory/index.md) — 所有权与借用检查器
