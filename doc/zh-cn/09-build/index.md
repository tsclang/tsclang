# 构建系统

[← 上一级](../index.md) | [下一页 →](./projects.md)

---

TSClang 的构建系统将 `.tsc` 文件编译为 C99，并通过 CMake 构建二进制文件。支持桌面应用程序、库、原生 C 库的 C 包装器，以及嵌入式目标（AVR、ARM、复古平台）。

## 构建流程

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (或 .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

`outDir` 结构：

```
build/desktop/
  c/              ← 生成的 .c 和 .h
  CMakeLists.txt
  myapp           ← 二进制文件 (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## 快速开始

```bash
npm install -g tsclang   # 安装编译器
tsclang init myapp       # 创建项目
cd myapp
tsclang install          # 安装依赖
tsclang run              # 构建并运行
```

## 项目类型

| 类型 | 说明 | `"type"` | 入口点 |
|------|-------------|----------|-------------|
| **可执行文件** | 应用程序 | 未指定（默认） | `"main"`（必需） |
| **TSClang 库** | TSClang 库 | `"library"` | `index.tsc`（约定） |
| **C 包装器** | C 库的包装器 | `"library"` | `index.d.tsc` |
| **平台配置文件** | 平台配置文件 | `"platform"` | `index.d.tsc` |

## CLI 命令

| 命令 | 别名 | 说明 |
|---------|-------|-------------|
| `tsclang init` | — | 创建新项目 |
| `tsclang build` | `b` | 构建项目 |
| `tsclang run` | — | 构建并运行 |
| `tsclang dev` | — | 监视模式 |
| `tsclang install` | `i` | 安装依赖 |
| `tsclang update` | `u` | 更新依赖 |
| `tsclang remove` | `r` | 移除依赖 |
| `tsclang clean` | `c` | 移除构建产物 |
| `tsclang lint` | `l` | 检查格式 |
| `tsclang migrate` | — | TypeScript → TSClang 迁移 *(路线图中)* |
| `tsclang lsp` | — | 语言服务器协议 *(路线图中)* |

## 子页面

| 页面 | 说明 |
|------|-------------|
| [项目类型](./projects.md) | 可执行文件、库、C 包装器、平台配置文件 |
| [配置](./config.md) | `tsc.package.json` 的字段、构建、platformSettings |
| [CLI](./cli.md) | build、run、init、lint、migrate、lsp 命令 |
| [包管理器](./packages.md) | install、publish、search、workspaces、lock 文件 |
| [嵌入式构建](./embedded.md) | AVR、ARM、复古平台、binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt、debug/release 配置、优化 |

## C 输出

```c
// build/desktop/c/main.c — 从 src/main.tsc 生成
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## 错误

| 错误 | 原因 |
|-------|-------|
| `cannot determine entry point` | 可执行文件未指定 `"main"` 字段 |
| `unknown target arch '6502'` | 没有平台配置文件时使用了未知架构 |
| `toolchain 'avr-gcc' not found in PATH` | 编译器未安装 |
| `dependency conflict` | 不兼容的 semver 约束 |

## 参见

- [模块：导入/导出](../08-modules/import-export.md) — 入口点和初始化
- [内存：所有权](../05-memory/ownership-types.md) — FFI 期间的 owned/borrow
- [并发](../07-concurrency/index.md) — 异步运行时：libuv、协程、无
