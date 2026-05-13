# 語法

[← 上一級](../index.md) | [下一頁 →](./formatting.md)

---

TSClang 語法的完整描述。該語言遵循 TypeScript/JavaScript 慣例，並擴充了安全記憶體管理功能。

## 章節

### 基礎
- [Formatting](./formatting.md) — 分號、縮排、引號、linter
- [Truthy / Falsy](./truthy-falsy.md) — 哪些值被視為 true/false

### 變數
- [let / const](./variables/index.md) — 可變性、所有權差異

### 函數
- [Declaration](./functions/declaration.md) — `function`、參數、回傳型別
- [Arrow](./functions/arrow.md) — `=>` 語法
- [Overloading](./functions/overload.md) — 依型別和參數數量多載
- [Default Parameters](./functions/default-params.md) — 預設值

### 運算子
- [Arithmetic](./operators/arithmetic.md) — `+`、`-`、`*`、`/`、`%`、`**`
- [Assignment](./operators/assignment.md) — `=`、`+=`、`-=` 等
- [Comparison](./operators/comparison.md) — `==`、`!=`、`===`、`!==`
- [Logical](./operators/logical.md) — `&&`、`||`、`!`、`??`
- [Bitwise](./operators/bitwise.md) — `&`、`|`、`^`、`~`、`<<`、`>>`
- [Optional](./operators/optional.md) — `?.`、`??`、展開 `...`
- [Operator Precedence](./operators/precedence.md) — 優先順序表

### 迴圈
- [for](./loops/for.md) — 經典迴圈
- [for-of](./loops/for-of.md) — 集合走訪
- [while / do-while](./loops/while.md) — 條件迴圈
- [break / continue](./loops/break-continue.md) — 迭代控制

### 流程控制
- [switch](./match/switch.md) — 值選擇
- [match](./match/index.md) — 模式匹配

### 切片
- [Indexing and Slices](./slices.md) — `[]`、`[a..b]`、負索引

## 參見

- [Types](../03-types/index.md) — 型別系統
- [Memory Model](../05-memory/index.md) — 所有權與借用檢查器
