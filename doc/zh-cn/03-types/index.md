# 类型系统

[← 上一级](../index.md) | [下一页 →](./numbers.md)

---

TSClang 的类型系统是静态的，支持类型推断和三个安全级别：编译时检查、所有权/借用检查器和可选的 ARC。

## 两层类型体系

TSClang 将类型分为**结构性**和**名义性**两类：

| 构造 | 类型体系 | 对象字面量 | C 输出 |
|-----------|--------|-----------------|----------|
| `type Foo = { ... }` | 结构性 | ✅ | `typedef struct`，禁止方法 |
| `interface Foo { ... }` | 结构性 | ✅（若无方法） | `typedef struct` 或胖指针 + vtable |
| `class Foo { ... }` | **名义性** | ❌ | struct + 方法 |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // ok — 结构兼容
const v: Vector = p                     // ok — 字段相同

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // error — class 是名义类型
```

`type` 与 `interface` 的关键区别：
- `type Point = { x: f64; y: f64 }` — **保证**是不带 vtable 的数据结构。编译器会禁止方法。用于嵌入式 MMIO、二进制结构体、ABI 关键代码。
- `interface Point { x: f64; y: f64 }` — 当前是数据结构，但将来可以扩展方法（届时 ABI 将切换为 vtable）。

## 类型推断

若未显式指定类型，则由编译器推断：

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — 匿名结构体
const s = "hello"            // → string
const n = 42                 // → number（桌面端为 f64）
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[]（= f64[]）
```

显式注解可覆盖推断结果：`const i: i32 = 1` → `i32`。

## 数值类型自动转换

三种机制，按顺序应用。第一个适用的机制生效。

### 机制 1 — 类型级拓宽（let 和 const）

仅作用于类型，不查看值。无条件安全。

| From | To | 说明 |
|------|-----|---------|
| `i8`/`i16`/`i32` | `i64` | 同符号，无损失 |
| `u8`/`u16`/`u32` | `u64` | 同符号，无损失 |
| `u8` | `i16` | 全部 256 个值都适用 |
| `u16` | `i32` | 全部 65,536 个值都适用 |
| `u32` | `i64` | 全部 4.3G 个值都适用 |
| `i32`、`u32` | `f64` | 无损失（53 位尾数） |
| `f32` | `f64` | 无损失 |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 始终可放入 i64
```

### 机制 2 — 编译时值分析（仅限 const）

当两个操作数均为具有已知字面量值的 `const`，且机制 1 不适用时。逐步算法 — 参见 [Numeric Types → Autocast](./numbers.md)。

### 机制 3 — 显式 `as`（用于 let）

若机制 1 不适用于 `let` 变量 — 则需要显式转换：

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // error — 无类型级拓宽
let c: f64 = (a + (b as i64)) as f64  // ok
```

每种机制的详细说明 — 参见 [Numeric Types](./numbers.md) 页面。

## 子页面

| 页面 | 说明 |
|------|-------------|
| [Numeric Types](./numbers.md) | i8..i64、u8..u64、f32、f64、usize、number、autocast、`as` |
| [Strings](./strings.md) | UTF-8 字符串、字面量、方法、std/string |
| [Special Types](./special-types.md) | any、never、void、unknown |
| [Null](./null.md) | 可空类型、可选链、`??` |
| [Arrays](./arrays.md) | 动态数组、固定数组、Slice<T> |
| [Map and Set](./map-set.md) | 哈希表和集合 |
| [Tuples](./tuples.md) | 元组、标签、只读、可选、rest |
| [Clone](./clone.md) | 显式克隆拥有值 |
| [Type Aliases](./type-aliases.md) | `type`、不透明别名、字符串字面量联合 |
| [Utility Types](./utility-types.md) | Partial、Required、Readonly、Pick、Omit、Record 等 |
| [Date](./date.md) | 兼容旧版 JS 的日期/时间类型 |

## 错误

| 错误 | 原因 |
|-------|-------|
| `expected f64, got i32` | 不兼容的数值类型，无自动转换 |
| `empty object literal is forbidden` | 空 `{}` — 请使用 `Map<K,V>` 或声明类型 |
| `cannot use "void" as variable type` | `void` 只能用于函数返回类型 |
| `non-nullable runtime union: string \| i32` | 禁止非可空联合类型，请使用 interface 或 discriminated union |

## 参见

- [Variables: let / const](../02-syntax/variables/index.md) — `let`/`const` 对类型和自动转换的影响
- [Memory Model](../05-memory/index.md) — 所有权、`Ref<T>`、`Mut<T>`
- [Classes and Interfaces](../04-classes/index.md) — 名义类型、泛型
- [Error Handling](../06-errors/index.md) — `throws`、`T | null` 与 `T throws E`
