# 模块系统

[← 上一级](../index.md) | [下一页 →](./import-export.md)

---

TSClang 采用与 TypeScript 语法兼容的**模块系统**：命名 `export` / `import { } from ""`。一个文件 = 一个模块。编译器会自动在 C 输出中生成 `#include`、前置声明和初始化函数。

## 原则

- **一个文件 — 一个模块** — 没有 `namespace`，没有 `module`
- **仅命名导出** — 禁止使用 `export default`（C 要求每个符号必须有显式名称）
- **允许循环导入** — 编译器在 `.h` 中生成前置声明
- **`.d.tsc` 文件** — 用于 C 互操作的声明（类似 TypeScript 中的 `.d.ts`）
- **路径别名** — 使用 `#/`、`~/` 短名称代替 `../../../`

## 导入与导出

```typescript
// math.tsc — 带有导出的模块
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — 导入
import { PI, add } from "./math"
console.log(add(1, 2))
```

## 入口点

入口点由 `tsc.package.json` 中的 `"main"` 字段定义。入口文件的顶层代码将成为 C 中 `main()` 的函数体：

```typescript
const a: i32 = 1
console.log(a)
```

```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

## 模块初始化

编译器构建依赖图并执行**拓扑排序**。每个带有模块级变量的模块都会获得一个 `_init()` 函数。最终生成一个按正确调用顺序排列的 `tsc_init_all()`。

## C 互操作

为了与 C 库交互，TSClang 提供了几种机制：

| 机制 | 用途 |
|----------|------------|
| `.d.tsc` | C 类型、函数、常量的声明 |
| `native` | 内联 C 代码（原文插入） |
| `unsafe {}` | 禁用借用/类型检查器 |
| `FnPtr<T>` | 用于 C 回调的函数指针 |
| `@platform` | 按平台的条件编译 |

## 子页面

| 页面 | 说明 |
|----------|----------|
| [导入 / 导出](./import-export.md) | 命名导出/导入、命名空间导入、`import type`、初始化、循环导入、路径别名 |
| [.d.tsc 文件](./d-tsc.md) | 用于 C 互操作的声明：结构体、不透明类型、函数、常量、MMIO |
| [native — 内联 C](./native.md) | 语法、插值、限制、汇编插入 |
| [unsafe {} — 禁用检查](./unsafe.md) | 何时使用、禁用什么、与 `native` 的区别 |
| [回调和 FnPtr\<T\>](./callbacks.md) | 函数指针、TSC_CLOSURE_* 宏、闭包桥接 |
| [@platform — 条件编译](./platform.md) | 平台相关实现、包结构 |

## C 输出

```c
// 编译多个模块的结果
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... main.tsc 的顶层代码 ...
    return 0;
}
```

## 错误

| 错误 | 原因 |
|--------|---------|
| `cannot determine entry point` | `tsc.package.json` 中缺少 `"main"` 字段 |
| `main file not found: src/main.tsc` | `"main"` 指定的文件不存在 |
| `circular initialization dependency detected` | 模块级变量之间存在循环依赖 |
| `export default is not allowed` | 尝试使用默认导出 |
| `native block — C code inserted verbatim` | 每个 `native` 块的警告 |

## 参见

- [语法：变量](../02-syntax/variables/index.md) — 模块级变量
- [内存：所有权](../05-memory/ownership-types.md) — 在模块间传递时的 owned/borrow
- [并发](../07-concurrency/index.md) — 模块级变量的线程安全
