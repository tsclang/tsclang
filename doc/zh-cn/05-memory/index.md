# 内存模型

[← 上一级](../index.md) | [下一页 →](./ownership-types.md)

---

TSClang 使用**混合内存管理模型**：静态所有权/借用检查器 + 可选 ARC。无 GC，无需手动 `free`。

## 原理

编译器静态跟踪每个值的所有者。内存释放是确定性的，在所有者的作用域结束时进行。对于静态分析不足的情况（图、循环）— 使用带原子引用计数的 `Shared<T>`（ARC）。

## 所有权类型

| 类型 | 语义 | 说明 |
|------|-----------|-------------|
| `T` | **所有者** | 完全所有权，转移时 move |
| `Ref<T>` | **不可变借用** | 只读，不可修改或删除 |
| `Mut<T>` | **可变借用** | 可读写，同一时刻只能有一个 `Mut` |
| `Shared<T>` | **ARC** | 强引用，增加引用计数，仅限桌面端 |
| `Weak<T>` | **弱引用** | 不增加引用计数，打破循环 |
| `Slice<T>` | **借用数组视图** | 零拷贝子范围，指针 + 长度 |

## 基本规则

- **基本类型**（`i8`..`i64`、`u8`..`u64`、`f32`、`f64`、`boolean`）— 始终**复制**，借用检查器不适用
- **复杂类型**（数组、对象、字符串、类）— 由所有权系统管理
- `string` — 堆分配的所有者，以 `Ref<string>` 传递，通过 `clone()` 复制

## 借用检查器

**别名异或可变**规则：不允许两个 `Mut` 同时存在，不允许 `Mut` + `Ref` 同时存在，但允许多个 `Ref` 同时存在。

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // ok — 允许多个 Ref
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // error: 已存在活动的 Mut
```

## 自动释放

编译器在所有者的作用域末尾插入 `free()`。存在多个 `return` 和 `throw` 时 — 通过 `goto cleanup` 实现单一清理点：

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... work ...
cleanup:
    if (u) User_free(u);
}
```

## 子页面

| 页面 | 说明 |
|------|-------------|
| [Ownership Types](./ownership-types.md) | 所有所有权类型及其 C 表示的概览 |
| [Owner (T)](./owner.md) | 完全所有权，赋值和转移时 move |
| [Ref<T>](./ref.md) | 不可变借用，视图模式 |
| [Mut<T>](./mut.md) | 可变借用，独占规则 |
| [Shared<T> and Weak<T>](./shared.md) | 用于图和循环的 ARC 与弱引用 |
| [Slice<T>](./slice.md) | 数组或字符串部分的零拷贝视图 |
| [Borrow checker](./borrow-checker.md) | 别名规则、生命周期、作用域约束 |
| [Drop and cleanup](./drop.md) | 自动释放、`goto cleanup` |
| [Destructuring](./destructuring.md) | 解构字段时的借用与 move |
| [Closures](./closures.md) | 捕获规则：复制、Ref、Mut、move |
| [Iterators](./iterators.md) | `Iterable<T>`、基于栈的拉取迭代器 |

## C 输出

```typescript
let user = new User();
user.name = "Alice";
// 作用域结束 — User_free 自动调用
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... usage ...
User_free(&user);   // 由编译器插入
```

## 错误

| 错误 | 原因 |
|-------|-------|
| `use of moved value: "x"` | 在 move 后访问变量 |
| `already borrowed as Mut` | 在 `Mut` 活动期间第二次借用 `Mut` 或 `Ref` |
| `already borrowed as Ref` | 在 `Ref` 活动期间借用 `Mut` |
| `Ref<T> not allowed in class field` | 尝试在 class 字段中存储借用 |
| `cannot move out of array by index` | 对拥有类型使用 `arr[i]`，未使用 `.remove()` |

## 参见

- [Variables: let / const](../02-syntax/variables/index.md) — `let`/`const` 对 `Mut<T>` / `Ref<T>` 的影响
- [Functions](../02-syntax/functions/declaration.md) — 参数传递规则
- [Classes](../04-classes/index.md) — `mut` 方法和 `readonly` 字段
- [Errors](../06-errors/index.md) — `goto cleanup` 在 `throw` / `?` 时的行为
