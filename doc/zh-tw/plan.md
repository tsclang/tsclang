# TSClang 文件計畫

## 目標

根據規格書建立完整的英文開發者文件。
文件應具實用性、以使用者為導向（聚焦開發者），而非編譯器作者導向。

## 目標讀者

1. 想開始使用 TSClang 的 TypeScript 開發者
2. 評估此語言用於嵌入式開發的開發者
3. 尋找特定 API（字串方法、所有權型別、HTTP 伺服器）的開發者

## 撰寫原則

- 語言：英文
- 程式碼範例：可執行、精簡，附英文註解
- 結構：由簡入繁
- 每個章節皆自成一格——可獨立閱讀
- 章節間互相參照，供深入研讀

## 檔案結構

**巢狀結構：** 每個方法、函式、型別和結構都有專屬檔案。
不要出現 50 KB 的龐大頁面。若某個方法有 3 種呼叫變體——就在該方法目錄下建立 3 個檔案。

結構範例：

```
doc/
  02-syntax/
    index.md                        # 章節概覽 + 連結
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

## 檔案內容規則

每個檔案描述**一個**方法 / 函式 / 結構 / 型別，必須包含：

### 1. 完整說明

它是什麼、為何需要、如何運作。不廢話——具體且切中要害。
提及邊界狀況與非顯而易見的行為。

### 2. 簽章 / 語法

含參數型別與回傳型別的確切簽章。
若某個方法有多種變體（多載）——分別描述每種。

### 3. 用法或實作範例

每個變體至少一個可運作的範例。
範例應精簡——沒有不必要的脈絡。
每個範例標示結果（註解 `// →`）。

### 4. C 輸出

每個範例——編譯成 C 的樣子。
展示產生的 C 程式碼，讓開發者理解底層發生了什麼。
對所有權結構（move、borrow、drop、cleanup）特別重要。

### 5. 錯誤與修正

使用錯誤時的典型編譯器錯誤。
格式：`錯誤程式碼 → 錯誤文字 → 修正後的程式碼`。
必須包含編譯器提示。

### 6. 導覽與連結

每個檔案必須包含導覽連結：

**導覽列**——位於檔案頂端，標題之後：

```markdown
[上一級](./index.md) | [下一頁](./filter.md) | [上一頁](./sort.md)
```

三個連結：
- **上一級** (`←`) — 跳至上層目錄的 `index.md`（章節概覽）
- **下一頁** (`→`) — 跳至同層的下一個檔案（依邏輯順序，非字母順序）
- **上一頁** (`←`) — 跳至同層的上一個檔案

章節的第一個檔案沒有「上一頁」，最後一個沒有「下一頁」。

**交叉引用**——位於檔案結尾，「另見」區段：

```markdown
## 另見

- [filter](./filter.md) — 篩選元素
- [reduce](./reduce.md) — 累積
- [forEach](./for-each.md) — 無結果的迭代
```

連至其他章節的相關結構——使用完整路徑：

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) — 元素的借用
```

**每個目錄中的 index.md** — 包含所有子檔案連結的章節概覽。
作為由上而下的導覽入口點。

檔案範本範例：

```markdown
# map

對來源陣列的每個元素套用函式，建立新陣列。

## 簽章

\`\`\`typescript
arr.map<U>(f: (Ref<T>) => U): U[]
\`\`\`

回呼接收 `Ref<T>` — 元素的借用，而非所有權。

## 範例

### 基本用法

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
const doubled = nums.map(x => x * 2)
// → [2, 4, 6]
\`\`\`

### C 輸出

\`\`\`c
int32_t* doubled = malloc(3 * sizeof(int32_t));
for (size_t i = 0; i < 3; i++) {
    doubled[i] = nums[i] * 2;
}
\`\`\`

### 型別轉換

\`\`\`typescript
const names: string[] = users.map(u => u.name)
// → ["Alice", "Bob"]
\`\`\`

## 錯誤

### 回呼修改元素

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => { x++ })  // error: cannot assign to Ref<i32>
\`\`\`

修正：

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => x * 2)  // return a new value
\`\`\`

## 另見

- [filter](./filter.md)
- [reduce](./reduce.md)
- [flatMap](./flat-map.md)
```

---

## 文件結構

### 01-intro.md — TSClang 簡介

**目標：** 解釋它是什麼、為何存在，並提供第一個可運作的範例。

- 什麼是 TSClang（TS 語法 → C、Rust 安全性、npm 生態系）
- 設計哲學（3 個優先順序：安全性、效能、TS 語法）
- 使用案例（桌面、嵌入式、伺服器、復古平台）
- 快速開始：安裝、`hello world`、建置與執行
- 需求（Node.js、CMake、gcc/clang）
- CLI 概覽：`tsclang build`、`tsclang lint`、`tsclang lsp`

**來源：** `spec/01-intro.md`

---

### 02-syntax.md — 語法

**目標：** 完整描述語言語法。

- 格式（ASI、K&R、縮排、引號、尾隨逗號）
- 變數：`let` / `const` — 在所有權脈絡中的差異
- 函式：`function`、箭頭函式、匿名函式、IIFE
- 參數：預設值、其餘參數
- 函式多載（依型別與數量、解析優先順序）
- 運算子：算術、賦值、比較、邏輯、位元
- 真值 / 假值（依型別的表格）
- 迴圈：`for`、`for-of`、`while`、`do-while`、`break`/`continue`、標籤
- `switch` / `match` — 比較、窮舉性
- 展開運算子（陣列、物件、所有權規則）
- 索引與切片（陣列與字串、負索引）

**來源：** `spec/02-syntax.md`

---

### 03-types.md — 型別系統

**目標：** 描述型別、所有型別與轉換。

- 結構化與標稱型別（`type`、`interface`、`class`）
- 型別推斷
- 數值型別（`i8`..`i64`、`u8`..`u64`、`f32`、`f64`）
  - 字面值（十六進位、二進位、八進位、`_` 分隔符）
  - 自動轉型（3 種機制：擴展、編譯期、`as`）
  - `usize` — 平台型別
  - `number` = `f64`（可覆寫）
  - AVR 上的效能警告
- `string` — UTF-8 位元組、C 佈局、索引、迭代、內建方法
- 特殊型別：`void`、`never`、`any`
- Null：`T | null`、可選 `?`、可選鏈 `?.`、空值合併 `??`
  - `T | null` 的 C 表示（帶旗標的結構體）
  - 嵌入式模式：哨兵值、獨立旗標
- 型別轉換：數字 ↔ 字串、JS 相容函式（`parseInt`、`parseFloat`）
- `Date` — 建立、方法、格式化
- 陣列：`T[]`（動態）、`T[N]`（固定）、方法、函式式方法
- `Slice<T>` / `MutSlice<T>` — 零複製視圖
- `Map<K,V>`、`Set<T>` — API、所有權、嵌入式模式
- `Object` — 靜態方法
- 元組：固定、標籤、唯讀、可選、其餘、展開
- `Clone` — 介面、`clone()`、`structuredClone()`
- 型別別名（`type`）
- 字串字面聯合
- 工具型別：`Partial`、`Required`、`Readonly`、`NonNullable`、`Pick`、`Omit`、`Record`、`ReturnType`、`Parameters`、`Awaited`
- `Buffer`、`DataView`

**來源：** `spec/03-types.md`

---

### 04-classes.md — 類別、介面、列舉、泛型

**目標：** 語言的物件系統。

- 泛型：語法、界限（`implements`/`extends`）、單態化、泛型的所有權
- 擴充方法：宣告、匯入、衝突
- 列舉：數值、字串、`const enum`、工具、在 switch/match 中
- 介面：資料 vs 帶方法的契約、胖指標、虛擬函式表
- `instanceof` — 透過虛擬函式表縮小型別
- 類別：
  - 無繼承（`extends Error` 除外）、組合
  - 修飾詞：`public`、`private`、`static`、`mut`、`move`
  - `this` 與欄位存取的語意
  - `readonly` 欄位
  - 建構函式：自動產生、顯式、`private`
  - 值物件模式
  - 使用 `move` 的建造者模式
- 對齊：`@packed`、`@align(N)`、填補診斷
- 裝飾器：概覽，參考完整章節

**來源：** `spec/04-classes.md`、`spec/13-decorators.md`

---

### 05-memory.md — 記憶體模型與所有權

**目標：** 語言的核心特性——安全的記憶體管理。

- 所有權型別：`T`（擁有者）、`Ref<T>`、`Mut<T>`、`Shared<T>`、`Weak<T>`、`Slice<T>`
- 基本規則：基本型別複製，複雜型別——所有權
- 擁有者（T）：賦值與傳遞時移動
- `Ref<T>`：不可變借用、規則、禁止用於欄位、因應模式
- `Mut<T>`：可變借用、同一時間僅一個
- `Shared<T>`：ARC、`Weak<T>` 用於打破循環
- 借用檢查規則（4 條規則）
- 引數傳遞矩陣（let/const/Ref/Mut/Shared → Ref/Mut/T/Shared）
- 內部可變性——為何不存在
- `@static let` — 全域可變狀態
- 作用域約束（無生命週期標註）：4 條規則
- 自動 Drop 與 `goto cleanup`
- `Iterable<T>` — 使用者定義的可迭代型別
- 欄位存取與解構（借用 vs 移動）
- 切片（借用 vs 擁有）
- 從陣列移動、借用期間修改
- 從方法回傳借用
- 閉包：捕捉規則、顯式捕捉列表、透過 await 實現 Mut-閉包

**來源：** `spec/05-memory.md`

---

### 06-errors.md — 錯誤處理

**目標：** 錯誤系統——基於 Result，不使用 setjmp/longjmp。

- 原則：TS 的 `throw`/`try`/`catch` → C 的 Result 結構
- 在簽章中宣告 `throws`
- `Error` — 基底類別、`error.stack`
- `throw`、`try`/`catch`/`finally`
- 聯合 catch、窮舉處理
- `?` 運算子（傳播）
- `!` 運算子（解包/恐慌）
- C 輸出：Result 結構、`if/else` 判斷 `ok` 與 `_kind`
- 錯誤期間的所有權（透過 `goto` 清理）
- 限制

**來源：** `spec/06-errors.md`

---

### 07-concurrency.md — 並行

**目標：** 三個層級的並行及其使用方法。

- 三種機制概覽（非同步/等待、執行緒、ISR）
- **非同步/等待：**
  - 非同步執行階段架構（狀態機）
  - 狀態機大小、嵌入式上的堆疊安全性
  - `Promise<T>`：建立、`.then`/`.catch`/`.finally`
  - `Promise.all`、`Promise.any`、`Promise.race`、`Promise.allSettled`
  - `await` 規則、`async main`
  - 遞迴非同步函式
  - `@embedded.stack` — 顯式堆疊
  - 任務取消：`AbortController`、`AbortSignal`
  - `AsyncMutex`
- **執行緒（std/threads）：**
  - 無共享記憶體的隔離區
  - `Atomic<T>`、`AtomicArray<T>`
  - `channel<T>`：有界 MPMC、ISR 安全操作
  - `select`：等待多個通道
  - `Readonly<T>`：零複製共享
  - `Thread<T>`：有型別的結果
  - Thread.spawn 規則、Send 檢查
- **@embedded.isr：**
  - `Volatile<T>` — MMIO 暫存器
  - ISR：簽章、規則、模式
  - `std/sync` — 關鍵區段
  - `EmbeddedSignal` — ISR → 非同步橋接
- 嵌入式註解：`@embedded.inline`、`@embedded.noHeap`
- `@signal` — POSIX 訊號（桌面）
- 非同步產生器：`async function*`、`for await`、`close()`
- 透過產生器的協作式多工

**來源：** `spec/07-concurrency.md`

---

### 08-modules.md — 模組與 C 互操作

**目標：** 模組系統的運作方式與 C 互操作。

- 匯出：具名、`export default` 禁止
- 匯入：具名、命名空間、`import type`
- 模組初始化順序、循環匯入
- 模組層級變數
- 路徑別名（`#`、`~`）
- 進入點：`"main"`、`"builds"`、C main 產生
- 函式庫：`"type": "library"`
- `.d.tsc` 檔案：5 種宣告
  - C 結構體、不透明型別、C 函式、常數、MMIO 暫存器
  - 連結設定（system、bundled、fetch）
- `native` — 內嵌 C（語法、插值、限制）
- 回呼：`FnPtr<T>`、`TSC_CLOSURE_*` 巨集
- `unsafe {}` — 停用檢查
- `@platform` — 條件編譯
- 宣告合併
- 變長引數 C 函式：`Scalar` 型別

**來源：** `spec/08-modules.md`

---

### 09-build.md — 建置系統

**目標：** 專案、建置與套件的結構方式。

- 專案型別：可執行檔、函式庫、C 包裝器、平台套件
- `tsc.package.json`：所有欄位
- C 包裝器：結構、發布、連結設定（system/bundled/fetch）
- 平台套件：`declare platform {}`、平台欄位
- CLI：`tsclang build`、旗標（`--outDir`、`--target`、`--profile`、`--optimize`）
- 套件管理員：`tsclang install`、`tsclang publish`、`tsclang search`
- Monorepo：`"workspaces"`
- 嵌入式建置：AVR、ARM、復古平台
- CMakeLists.txt：產生、自訂
- 設定檔：debug/release、最佳化

**來源：** `spec/09-build.md`

---

### 10-stdlib.md — 標準函式庫

**目標：** 所有 stdlib 模組的參考文件。

- 原則：透過 `std/` 的統一 API、懶載入、樹搖
- 全域物件：`console`、`Math`、process、計時器、`performance`
- `Error` — 基底類別
- `Map<K,V>`、`Set<T>` — API、所有權
- `Buffer`、`DataView`
- `std/io` — Reader/Writer
- `std/fs` — 檔案操作
- `std/net` — fetch、HTTP 伺服器、TCP/UDP
- `std/ws` — WebSocket
- `std/math` — 常數與方法（完整表格）
- `std/string` — Unicode、編碼、格式化
- `std/json` — 解析與序列化
- `std/url` — URL 與 URLSearchParams
- `std/blob` — Blob 與 File
- `std/formdata` — multipart/form-data
- `std/regex` — NFA 正規表示式、語法、API
- `std/random` — Random、HardwareRandom
- `std/temporal` — PlainDateTime、Instant、Duration
- `std/reactive` — ReactiveVar、computed、effect
- `std/hal` — GPIO、UART、SPI、I2C
- `std/embedded` — Volatile、指標、HashMap、StaticMap
- 平台相容性（表格）

**來源：** `spec/10-stdlib.md`、`spec/19-stdlib-*.md`

---

### 11-compiler.md — 編譯器架構

**目標：** 供貢獻者與想理解內部運作的人參考。

- 編譯階段（Parse → AST → Decorator → Typecheck → IR → Codegen）
- IR：基本區塊、指令、phi 節點
- 名稱改寫（正式方案）
- 除錯資訊：`#line` 指示詞、DAP 伺服器
- 消費端單態化
- 增量編譯（路線圖）
- 最佳化層級（O0–O3、Os）
- 錯誤訊息：格式、分類、錯誤代碼

**來源：** `spec/11-compiler.md`

---

### 12-migration.md — 遷移指南：TypeScript → TSClang

**目標：** 協助 TS 開發者遷移程式碼。

- 自動修正（`tsclang migrate`）
- 可直接運作的部分（範例）
- 需要手動修正的部分（特定模式）
- 不相容的模式（替代方案表格）
- TSClang 新增的內容（TS 沒有的部分）

**來源：** `spec/12-migration.md`

---

## 章節摘要表

| # | 檔案 | 內容 | 來源 | 大小 |
|---|------|---------|--------|------|
| 01 | intro | 什麼是 TSClang、快速開始、CLI | `spec/01-intro.md` | ~30 KB |
| 02 | syntax | 語法、運算子、迴圈、match/switch | `spec/02-syntax.md` | ~50 KB |
| 03 | types | 型別、數字、字串、陣列、Map/Set、元組、工具型別 | `spec/03-types.md` | ~80 KB |
| 04 | classes | 類別、介面、列舉、泛型、擴充方法 | `spec/04-classes.md`、`spec/13-decorators.md` | ~40 KB |
| 05 | memory | 所有權、借用檢查、Ref/Mut/Shared、閉包 | `spec/05-memory.md` | ~50 KB |
| 06 | errors | throw/try/catch、Result、`?`/`!` 運算子 | `spec/06-errors.md` | ~15 KB |
| 07 | concurrency | 非同步/等待、執行緒、ISR、原子、通道、產生器 | `spec/07-concurrency.md` | ~70 KB |
| 08 | modules | 匯入/匯出、.d.tsc、native、unsafe、@platform | `spec/08-modules.md` | ~50 KB |
| 09 | build | 建置、套件、C 包裝器、平台 | `spec/09-build.md` | ~50 KB |
| 10 | stdlib | 所有 std 模組的參考 | `spec/10-stdlib.md`、`spec/19-stdlib-*.md` | ~60 KB |
| 11 | compiler | 編譯器架構（供貢獻者） | `spec/11-compiler.md` | ~30 KB |
| 12 | migration | TypeScript → TSClang 遷移指南 | `spec/12-migration.md` | ~15 KB |
| | | | **總計** | **~540 KB** |

## 建議撰寫順序

建議順序（從最重要且常見到進階）：

1. `01-intro.md` — 所有人的入口點
2. `02-syntax.md` — 基本結構
3. `05-memory.md` — 核心特性，每個人都需要
4. `03-types.md` — 型別系統
5. `04-classes.md` — 物件系統
6. `06-errors.md` — 錯誤處理
7. `08-modules.md` — 模組與 C 互操作
8. `07-concurrency.md` — 並行
9. `10-stdlib.md` — API 參考
10. `09-build.md` — 建置系統
11. `12-migration.md` — 從 TS 遷移
12. `11-compiler.md` — 內部運作（供貢獻者）

## 大小預估

| 文件 | 預估大小 |
|----------|----------------|
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
| **總計** | **~540 KB** |

## 格式

- Markdown（.md）
- 每個檔案是自成一格的章節
- H1 標題用於章節標題，H2/H3 用於小節
- 表格用於參考資訊
- 程式碼區塊附語言標示（```typescript、```c、```bash）
- `> **Note:**` 用於重要備註
- `> **Warning:**` 用於重大限制
