# CLI —— 命令概览

[← 上一级](./index.md) | [上一页 ←](./quick-start.md)

---

## 命令列表

| 命令 | 别名 | 说明 |
|------|------|------|
| `tsclang init` | — | 创建新项目 |
| `tsclang build` | `b` | 构建项目 |
| `tsclang run` | `r` | 构建并运行 |
| `tsclang lint` | `l` | 检查代码格式 |
| `tsclang migrate` | — | TypeScript → TSClang 迁移 *(路线图)* |
| `tsclang lsp` | — | 用于 IDE 的语言服务器协议 *(路线图)* |

别名：

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

从模板创建项目。

```bash
tsclang init myapp                    # 可执行文件（默认）
tsclang init mylib --library          # TSClang 库
tsclang init sqlite3 --declaration    # C 包装器（C 库的包装）
tsclang init                          # 在当前目录
```

短标志：`-l`（库）、`-d`（声明）。

## tsclang build

编译 `.tsc` → `.c` → 二进制（默认）。

```bash
tsclang build                  # 构建默认 build
tsclang build <name>           # 构建配置中的特定 build
tsclang build hello.tsc        # 单文件
tsclang build --emit c         # 仅生成 C
tsclang build --emit binary    # C + 编译为二进制（默认）
tsclang build --emit hex       # C + avr-gcc → .hex（用于 AVR）
tsclang build --outDir ./dist  # 覆盖 outDir
tsclang build --target desktop # 显式指定目标
tsclang build --clean          # 完全重建（无缓存）
```

## tsclang run

构建并运行二进制文件。相当于 `tsclang build` + 运行。

```bash
tsclang run
tsclang run -- args...         # 向程序传递参数
```

仅适用于 `emit: "binary"`。

## tsclang lint

检查代码风格。对于 CI —— `tsclang lint`（不带 `-fix`）在违规时返回退出码 1。

```bash
tsclang lint          # 检查但不修改
tsclang lint --fix    # 原地格式化代码（类似 prettier / gofmt）
```

与 `tsclang build` 的区别：

| 命令 | 检查内容 |
|------|----------|
| `tsclang build` | 语义错误，忽略格式 |
| `tsclang lint` | 语义 + 风格警告，违规时退出码 1 |
| `tsclang lint --fix` | 自动格式化代码 |

## tsclang migrate *(路线图)*

TypeScript 代码迁移到 TSClang。

```bash
tsclang migrate ./src            # 显示将会发生什么（模拟运行）
tsclang migrate ./src --fix      # 应用修改
tsclang migrate ./src --check    # CI 模式：如果存在不兼容性则退出码 1
```

## tsclang lsp *(路线图)*

用于 IDE 的语言服务器协议（VS Code、Neovim 等）。

```bash
tsclang lsp               # stdio 传输
tsclang lsp --port 7777   # TCP 传输
```

## 参见

- [快速开始](./quick-start.md) —— 安装和第一个项目
- [构建系统](../09-build/index.md) —— 配置、配置文件、平台
- [迁移指南](../12-migration/index.md) —— 移植 TS 代码
