# TSClang Nedir

[← Yukarı](./index.md) | [Sonraki →](./design-philosophy.md)

---

TSClang, TypeScript sözdizimine sahip derlenmiş bir dildir; `.tsc` dosyalarını okunabilir C koduna çevirir ve otomatik olarak `CMakeLists.txt` üretir.

## Neden

Birçok geliştirici TypeScript'ten C'ye geçer — ve bu acı vericidir. C'nin düzgün bir ekosistemi yoktur: paket yöneticisi yok, uygun çapraz derleme yok, yerleşik bellek güvenliği denetimleri yok.

TSClang bunu çözer:

- **Tanıdık sözdizimi** — bir TS geliştiricisi yapıları tanır ve hemen verimli olur
- **Güvenli bellek** — derleme zamanında sahiplik ve ödünç alma denetleyicisi, GC yok
- **Birleşik ekosistem** — bağımlılıklar, çapraz derleme, kutudan çıkar çıkmaz derlemeler
- **Okunabilir C çıktısı** — incelenebilir, hata ayıklanabilir ve el yazısı C ile birleştirilebilir

## Ne İçin

**Şimdi:**

- Sunucu kodu — HTTP, soketler, arka uçlar
- Masaüstü — CLI/TUI, dosya yöneticileri, ofis uygulamaları

**Önemli:**

- Sistem düzeyi — sürücüler, işletim sistemi
- Gömülü — Arduino, ESP, Raspberry Pi
- Oyunlar — OpenGL, DirectX üzerinden

**Hayal:**

- Çapraz platform — Windows, Linux, Mac, Android, iOS
- Retro platformlar — ZX Spectrum, NES, Sega, MS-DOS

## Dosya Uzantısı

`.tsc` — TSClang kaynak dosyası.

```typescript
// hello.tsc
console.log("Hello world")
```

Şuna derlenir:

```c
// hello.c
#include "runtime.h"
int main(void) {
    tsc_console_log(tsc_string_from_cstr("Hello world"));
    return 0;
}
```

## Ayrıca Bkz

- [Tasarım Felsefesi](./design-philosophy.md) — dilin üç önceliği
- [Hızlı Başlangıç](./quick-start.md) — kurulum ve ilk proje
- [Bellek Modeli](../05-memory/index.md) — sahiplik ve ödünç alma denetleyicisi
