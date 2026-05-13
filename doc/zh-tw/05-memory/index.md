# 記憶體模型

[← 上一級](../index.md) | [下一頁 →](./ownership-types.md)

---

TSClang 使用**混合記憶體管理模型**：靜態所有權/借用檢查器 + 選用 ARC。無 GC，無需手動 `free`。

## 原理

編譯器靜態追蹤每個值的所有者。記憶體釋放是確定性的，在所有者的作用域結束時進行。對於靜態分析不足的情況（圖、循環）— 使用含原子參照計數的 `Shared<T>`（ARC）。

## 所有權型別

| 型別 | 語義 | 說明 |
|------|-----------|-------------|
| `T` | **所有者** | 完全所有權，轉移時 move |
| `Ref<T>` | **不可變借用** | 唯讀，不可修改或刪除 |
| `Mut<T>` | **可變借用** | 可讀寫，同一時刻只能有一個 `Mut` |
| `Shared<T>` | **ARC** | 強參照，增加參照計數，僅限桌面端 |
| `Weak<T>` | **弱參照** | 不增加參照計數，打破循環 |
| `Slice<T>` | **借用陣列檢視** | 零複製子範圍，指標 + 長度 |

## 基本規則

- **基本型別**（`i8`..`i64`、`u8`..`u64`、`f32`、`f64`、`boolean`）— 始終**複製**，借用檢查器不適用
- **複雜型別**（陣列、物件、字串、類別）— 由所有權系統管理
- `string` — 堆積分配的所有者，以 `Ref<string>` 傳遞，透過 `clone()` 複製

## 借用檢查器

**別名互斥可變**規則：不允許兩個 `Mut` 同時存在，不允許 `Mut` + `Ref` 同時存在，但允許多個 `Ref` 同時存在。

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // ok — 允許多個 Ref
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // error: 已存在活動的 Mut
```

## 自動釋放

編譯器在所有者的作用域末尾插入 `free()`。存在多個 `return` 和 `throw` 時 — 透過 `goto cleanup` 實現單一清理點：

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... work ...
cleanup:
    if (u) User_free(u);
}
```

## 子頁面

| 頁面 | 說明 |
|------|-------------|
| [Ownership Types](./ownership-types.md) | 所有所有權型別及其 C 表示的概覽 |
| [Owner (T)](./owner.md) | 完全所有權，賦值和轉移時 move |
| [Ref<T>](./ref.md) | 不可變借用，檢視模式 |
| [Mut<T>](./mut.md) | 可變借用，獨占規則 |
| [Shared<T> and Weak<T>](./shared.md) | 用於圖和循環的 ARC 與弱參照 |
| [Slice<T>](./slice.md) | 陣列或字串部分的零複製檢視 |
| [Borrow checker](./borrow-checker.md) | 別名規則、生命週期、作用域約束 |
| [Drop and cleanup](./drop.md) | 自動釋放、`goto cleanup` |
| [Destructuring](./destructuring.md) | 解構欄位時的借用與 move |
| [Closures](./closures.md) | 捕獲規則：複製、Ref、Mut、move |
| [Iterators](./iterators.md) | `Iterable<T>`、基於堆疊的拉取迭代器 |

## C 輸出

```typescript
let user = new User();
user.name = "Alice";
// 作用域結束 — User_free 自動呼叫
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... usage ...
User_free(&user);   // 由編譯器插入
```

## 錯誤

| 錯誤 | 原因 |
|-------|-------|
| `use of moved value: "x"` | 在 move 後存取變數 |
| `already borrowed as Mut` | 在 `Mut` 活動期間第二次借用 `Mut` 或 `Ref` |
| `already borrowed as Ref` | 在 `Ref` 活動期間借用 `Mut` |
| `Ref<T> not allowed in class field` | 嘗試在 class 欄位中儲存借用 |
| `cannot move out of array by index` | 對擁有型別使用 `arr[i]`，未使用 `.remove()` |

## 參見

- [Variables: let / const](../02-syntax/variables/index.md) — `let`/`const` 對 `Mut<T>` / `Ref<T>` 的影響
- [Functions](../02-syntax/functions/declaration.md) — 參數傳遞規則
- [Classes](../04-classes/index.md) — `mut` 方法和 `readonly` 欄位
- [Errors](../06-errors/index.md) — `goto cleanup` 在 `throw` / `?` 時的行為
