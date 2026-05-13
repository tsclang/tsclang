# 快速开始

[← 上一级](./index.md) | [下一页 →](./cli.md) | [上一页 ←](./design-philosophy.md)

---

## 环境要求

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16（用于二进制编译）
- **C 编译器** —— gcc、clang 或 avr-gcc（用于 AVR）

## 安装

```bash
npm install -g tsclang

tsclang --version
```

无需安装即可运行：

```bash
npx tsclang build
```

## 创建项目

```bash
tsclang init myapp
cd myapp
```

创建如下结构：

```
myapp/
  tsc.package.json
  src/
    main.tsc
```

`tsc.package.json`：

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc"
}
```

## Hello world

`src/main.tsc`：

```typescript
console.log("Hello world")
```

## 构建和运行

```bash
tsclang build                  # 生成 C + 编译为二进制
tsclang build --emit c         # 仅生成 C（不编译）
tsclang run                    # 构建并运行
```

构建结果：

```
dist/
  main.c              # 生成的 C 代码
  CMakeLists.txt      # 用于手动构建
  myapp               # 二进制文件（如果 --emit binary）
```

## 单文件构建

没有 `tsc.package.json` 时 —— 直接传入文件：

```bash
tsclang build hello.tsc
```

## 下一步

- [语法](../02-syntax/index.md) —— 语言构造
- [内存模型](../05-memory/index.md) —— 所有权、借用、`Ref<T>`
- [CLI](./cli.md) —— 所有命令

## 参见

- [CLI](./cli.md) —— 完整命令说明
- [构建系统](../09-build/index.md) —— 配置、平台、配置文件
