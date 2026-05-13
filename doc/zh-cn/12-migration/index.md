# 迁移：TypeScript → TSClang

[← 上一级](../index.md) | [下一页 →](./automatic.md)

---

面向从 TypeScript 迁移到 TSClang 的开发者的指南。介绍自动和手动转换、不兼容的模式以及新功能。

## 流程概览

TSClang 力求与 TypeScript 语法实现最大兼容性。大多数 TypeScript 代码无需修改或只需少量编辑即可移植。迁移过程分为三个阶段：

1. **自动修复** — `tsclang migrate` 应用机械性转换
2. **手动修复** — 无法安全自动化的模式
3. **不兼容模式** — 没有直接对应的构造，需要重新设计

## 快速检查

```bash
tsclang migrate ./src            # 试运行：显示将要更改的内容
tsclang migrate ./src --fix      # 应用自动修复
tsclang migrate ./src --check    # CI：如果存在不兼容性则退出码 1
```

## 无需更改即可迁移的内容

接口、带类型的函数、箭头函数、类（不含 `extends`）、泛型、`try/catch`、模板字符串、解构 — 所有这些都能像 TypeScript 一样工作。详情见 [手动迁移](./manual.md)。

## 子页面

| 页面 | 说明 |
|------|-------------|
| [自动迁移](./automatic.md) | `tsclang migrate`：试运行、--fix、--check、自动转换列表 |
| [手动迁移](./manual.md) | 哪些可以原样工作，哪些需要手动修复 |
| [不兼容模式](./incompatible.md) | 没有对应的构造和替代方案 |
| [新功能](./new-features.md) | 所有权、Ref/Mut/Shared、match、throws 等 |

## 错误

| 错误 | 原因 |
|-------|-------|
| `undefined is not defined` | 使用了 `undefined` — 替换为 `null` |
| `throw requires Error instance` | 抛出字符串或数字 — 用 `new Error()` 包装 |
| `export default is not supported` | 替换为命名导出 |
| `extends is not supported` | 类继承 — 替换为组合 |

## 参见

- [简介：什么是 TSClang](../01-intro/what-is-tsclang.md) — 语言概览和理念
- [构建：CLI](../09-build/cli.md) — `tsclang build`、`tsclang migrate` 命令
- [内存模型](../05-memory/index.md) — 所有权、借用检查器、Ref/Mut/Shared
