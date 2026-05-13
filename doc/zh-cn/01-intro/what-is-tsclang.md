# TSClang 是什么

[← 上一级](./index.md) | [下一页 →](./design-philosophy.md)

---

TSClang 是一门使用 TypeScript 语法的编译型语言，将 `.tsc` 文件翻译为可读的 C 代码，并自动生成 `CMakeLists.txt`。

## 为什么

许多开发者从 TypeScript 转向 C —— 而这很痛苦。C 缺乏像样的生态：没有包管理器、没有便捷的交叉编译、没有内置的内存安全检查。

TSClang 解决了这个问题：

- **熟悉的语法** —— TS 开发者能立即识别这些构造并上手工作
- **安全的内存** —— 编译时所有权和借用检查，无 GC
- **统一的生态** —— 依赖管理、交叉编译、开箱即用的构建
- **可读的 C 输出** —— 可以检查、调试，并与手写 C 代码结合

## 用于什么

**现在：**

- 服务器代码 —— HTTP、套接字、后端
- 桌面 —— CLI/TUI、文件管理器、办公应用

**重要：**

- 系统层 —— 驱动、操作系统
- 嵌入式 —— Arduino、ESP、树莓派
- 游戏 —— 通过 OpenGL、DirectX

**梦想：**

- 跨平台 —— Windows、Linux、Mac、Android、iOS
- 复古平台 —— ZX Spectrum、NES、世嘉、MS-DOS

## 文件扩展名

`.tsc` —— TSClang 源文件。

```typescript
// hello.tsc
console.log("Hello world")
```

编译为：

```c
// hello.c
#include "runtime.h"
int main(void) {
    tsc_console_log(tsc_string_from_cstr("Hello world"));
    return 0;
}
```

## 参见

- [设计理念](./design-philosophy.md) —— 语言的三个优先级
- [快速开始](./quick-start.md) —— 安装和第一个项目
- [内存模型](../05-memory/index.md) —— 所有权和借用检查器
