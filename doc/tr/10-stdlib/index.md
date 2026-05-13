# Standart Kütüphane

[Yukarı](../index.md) | [Sonraki](./globals.md)

---

TSClang standart kütüphanesi, birleşik `std/` ad alanına sahip bir modül kümesidir. Tüm modüller `import { ... } from "std/<modül>"` aracılığıyla kullanılabilir.

## İlkeler

| İlke | Açıklama |
|------|----------|
| **Birleşik API** | Her şey `std/` üzerinden, seviyelere ayrılmış herkese açık ayrım yok |
| **Tembel yükleme** | Derleyici modülleri talep üzerine yükler, başlangıçta tüm `std/` dosyalarını ayrıştırmaz |
| **Tree-shaking** | Sadece kullanılan kod binary'e girer |

```typescript
import { parse } from "std/json"   // tamam
import { serve } from "std/net"    // tamam
import { Regex } from "std/regex"  // tamam
```

`@tsc/*` paketleri — sadece C-wrapper'lar, stdlib modülleri değil:

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // tamam — C-wrapper
import { parse } from "@tsc/json"            // hata — std/json kullan
```

## Kısa import

Tüm `std/` modülleri önek olmadan import edilebilir:

```typescript
import { Thread } from "std/threads"   // açık form (önerilen)
import { Thread } from "threads"       // kısa form
```

Çözüm sırası: `./name.tsc` → `std/name` → hata.

## Platform uyumluluğu

| Modül | Masaüstü | Gömülü (ARM) | Gömülü (AVR) | Not |
|-------|----------|--------------|--------------|-----|
| Global nesneler | ✅ | ✅ | ✅ | `console`, `Math`, timer'lar |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA, ≈5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — sadece RNG'li gömülü |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM: duvar saati olmadan |
| `std/io` | ✅ | ❌ | ❌ | heap ve OS gerektirir |
| `std/fs` | ✅ | ❌ | ❌ | dosya sistemi gerektirir |
| `std/net` | ✅ | ❌ | ❌ | TCP/IP yığını gerektirir |
| `std/ws` | ✅ | ❌ | ❌ | `std/net` üzerinde |
| `std/threads` | ✅ | ❌ | ❌ | OS thread'leri gerektirir |
| `std/reactive` | ✅ | ❌ | ❌ | `std/threads` üzerinde |
| `std/hal` | ✅ | ✅ | ✅ | GPIO, UART, SPI, I2C; masaüstü — mock |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`, `pointer<T>`, `HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | OS olmadan atomikler |
| `std/avr` | ❌ | ✅ | ✅ | AVR-özel |

**Açıklama:** ✅ — tam destek, 🟡 — kısmi, ❌ — kullanılamaz.

Derleyici, import sırasında uyumluluğu kontrol eder:

```typescript
// target: avr
import { readFile } from "std/fs"   // hata: std/fs AVR'de desteklenmez
import { gpio } from "std/embedded"  // tamam
```

## Alt Sayfalar

| Sayfa | Açıklama |
|-------|----------|
| [Global nesneler](./globals.md) | `console`, `Math`, `process`, timer'lar, `performance` |
| [console](./console.md) | Logging: `log`, `error`, `warn`, `time`, `timeEnd`, `assert` |
| [Math](./math.md) | Sabitler ve matematiksel işlevler |
| [std/io](./io.md) | Streams: `Reader`, `Writer`, `Stream` |
| [std/fs](./fs.md) | Dosya sistemi: okuma, yazma, dizinler |
| [std/net](./net.md) | Ağ: `fetch`, HTTP sunucusu, TCP/UDP |
| [std/ws](./ws.md) | WebSocket: istemci ve sunucu |
| [std/string](./string.md) | Unicode, kodlama, biçimlendirme |
| [std/json](./json.md) | JSON: `parse` ve `stringify` |
| [std/regex](./regex.md) | NFA düzenli ifadeler |
| [std/hal ve embedded](./hal.md) | HAL, gömülü modüller, `std/random`, `std/temporal`, `std/reactive` |

## Ayrıca bakınız

- [Bellek modeli](../05-memory/index.md) — sahiplik, `Ref<T>`, `Mut<T>`
- [Hata işleme](../06-errors/index.md) — `throws`, `try`/`catch`
- [Modüller](../08-modules/index.md) — `import`/`export`, `.d.tsc`, native
- [Derleme](../09-build/index.md) — platformlar, `tsc.package.json`
