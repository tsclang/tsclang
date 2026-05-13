# TSClang 文档计划

## 目标

基于规范编写全面的开发者英文文档。
文档应当实用、面向用户（面向开发者），而非面向编译器作者。

## 目标受众

1. 想要开始使用 TSClang 的 TypeScript 开发者
2. 评估该语言用于嵌入式开发的开发者
3. 查找特定 API 的开发者（字符串方法、所有权类型、HTTP 服务器）

## 写作原则

- 语言：英语
- 代码示例：可运行、精简，注释使用英语
- 结构：由浅入深
- 每个章节独立成篇 —— 可以单独阅读
- 章节之间交叉引用，便于深入学习

## 文件结构

**嵌套结构：** 每个方法、函数、类型和构造都有独立的文件。
没有 50 KB 的庞然大物页面。如果一个方法有 3 种调用变体 —— 那就是方法目录下的 3 个文件。

示例结构：

```
doc/
  02-syntax/
    index.md                        # 章节概览 + 链接
    variables/
      let.md
      const.md
    functions/
      declaration.md
      arrow.md
      anonymous.md
      iife.md
      default-params.md
      overload.md
        by-type.md
        by-count.md
        priority.md
    loops/
      for.md
      for-of.md
      while.md
      do-while.md
      break-continue.md
    match/
      syntax.md
      patterns/
        literal.md
        range.md
        destructuring.md
        wildcard.md
        union.md
      exhaustiveness.md
      vs-switch.md
    operators/
      arithmetic.md
      assignment.md
      comparison.md
      logical.md
      bitwise.md
      ternary.md
      optional-chaining.md
      nullish-coalescing.md
      spread.md
    truthy-falsy.md
    slices.md
```

## 文件内容规则

每个文件描述**一个**方法 / 函数 / 构造 / 类型，必须包含：

### 1. 完整描述

它是什么、为什么需要、如何工作。没有废话 —— 具体且切中要点。
提及边界情况和非直观的行为。

### 2. 签名 / 语法

精确的签名，包含参数类型和返回类型。
如果一个方法有多个变体（重载）—— 分别描述每个变体。

### 3. 用法或实现示例

每个变体至少一个可运行的示例。
示例应当精简 —— 没有不必要的上下文。
每个示例都标明结果（注释 `// →`）。

### 4. C 输出

对于每个示例 —— 它如何编译为 C。
展示生成的 C 代码，以便开发者理解底层发生了什么。
对于所有权构造（move、borrow、drop、cleanup）尤其重要。

### 5. 错误与修复

使用不当时的典型编译器错误。
格式：`错误代码 → 错误文本 → 修复后的代码`。
必须包含编译器提示。

### 6. 导航和链接

每个文件必须包含导航链接：

**导航栏** —— 在文件顶部，标题之后：

```markdown
[← 上一级](./index.md) | [下一页 →](./filter.md) | [上一页 ←](./sort.md)
```

三个链接：
- **上一级** (`←`) —— 跳转到父目录的 `index.md`（章节概览）
- **下一页** (`→`) —— 跳转到同级别的下一个文件（按逻辑顺序，而非字母顺序）
- **上一页** (`←`) —— 跳转到同级别的上一个文件

章节中的第一个文件没有"上一页"，最后一个没有"下一页"。

**交叉引用** —— 在文件末尾，"参见"部分：

```markdown
## 参见

- [filter](./filter.md) —— 过滤元素
- [reduce](./reduce.md) —— 累加
- [forEach](./for-each.md) —— 无结果迭代
```

链接到其他章节中的相关构造 —— 使用完整路径：

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) —— 元素的借用
```

**每个目录中的 index.md** —— 章节概览，包含指向所有子文件的链接。
作为自上而下导航的入口点。

示例文件模板：

```markdown
# map

通过对源数组的每个元素应用一个函数来创建新数组。

## 签名

\`\`\`typescript
arr.map<U>(f: (Ref<T>) => U): U[]
\`\`\`

回调接收 `Ref<T>` —— 元素的借用，而非所有权。

## 示例

### 基本用法

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
const doubled = nums.map(x => x * 2)
// → [2, 4, 6]
\`\`\`

### C 输出

\`\`\`c
int32_t* doubled = malloc(3 * sizeof(int32_t));
for (size_t i = 0; i < 3; i++) {
    doubled[i] = nums[i] * 2;
}
\`\`\`

### 类型转换

\`\`\`typescript
const names: string[] = users.map(u => u.name)
// → ["Alice", "Bob"]
\`\`\`

## 错误

### 回调修改元素

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => { x++ })  // error: cannot assign to Ref<i32>
\`\`\`

修复：

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => x * 2)  // return a new value
\`\`\`

## 参见

- [filter](./filter.md)
- [reduce](./reduce.md)
- [flatMap](./flat-map.md)
```

---

## 文档结构

### 01-intro.md —— TSClang 简介

**目标：** 解释它是什么、为什么存在，并提供一个首次运行的示例。

- TSClang 是什么（TS 语法 → C，Rust 安全性，npm 生态）
- 设计理念（3 个优先级：安全、性能、TS 语法）
- 使用场景（桌面、嵌入式、服务器、复古平台）
- 快速开始：安装、`hello world`、构建和运行
- 环境要求（Node.js、CMake、gcc/clang）
- CLI 概览：`tsclang build`、`tsclang lint`、`tsclang lsp`

**来源：** `spec/01-intro.md`

---

### 02-syntax.md —— 语法

**目标：** 完整描述语言语法。

- 格式化（ASI、K&R、缩进、引号、尾随逗号）
- 变量：`let` / `const` —— 在所有权上下文中的区别
- 函数：`function`、箭头、匿名、IIFE
- 参数：默认、剩余
- 函数重载（按类型和数量、解析优先级）
- 运算符：算术、赋值、比较、逻辑、位运算
- 真值 / 假值（按类型的表格）
- 循环：`for`、`for-of`、`while`、`do-while`、`break`/`continue`、标签
- `switch` / `match` —— 比较、穷尽性
- 展开运算符（数组、对象、所有权规则）
- 索引和切片（数组和字符串、负索引）

**来源：** `spec/02-syntax.md`

---

### 03-types.md —— 类型系统

**目标：** 描述类型、所有类型和转换。

- 结构类型与名义类型（`type`、`interface`、`class`）
- 类型推断
- 数字类型（`i8`..`i64`、`u8`..`u64`、`f32`、`f64`）
  - 字面量（十六进制、二进制、八进制、`_` 分隔符）
  - 自动转换（3 种机制：拓宽、编译时、`as`）
  - `usize` —— 平台类型
  - `number` = `f64`（可覆盖）
  - AVR 上的性能警告
- `string` —— UTF-8 字节、C 布局、索引、迭代、内置方法
- 特殊类型：`void`、`never`、`any`
- 空值：`T | null`、可选 `?`、可选链 `?.`、空值合并 `??`
  - `T | null` 的 C 表示（带标志的结构体）
  - 嵌入式模式：哨兵值、独立标志
- 类型转换：数字 ↔ 字符串、JS 兼容函数（`parseInt`、`parseFloat`）
- `Date` —— 创建、方法、格式化
- 数组：`T[]`（动态）、`T[N]`（固定）、方法、函数式方法
- `Slice<T>` / `MutSlice<T>` —— 零拷贝视图
- `Map<K,V>`、`Set<T>` —— API、所有权、嵌入式模式
- `Object` —— 静态方法
- 元组：固定、带标签、只读、可选、剩余、展开
- `Clone` —— 接口、`clone()`、`structuredClone()`
- 类型别名（`type`）
- 字符串字面量联合
- 实用类型：`Partial`、`Required`、`Readonly`、`NonNullable`、`Pick`、`Omit`、`Record`、`ReturnType`、`Parameters`、`Awaited`
- `Buffer`、`DataView`

**来源：** `spec/03-types.md`

---

### 04-classes.md —— 类、接口、枚举、泛型

**目标：** 语言的对象系统。

- 泛型：语法、边界（`implements`/`extends`）、单态化、泛型的所有权
- 扩展方法：声明、导入、冲突
- 枚举：数字、字符串、`const enum`、工具、在 switch/match 中
- 接口：数据 vs 带方法的契约、胖指针、虚函数表
- `instanceof` —— 通过虚函数表进行类型收窄
- 类：
  - 无继承（除 `extends Error` 外），组合
  - 修饰符：`public`、`private`、`static`、`mut`、`move`
  - `this` 和字段访问的语义
  - `readonly` 字段
  - 构造函数：自动生成、显式、`private`
  - 值对象模式
  - 使用 `move` 的构建器模式
- 对齐：`@packed`、`@align(N)`、填充诊断
- 装饰器：概览，引用完整章节

**来源：** `spec/04-classes.md`、`spec/13-decorators.md`

---

### 05-memory.md —— 内存模型和所有权

**目标：** 语言的关键特性 —— 安全内存管理。

- 所有权类型：`T`（所有者）、`Ref<T>`、`Mut<T>`、`Shared<T>`、`Weak<T>`、`Slice<T>`
- 基本规则：基元类型复制，复杂类型 —— 所有权
- 所有者（T）：赋值和传递时移动
- `Ref<T>`：不可变借用、规则、禁止用于字段、变通模式
- `Mut<T>`：可变借用、一次只能有一个
- `Shared<T>`：ARC、`Weak<T>` 用于打破循环
- 借用检查器规则（4 条规则）
- 参数传递矩阵（let/const/Ref/Mut/Shared → Ref/Mut/T/Shared）
- 内部可变性 —— 为什么不提供
- `@static let` —— 全局可变状态
- 作用域约束（无生命周期标注）：4 条规则
- 自动 Drop 和 `goto cleanup`
- `Iterable<T>` —— 用户定义的迭代类型
- 字段访问和解构（借用 vs 移动）
- 切片（借用 vs 拥有）
- 从数组移动、借用期间修改
- 从方法返回借用
- 闭包：捕获规则、显式捕获列表、通过 await 实现 Mut-闭包

**来源：** `spec/05-memory.md`

---

### 06-errors.md —— 错误处理

**目标：** 错误系统 —— 基于 Result，不使用 setjmp/longjmp。

- 原则：`throw`/`try`/`catch` 在 TS 中 → Result 结构在 C 中
- 在签名中声明 `throws`
- `Error` —— 基类、`error.stack`
- `throw`、`try`/`catch`/`finally`
- 联合 catch、穷尽处理
- `?` 运算符（传播）
- `!` 运算符（解包/恐慌）
- C 输出：Result 结构、`if/else` 判断 `ok` 和 `_kind`
- 错误期间的所有权（通过 `goto` 清理）
- 局限性

**来源：** `spec/06-errors.md`

---

### 07-concurrency.md —— 并发

**目标：** 三个层次的并发以及如何使用它们。

- 三种机制概览（异步/等待、线程、ISR）
- **异步/等待：**
  - 异步运行时架构（状态机）
  - 状态机大小、嵌入式栈安全
  - `Promise<T>`：创建、`.then`/`.catch`/`.finally`
  - `Promise.all`、`Promise.any`、`Promise.race`、`Promise.allSettled`
  - `await` 规则、`async main`
  - 递归异步函数
  - `@embedded.stack` —— 显式栈
  - 任务取消：`AbortController`、`AbortSignal`
  - `AsyncMutex`
- **线程（std/threads）：**
  - 无共享内存的隔离
  - `Atomic<T>`、`AtomicArray<T>`
  - `channel<T>`：有界 MPMC、ISR 安全操作
  - `select`：在多个通道上等待
  - `Readonly<T>`：零拷贝共享
  - `Thread<T>`：带类型的结果
  - Thread.spawn 规则、Send 检查
- **@embedded.isr：**
  - `Volatile<T>` —— MMIO 寄存器
  - ISR：签名、规则、模式
  - `std/sync` —— 临界区
  - `EmbeddedSignal` —— ISR → 异步桥接
- 嵌入式注解：`@embedded.inline`、`@embedded.noHeap`
- `@signal` —— POSIX 信号（桌面）
- 异步生成器：`async function*`、`for await`、`close()`
- 通过生成器实现协作式多任务

**来源：** `spec/07-concurrency.md`

---

### 08-modules.md —— 模块和 C 互操作

**目标：** 模块系统如何工作以及 C 互操作。

- 导出：命名、`export default` 被禁止
- 导入：命名、命名空间、`import type`
- 模块初始化顺序、循环导入
- 模块级变量
- 路径别名（`#`、`~`）
- 入口点：`"main"`、`"builds"`、C main 生成
- 库：`"type": "library"`
- `.d.tsc` 文件：5 种声明
  - C 结构体、不透明类型、C 函数、常量、MMIO 寄存器
  - 链接配置（system、bundled、fetch）
- `native` —— 内联 C（语法、插值、局限性）
- 回调：`FnPtr<T>`、`TSC_CLOSURE_*` 宏
- `unsafe {}` —— 禁用检查
- `@platform` —— 条件编译
- 声明合并
- 变长 C 函数：`Scalar` 类型

**来源：** `spec/08-modules.md`

---

### 09-build.md —— 构建系统

**目标：** 项目、构建和包的结构。

- 项目类型：可执行文件、库、C 包装器、平台包
- `tsc.package.json`：所有字段
- C 包装器：结构、发布、链接配置（system/bundled/fetch）
- 平台包：`declare platform {}`、平台字段
- CLI：`tsclang build`、标志（`--outDir`、`--target`、`--profile`、`--optimize`）
- 包管理器：`tsclang install`、`tsclang publish`、`tsclang search`
- 单仓库：`"workspaces"`
- 嵌入式构建：AVR、ARM、复古平台
- CMakeLists.txt：生成、自定义
- 配置文件：debug/release、优化

**来源：** `spec/09-build.md`

---

### 10-stdlib.md —— 标准库

**目标：** 所有 stdlib 模块的参考。

- 原则：通过 `std/` 统一 API、懒加载、树摇
- 全局对象：`console`、`Math`、process、timers、`performance`
- `Error` —— 基类
- `Map<K,V>`、`Set<T>` —— API、所有权
- `Buffer`、`DataView`
- `std/io` —— Reader/Writer
- `std/fs` —— 文件操作
- `std/net` —— fetch、HTTP 服务器、TCP/UDP
- `std/ws` —— WebSocket
- `std/math` —— 常量和方法（完整表格）
- `std/string` —— Unicode、编码、格式化
- `std/json` —— 解析和序列化
- `std/url` —— URL 和 URLSearchParams
- `std/blob` —— Blob 和 File
- `std/formdata` —— multipart/form-data
- `std/regex` —— NFA 正则、语法、API
- `std/random` —— Random、HardwareRandom
- `std/temporal` —— PlainDateTime、Instant、Duration
- `std/reactive` —— ReactiveVar、computed、effect
- `std/hal` —— GPIO、UART、SPI、I2C
- `std/embedded` —— Volatile、指针、HashMap、StaticMap
- 平台兼容性（表格）

**来源：** `spec/10-stdlib.md`、`spec/19-stdlib-*.md`

---

### 11-compiler.md —— 编译器架构

**目标：** 面向贡献者和想要理解内部原理的人。

- 编译阶段（Parse → AST → Decorator → Typecheck → IR → Codegen）
- IR：基本块、指令、phi 节点
- 名称修饰（形式化方案）
- 调试信息：`#line` 指令、DAP 服务器
- 消费端单态化
- 增量编译（路线图）
- 优化级别（O0–O3、Os）
- 错误消息：格式、分类、错误代码

**来源：** `spec/11-compiler.md`

---

### 12-migration.md —— 迁移指南：TypeScript → TSClang

**目标：** 帮助 TS 开发者迁移代码。

- 自动修复（`tsclang migrate`）
- 开箱即用（示例）
- 需要手动修复的内容（特定模式）
- 不兼容模式（替代方案表格）
- TSClang 新增的内容（TS 中没有的）

**来源：** `spec/12-migration.md`

---

## 章节汇总表

| # | 文件 | 内容 | 来源 | 大小 |
|---|------|------|------|------|
| 01 | intro | TSClang 是什么、快速开始、CLI | `spec/01-intro.md` | ~30 KB |
| 02 | syntax | 语法、运算符、循环、match/switch | `spec/02-syntax.md` | ~50 KB |
| 03 | types | 类型、数字、字符串、数组、Map/Set、元组、实用类型 | `spec/03-types.md` | ~80 KB |
| 04 | classes | 类、接口、枚举、泛型、扩展方法 | `spec/04-classes.md`、`spec/13-decorators.md` | ~40 KB |
| 05 | memory | 所有权、借用检查器、Ref/Mut/Shared、闭包 | `spec/05-memory.md` | ~50 KB |
| 06 | errors | throw/try/catch、Result、`?`/`!` 运算符 | `spec/06-errors.md` | ~15 KB |
| 07 | concurrency | 异步/等待、线程、ISR、原子、通道、生成器 | `spec/07-concurrency.md` | ~70 KB |
| 08 | modules | 导入/导出、.d.tsc、原生、unsafe、@platform | `spec/08-modules.md` | ~50 KB |
| 09 | build | 构建、包、C 包装器、平台 | `spec/09-build.md` | ~50 KB |
| 10 | stdlib | 所有 std 模块的参考 | `spec/10-stdlib.md`、`spec/19-stdlib-*.md` | ~60 KB |
| 11 | compiler | 编译器架构（面向贡献者） | `spec/11-compiler.md` | ~30 KB |
| 12 | migration | TypeScript → TSClang 迁移指南 | `spec/12-migration.md` | ~15 KB |
| | | | **总计** | **~540 KB** |

## 推荐写作顺序

推荐顺序（从最重要和最常见到高级）：

1. `01-intro.md` —— 所有人的入口点
2. `02-syntax.md` —— 基本构造
3. `05-memory.md` —— 关键特性，每个人都需要
4. `03-types.md` —— 类型系统
5. `04-classes.md` —— 对象系统
6. `06-errors.md` —— 错误处理
7. `08-modules.md` —— 模块和 C 互操作
8. `07-concurrency.md` —— 并发
9. `10-stdlib.md` —— API 参考
10. `09-build.md` —— 构建系统
11. `12-migration.md` —— 从 TS 迁移
12. `11-compiler.md` —— 内部原理（面向贡献者）

## 大小估算

| 文档 | 估算大小 |
|------|----------|
| 01-intro | ~30 KB |
| 02-syntax | ~50 KB |
| 03-types | ~80 KB |
| 04-classes | ~40 KB |
| 05-memory | ~50 KB |
| 06-errors | ~15 KB |
| 07-concurrency | ~70 KB |
| 08-modules | ~50 KB |
| 09-build | ~50 KB |
| 10-stdlib | ~60 KB |
| 11-compiler | ~30 KB |
| 12-migration | ~15 KB |
| **总计** | **~540 KB** |

## 格式

- Markdown (.md)
- 每个文件是一个独立的章节
- H1 标题用于章节标题，H2/H3 用于子章节
- 表格用于参考信息
- 带语言标识符的代码块（```typescript、```c、```bash）
- `> **Note:**` 用于重要说明
- `> **Warning:**` 用于关键限制
