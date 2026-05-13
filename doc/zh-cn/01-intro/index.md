# TSClang 简介

[← 上一级](../index.md) | [下一页 →](./what-is-tsclang.md)

---

TSClang 是一门使用 TypeScript 语法并编译到 C 的语言。

- **TypeScript 作为语法** —— 熟悉的 `let`/`const`、类、箭头函数、`async`/`await`
- **C 作为编译目标** —— 生成可读的 C 代码 + `CMakeLists.txt`
- **Rust 作为安全模型** —— 所有权、借用检查器、`Ref<T>`、`Mut<T>`
- **npm 作为生态体验** —— `tsc.package.json`、`tsclang install`、包注册表

## 章节

- [TSClang 是什么](./what-is-tsclang.md) —— 为什么、面向谁、使用场景
- [设计理念](./design-philosophy.md) —— 三个优先级：安全、性能、TS 语法
- [快速开始](./quick-start.md) —— 安装、hello world、构建和运行
- [CLI](./cli.md) —— 命令概览：`build`、`init`、`lint`、`migrate`、`lsp`

## 参见

- [语法](../02-syntax/index.md) —— 语言构造
- [内存模型](../05-memory/index.md) —— 所有权和借用检查器
