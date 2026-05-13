# 類型系統

[← 上一級](../index.md) | [下一頁 →](./numbers.md)

---

TSClang 的型別系統是靜態的，支援型別推斷和三個安全層級：編譯時檢查、所有權/借用檢查器和選用的 ARC。

## 兩層類型體系

TSClang 將型別分為**結構性**和**名義性**兩類：

| 構造 | 類型體系 | 物件字面量 | C 輸出 |
|-----------|--------|-----------------|----------|
| `type Foo = { ... }` | 結構性 | ✅ | `typedef struct`，禁止方法 |
| `interface Foo { ... }` | 結構性 | ✅（若無方法） | `typedef struct` 或胖指標 + vtable |
| `class Foo { ... }` | **名義性** | ❌ | struct + 方法 |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // ok — 結構相容
const v: Vector = p                     // ok — 欄位相同

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // error — class 是名義型別
```

`type` 與 `interface` 的關鍵差異：
- `type Point = { x: f64; y: f64 }` — **保證**是不帶 vtable 的資料結構。編譯器會禁止方法。用於嵌入式 MMIO、二進位結構體、ABI 關鍵程式碼。
- `interface Point { x: f64; y: f64 }` — 目前是資料結構，但將來可以擴充方法（屆時 ABI 將切換為 vtable）。

## 型別推斷

若未顯式指定型別，則由編譯器推斷：

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — 匿名結構體
const s = "hello"            // → string
const n = 42                 // → number（桌面端為 f64）
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[]（= f64[]）
```

顯式註解可覆寫推斷結果：`const i: i32 = 1` → `i32`。

## 數值型別自動轉換

三種機制，依序應用。第一個適用的機制生效。

### 機制 1 — 型別級拓寬（let 和 const）

僅作用於型別，不檢視值。無條件安全。

| From | To | 說明 |
|------|-----|---------|
| `i8`/`i16`/`i32` | `i64` | 同符號，無損失 |
| `u8`/`u16`/`u32` | `u64` | 同符號，無損失 |
| `u8` | `i16` | 全部 256 個值都適用 |
| `u16` | `i32` | 全部 65,536 個值都適用 |
| `u32` | `i64` | 全部 4.3G 個值都適用 |
| `i32`、`u32` | `f64` | 無損失（53 位元尾數） |
| `f32` | `f64` | 無損失 |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 始終可放入 i64
```

### 機制 2 — 編譯時值分析（僅限 const）

當兩個運算元均為具有已知字面量值的 `const`，且機制 1 不適用時。逐步演算法 — 參見 [Numeric Types → Autocast](./numbers.md)。

### 機制 3 — 顯式 `as`（用於 let）

若機制 1 不適用於 `let` 變數 — 則需要顯式轉換：

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // error — 無型別級拓寬
let c: f64 = (a + (b as i64)) as f64  // ok
```

每種機制的詳細說明 — 參見 [Numeric Types](./numbers.md) 頁面。

## 子頁面

| 頁面 | 說明 |
|------|-------------|
| [Numeric Types](./numbers.md) | i8..i64、u8..u64、f32、f64、usize、number、autocast、`as` |
| [Strings](./strings.md) | UTF-8 字串、字面量、方法、std/string |
| [Special Types](./special-types.md) | any、never、void、unknown |
| [Null](./null.md) | 可空型別、可選鏈、`??` |
| [Arrays](./arrays.md) | 動態陣列、固定陣列、Slice<T> |
| [Map and Set](./map-set.md) | 雜湊表和集合 |
| [Tuples](./tuples.md) | 元組、標籤、唯讀、可選、rest |
| [Clone](./clone.md) | 顯式複製擁有值 |
| [Type Aliases](./type-aliases.md) | `type`、不透明別名、字串字面量聯合 |
| [Utility Types](./utility-types.md) | Partial、Required、Readonly、Pick、Omit、Record 等 |
| [Date](./date.md) | 相容舊版 JS 的日期/時間型別 |

## 錯誤

| 錯誤 | 原因 |
|-------|-------|
| `expected f64, got i32` | 不相容的數值型別，無自動轉換 |
| `empty object literal is forbidden` | 空 `{}` — 請使用 `Map<K,V>` 或宣告型別 |
| `cannot use "void" as variable type` | `void` 只能用於函數回傳型別 |
| `non-nullable runtime union: string \| i32` | 禁止非可空聯合型別，請使用 interface 或 discriminated union |

## 參見

- [Variables: let / const](../02-syntax/variables/index.md) — `let`/`const` 對型別和自動轉換的影響
- [Memory Model](../05-memory/index.md) — 所有權、`Ref<T>`、`Mut<T>`
- [Classes and Interfaces](../04-classes/index.md) — 名義型別、泛型
- [Error Handling](../06-errors/index.md) — `throws`、`T | null` 與 `T throws E`
