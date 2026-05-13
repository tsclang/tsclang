# Geçiş: TypeScript → TSClang

[Yukarı](../index.md) | [Sonraki](./automatic.md)

---

TypeScript'ten TSClang'e geçiş yapan geliştiriciler için rehber. Otomatik ve manuel dönüşümleri, uyumsuz kalıpları ve yeni yetenekleri açıklar.

## Süreç Genel Bakışı

TSClang, TypeScript sözdizimiyle mümkün olan en yüksek uyumluluğu hedefler. Çoğu TypeScript kodu, değişiklik yapılmadan veya minimal düzenlemelerle taşınabilir. Geçiş süreci üç aşamaya ayrılmıştır:

1. **Otomatik düzeltmeler** — `tsclang migrate` mekanik dönüşümleri uygular
2. **Manuel düzeltmeler** — güvenle otomatikleştirilemeyen kalıplar
3. **Uyumsuz kalıplar** — doğrudan benzeri olmayan yapılar, yeniden tasarım gerektirir

## Hızlı Kontrol

```bash
tsclang migrate ./src            # dry-run: neyin değişeceğini göster
tsclang migrate ./src --fix      # otomatik düzeltmeleri uygula
tsclang migrate ./src --check    # CI: uyumsuzluklar varsa çıkış kodu 1
```

## Değişmeden Geçenler

Arayüzler, tipli işlevler, ok işlevleri, sınıflar (`extends` olmadan), generic'ler, `try/catch`, şablon dizileri, destructuring — hepsi TypeScript'teki gibi çalışır. Detaylar — [Manuel Geçiş](./manual.md) içinde.

## Alt Sayfalar

| Sayfa | Açıklama |
|-------|----------|
| [Otomatik Geçiş](./automatic.md) | `tsclang migrate`: dry-run, --fix, --check, otomatik dönüşüm listesi |
| [Manuel Geçiş](./manual.md) | Değişmeden çalışanlar ve manuel düzeltme gerektirenler |
| [Uyumsuz Kalıplar](./incompatible.md) | Benzeri olmayan yapılar ve alternatifler |
| [Yeni Özellikler](./new-features.md) | Sahiplik, Ref/Mut/Shared, match, throws ve daha fazlası |

## Hatalar

| Hata | Neden |
|------|-------|
| `undefined is not defined` | `undefined` kullanımı — `null` ile değiştir |
| `throw requires Error instance` | String veya number atma — `new Error()` içine sar |
| `export default is not supported` | Adlandırılmış export ile değiştir |
| `extends is not supported` | Sınıf kalıtımı — kompozisyon ile değiştir |

## Ayrıca bakınız

- [Giriş: TSClang Nedir](../01-intro/what-is-tsclang.md) — dil genel bakışı ve felsefesi
- [Derleme: CLI](../09-build/cli.md) — `tsclang build`, `tsclang migrate` komutları
- [Bellek Modeli](../05-memory/index.md) — sahiplik, borrow checker, Ref/Mut/Shared
