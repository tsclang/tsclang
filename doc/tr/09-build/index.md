# Derleme Sistemi

[Yukarı](../index.md) | [Sonraki](./projects.md)

---

TSClang'ın derleme sistemi, `.tsc` dosyalarını C99'a derler ve CMake aracılığıyla bir binary oluşturur. Masaüstü uygulamaları, kütüphaneler, yerel C kütüphaneleri için C-wrapper'lar ve gömülü hedefleri (AVR, ARM, retro platformlar) destekler.

## Pipeline

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (veya .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

`outDir` yapısı:

```
build/desktop/
  c/              ← üretilen .c ve .h
  CMakeLists.txt
  myapp           ← binary (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## Hızlı Başlangıç

```bash
npm install -g tsclang   # derleyiciyi kur
tsclang init myapp       # proje oluştur
cd myapp
tsclang install          # bağımlılıkları kur
tsclang run              # derle ve çalıştır
```

## Proje Türleri

| Tür | Açıklama | `"type"` | Giriş noktası |
|-----|----------|----------|---------------|
| **Executable** | Uygulama | belirtilmemiş (varsayılan) | `"main"` (gerekli) |
| **TSClang library** | TSClang kütüphanesi | `"library"` | `index.tsc` (gelenek) |
| **C-wrapper** | C kütüphanesi üzerine wrapper | `"library"` | `index.d.tsc` |
| **Platform profile** | Platform profili | `"platform"` | `index.d.tsc` |

## CLI Komutları

| Komut | Kısa Ad | Açıklama |
|-------|---------|----------|
| `tsclang init` | — | Yeni proje oluştur |
| `tsclang build` | `b` | Projeyi derle |
| `tsclang run` | — | Derle ve çalıştır |
| `tsclang dev` | — | İzleme modu |
| `tsclang install` | `i` | Bağımlılıkları kur |
| `tsclang update` | `u` | Bağımlılıkları güncelle |
| `tsclang remove` | `r` | Bağımlılığı kaldır |
| `tsclang clean` | `c` | Derleme çıktılarını sil |
| `tsclang lint` | `l` | Biçimlendirmeyi kontrol et |
| `tsclang migrate` | — | TypeScript → TSClang geçişi *(yol haritası)* |
| `tsclang lsp` | — | Language Server Protocol *(yol haritası)* |

## Alt Sayfalar

| Sayfa | Açıklama |
|-------|----------|
| [Proje Türleri](./projects.md) | Executable, library, C-wrapper, platform profile |
| [Konfigürasyon](./config.md) | `tsc.package.json` alanları, derlemeler, platformSettings |
| [CLI](./cli.md) | build, run, init, lint, migrate, lsp komutları |
| [Paket Yöneticisi](./packages.md) | install, publish, search, workspaces, lock dosyası |
| [Gömülü Derleme](./embedded.md) | AVR, ARM, retro platformlar, binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt, debug/release profilleri, optimizasyon |

## C-output

```c
// build/desktop/c/main.c — src/main.tsc'den üretildi
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## Hatalar

| Hata | Neden |
|------|-------|
| `cannot determine entry point` | Executable için `"main"` alanı belirtilmemiş |
| `unknown target arch '6502'` | Platform profili olmayan bilinmeyen mimari |
| `toolchain 'avr-gcc' not found in PATH` | Derleyici kurulu değil |
| `dependency conflict` | Uyumsuz semver kısıtlamaları |

## Ayrıca bakınız

- [Modüller: Import/Export](../08-modules/import-export.md) — giriş noktası ve başlatma
- [Bellek: Sahiplik](../05-memory/ownership-types.md) — FFI sırasında owned/borrow
- [Eşzamanlılık](../07-concurrency/index.md) — async runtime: libuv, cooperative, none
