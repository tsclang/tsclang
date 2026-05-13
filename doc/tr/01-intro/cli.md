# CLI — Komutlara Genel Bakış

[← Yukarı](./index.md) | [Önceki ←](./quick-start.md)

---

## Komut Listesi

| Komut | Kısayol | Açıklama |
|---------|-------|-------------|
| `tsclang init` | — | Yeni proje oluştur |
| `tsclang build` | `b` | Proje derle |
| `tsclang run` | `r` | Derle ve çalıştır |
| `tsclang lint` | `l` | Biçimlendirme kontrolü |
| `tsclang migrate` | — | TypeScript → TSClang geçişi *(yol haritası)* |
| `tsclang lsp` | — | IDE için Language Server Protocol *(yol haritası)* |

Kısayollar:

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

Şablondan proje oluşturur.

```bash
tsclang init myapp                    # çalıştırılabilir (varsayılan)
tsclang init mylib --library          # TSClang kütüphanesi
tsclang init sqlite3 --declaration    # C-wrapper (C kütüphanesi üzerine sarmalayıcı)
tsclang init                          # mevcut dizinde
```

Kısa bayraklar: `-l` (kütüphane), `-d` (bildirim).

## tsclang build

`.tsc` → `.c` → binary derler (varsayılan olarak).

```bash
tsclang build                  # varsayılan derlemeyi derle
tsclang build <name>           # yapılandırmadan belirli derlemeyi derle
tsclang build hello.tsc        # tek dosya
tsclang build --emit c         # sadece C üretim
tsclang build --emit binary    # C + binary'e derle (varsayılan)
tsclang build --emit hex       # C + avr-gcc → .hex (AVR için)
tsclang build --outDir ./dist  # outDir'i geçersiz kıl
tsclang build --target desktop # hedefi açıkça belirt
tsclang build --clean          # tam yeniden derleme (önbellek yok)
```

## tsclang run

Binary'i derler ve çalıştırır. `tsclang build` + çalıştırmaya eşdeğerdir.

```bash
tsclang run
tsclang run -- args...         # programa argümanlar ilet
```

Sadece `emit: "binary"` için.

## tsclang lint

Kod stilini kontrol eder. CI için — `tsclang lint` ( `-fix` olmadan) ihlallerde çıkış kodu 1 döndürür.

```bash
tsclang lint          # değişiklik olmadan kontrol et
tsclang lint --fix    # kodu yerinde biçimlendir (prettier / gofmt gibi)
```

`tsclang build` farkı:

| Komut | Ne kontrol eder |
|---------|---------------|
| `tsclang build` | Anlamsal hatalar, biçimlendirme görmezden gelinir |
| `tsclang lint` | Anlamsallık + stil uyarıları, ihlallerde çıkış 1 |
| `tsclang lint --fix` | Kodu otomatik olarak biçimlendirir |

## tsclang migrate *(yol haritası)*

TypeScript kodunun TSClang'e geçişi.

```bash
tsclang migrate ./src            # neyin değişeceğini göster (dry-run)
tsclang migrate ./src --fix      # değişiklikleri uygula
tsclang migrate ./src --check    # CI modu: uyumsuzluklar varsa çıkış 1
```

## tsclang lsp *(yol haritası)*

IDE için Language Server Protocol (VS Code, Neovim, vb.).

```bash
tsclang lsp               # stdio iletişimi
tsclang lsp --port 7777   # TCP iletişimi
```

## Ayrıca Bkz

- [Hızlı Başlangıç](./quick-start.md) — kurulum ve ilk proje
- [Derleme Sistemi](../09-build/index.md) — yapılandırma, profiller, platformlar
- [Geçiş Rehberi](../12-migration/index.md) — TS kodunu taşıma
