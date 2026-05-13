# 建置系統

[← 上一級](../index.md) | [下一頁 →](./projects.md)

---

TSClang 的建置系統將 `.tsc` 檔案編譯為 C99，並透過 CMake 建置二進位檔案。支援桌面應用程式、函式庫、原生 C 函式庫的 C 包裝器，以及嵌入式目標（AVR、ARM、復古平台）。

## 建置流程

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (或 .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

`outDir` 結構：

```
build/desktop/
  c/              ← 生成的 .c 和 .h
  CMakeLists.txt
  myapp           ← 二進位檔案 (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## 快速開始

```bash
npm install -g tsclang   # 安裝編譯器
tsclang init myapp       # 建立專案
cd myapp
tsclang install          # 安裝相依套件
tsclang run              # 建置並執行
```

## 專案類型

| 類型 | 說明 | `"type"` | 入口點 |
|------|-------------|----------|-------------|
| **可執行檔** | 應用程式 | 未指定（預設） | `"main"`（必需） |
| **TSClang 函式庫** | TSClang 函式庫 | `"library"` | `index.tsc`（慣例） |
| **C 包裝器** | C 函式庫的包裝器 | `"library"` | `index.d.tsc` |
| **平台設定檔** | 平台設定檔 | `"platform"` | `index.d.tsc` |

## CLI 命令

| 命令 | 別名 | 說明 |
|---------|-------|-------------|
| `tsclang init` | — | 建立新專案 |
| `tsclang build` | `b` | 建置專案 |
| `tsclang run` | — | 建置並執行 |
| `tsclang dev` | — | 監視模式 |
| `tsclang install` | `i` | 安裝相依套件 |
| `tsclang update` | `u` | 更新相依套件 |
| `tsclang remove` | `r` | 移除相依套件 |
| `tsclang clean` | `c` | 移除建置產物 |
| `tsclang lint` | `l` | 檢查格式 |
| `tsclang migrate` | — | TypeScript → TSClang 遷移 *(路線圖中)* |
| `tsclang lsp` | — | 語言伺服器協定 *(路線圖中)* |

## 子頁面

| 頁面 | 說明 |
|------|-------------|
| [專案類型](./projects.md) | 可執行檔、函式庫、C 包裝器、平台設定檔 |
| [設定](./config.md) | `tsc.package.json` 的欄位、建置、platformSettings |
| [CLI](./cli.md) | build、run、init、lint、migrate、lsp 命令 |
| [套件管理員](./packages.md) | install、publish、search、workspaces、lock 檔案 |
| [嵌入式建置](./embedded.md) | AVR、ARM、復古平台、binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt、debug/release 設定檔、最佳化 |

## C 輸出

```c
// build/desktop/c/main.c — 從 src/main.tsc 生成
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## 錯誤

| 錯誤 | 原因 |
|-------|-------|
| `cannot determine entry point` | 可執行檔未指定 `"main"` 欄位 |
| `unknown target arch '6502'` | 沒有平台設定檔時使用了未知架構 |
| `toolchain 'avr-gcc' not found in PATH` | 編譯器未安裝 |
| `dependency conflict` | 不相容的 semver 約束 |

## 參見

- [模組：匯入/匯出](../08-modules/import-export.md) — 入口點和初始化
- [記憶體：所有權](../05-memory/ownership-types.md) — FFI 期間的 owned/borrow
- [並發](../07-concurrency/index.md) — 非同步執行時期：libuv、協同式、無
