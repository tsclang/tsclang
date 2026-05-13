# Modül Sistemi

[Yukarı](../index.md) | [Sonraki](./import-export.md)

---

TSClang, sözdiziminde TypeScript ile uyumlu bir **modül sistemi** kullanır: adlandırılmış `export` / `import { } from ""`. Bir dosya = bir modül. Derleyici, C çıktısında `#include`, ileri bildirimler ve başlatma işlevlerini otomatik olarak üretir.

## İlkeler

- **Bir dosya — bir modül** — `namespace`, `module` yok
- **Sadece adlandırılmış export'lar** — `export default` yasaktır (C, her sembol için açık bir isim gerektirir)
- **Dairesel import'lara izin verilir** — derleyici `.h` içinde ileri bildirimler üretir
- **`.d.tsc` dosyaları** — C-interop için bildirimler (TypeScript'teki `.d.ts` benzeri)
- **Yol takma adları** — `../../../` yerine kısa isimler `#/`, `~/`

## Import ve Export

```typescript
// math.tsc — export'larla modül
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — import
import { PI, add } from "./math"
console.log(add(1, 2))
```

## Giriş Noktası

Giriş noktası, `tsc.package.json` içindeki `"main"` alanı ile tanımlanır. Giriş dosyasının üst düzey kodu, C'de `main()` gövdesi olur:

```typescript
const a: i32 = 1
console.log(a)
```

```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

## Modül Başlatma

Derleyici bir bağımlılık grafiği oluşturur ve **topolojik sıralama** yapar. Modül düzeyi değişkenlere sahip her modül bir `_init()` işlevi alır. Sonuç, doğru çağrı sırasına sahip tek bir `tsc_init_all()` olur.

## C Interop

C kütüphaneleriyle etkileşim için TSClang birkaç mekanizma sunar:

| Mekanizma | Amaç |
|-----------|------|
| `.d.tsc` | C türleri, işlevleri, sabitleri için bildirimler |
| `native` | Satır içi C kodu (olduğu gibi) |
| `unsafe {}` | Ödünç/tür denetleyicisini devre dışı bırakma |
| `FnPtr<T>` | C geri çağrıları için işlev işaretçileri |
| `@platform` | Platform başına koşullu derleme |

## Alt Sayfalar

| Sayfa | Açıklama |
|-------|----------|
| [Import / Export](./import-export.md) | Adlandırılmış export/import, namespace import, `import type`, başlatma, dairesel import'lar, yol takma adları |
| [.d.tsc Dosyaları](./d-tsc.md) | C interop için bildirimler: struct, opak tür, işlevler, sabitler, MMIO |
| [native — Satır İçi C](./native.md) | Sözdizimi, interpolasyon, sınırlamalar, assembly eklemeleri |
| [unsafe {} — Denetimleri Devre Dışı Bırakma](./unsafe.md) | Ne zaman kullanılır, neyi devre dışı bırakır, `native`'den farkı |
| [Callbacks ve FnPtr\<T\>](./callbacks.md) | İşlev işaretçileri, TSC_CLOSURE_* makroları, closure köprüleme |
| [@platform — Koşullu Derleme](./platform.md) | Platforma bağımlı uygulamalar, paket yapısı |

## C-output

```c
// birden fazla modülün derlenmesi sonucu
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... main.tsc'den üst düzey kod ...
    return 0;
}
```

## Hatalar

| Hata | Neden |
|------|-------|
| `cannot determine entry point` | `tsc.package.json` içinde `"main"` alanı yok |
| `main file not found: src/main.tsc` | `"main"`'den gelen dosya mevcut değil |
| `circular initialization dependency detected` | Modül düzeyi değişkenler aracılığıyla döngü |
| `export default is not allowed` | Varsayılan export kullanma girişimi |
| `native block — C code inserted verbatim` | Her `native` bloğunda uyarı |

## Ayrıca Bakınız

- [Sözdizimi: Değişkenler](../02-syntax/variables/index.md) — modül düzeyi değişkenler
- [Bellek: Sahiplik](../05-memory/ownership-types.md) — modüller arası geçişte owned/borrow
- [Eşzamanlılık](../07-concurrency/index.md) — modül düzeyi değişkenler için iş parçacığı güvenliği
