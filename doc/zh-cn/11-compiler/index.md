# 编译器架构

[← 上一级](../index.md) | [下一页 →](./phases.md)

---

TSClang 编译器架构，面向贡献者。编译器将 `.tsc` 翻译为 C99，将机器优化委托给 C 编译器（gcc/clang/avr-gcc）。

## 编译流程

```
.tsc 源代码
    ↓
解析（词法分析 + 语法分析）      →  AST
    ↓
装饰器处理                      →  修改后的 AST
    ↓
类型检查                        →  带类型的 AST
    ↓
降级到 IR                       →  类 SSA IR（基本块）
    ↓
所有权分析                      →  借用检查器 + ARC 注入
    ↓
代码生成                        →  C99 + #line + CMakeLists.txt
    ↓
C 编译器                        →  二进制 / .hex
```

## 源代码

| 路径 | 用途 |
|------|---------|
| `src/compiler/lexer.js` | 词法分析器 |
| `src/compiler/parser.js` | 语法分析器 → AST |
| `src/compiler/types.js` | 辅助类型和名字修饰 |
| `src/compiler/codegen.js` | 代码生成入口点，Context 类 |
| `src/compiler/codegen/top-level/` | 类、函数、接口、枚举、类型别名 |
| `src/compiler/codegen/stmt/` | 变量声明、控制流、解构、match |
| `src/compiler/codegen/expr/` | 表达式分派器、运算符、赋值、字面量 |
| `src/compiler/codegen/calls/` | 调用：方法、console、stdlib、内置、转换、并发 |
| `src/compiler/codegen/types/` | 类型解析、推断、辅助函数 |
| `src/compiler/codegen/misc/` | 辅助函数、new-expr、闭包、数组 |
| `src/compiler/codegen/async/` | 异步：语句、生成、生成器、辅助函数、扫描 |
| `src/compiler/codegen/generics.js` | 泛型单态化 |
| `src/runtime/runtime.h` | C 运行时头文件 |

## 测试方法

每个组件按以下周期实现：

```
1. 测试     — 语料库（input.tsc → expected.c / expected.error）
2. 实现     — 直到所有测试通过
3. 日志     — log/<component>.md：决策、问题、变更
```

测试语料库：`test/cases/phase0–phase19`，共 1028 个测试。格式说明见 `test/CORPUS.md`。

## 子页面

| 页面 | 说明 |
|------|-------------|
| [编译阶段](./phases.md) | 解析 → AST → 装饰器 → 类型检查 → IR → 所有权 → 代码生成 |
| [名字修饰](./name-mangling.md) | 正式方案、类型编码、模块标识、冲突处理 |
| [调试信息](./debug.md) | `#line` 指令、DAP 服务器、嵌入式调试 |
| [优化](./optimization.md) | 级别 O0–O3/Os、使用者端单态化、增量编译 *(路线图中)* |

## 错误

| 错误 | 原因 |
|-------|-------|
| `type name must start with uppercase letter` | 类/接口名称不是 PascalCase |
| `type name uses reserved mangling prefix` | 在类型名称中使用了 `ref_`、`mut_`、`arc_`、`opt_`、`arr_` |
| `error[TSC-EXXX]` | 稳定的错误代码 — 可在文档中搜索 |

## 参见

- [装饰器](../04-classes/decorators.md) — 装饰器处理：算法和限制
- [内存模型](../05-memory/index.md) — 所有权、借用检查器、IR 指令
- [构建系统](../09-build/index.md) — CMake、配置、嵌入式目标
