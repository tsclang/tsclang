# Tasarım Felsefesi

[← Yukarı](./index.md) | [Sonraki →](./quick-start.md) | [Önceki ←](./what-is-tsclang.md)

---

Her tasarım kararında TSClang, sıkı bir öncelik hiyerarşisini takip eder:

## Üç Öncelik

1. **Bellek güvenliği** — sahiplik, ödünç alma denetleyicisi, GC yok
2. **Performans ve tip tanımlama** — sıfır maliyetli soyutlamalar, sıkı tipler
3. **TS sözdizimi** — mümkün olduğunca korunur, ancak #1 ve #2'nin bedeli olmaz

Amaç, "mevcut TS kodu değişiklik olmadan derlenir" değil, "TS geliştiricisi sözdizimini tanır ve kendini evinde hisseder"dir.

## TS Sözdizimi Önceliklidir

Rust, C, Go'dan sözdizimi ödünç alınır — ancak TS'nin uygun bir yapısı yoksa.

Yeni kavramlar TS uyumlu sözdizimiyle gömülür:

| Kavram | Rust | TSClang |
|---------|------|---------|
| Değiştirilemez ödünç alma | `&T` | `Ref<T>` |
| Değiştirilebilir ödünç alma | `&mut T` | `Mut<T>` |
| Değiştirilebilir değişken | `let mut` | `let mut` |
| Değiştirilemez | `let` (varsayılan) | `const` / `readonly` |

Sınıflar korunur, Rust'ta olmamalarına rağmen — TS'de vardır ve geliştiricilere tanıdıktır.

## Her Karar için Soru

> *Bu, mevcut TS sözdizimiyle veya onun doğal uzantısıyla ifade edilebilir mi?*

Evetse — TS sözdizimini kullan. Hayırsa — TS ile çakışmayan minimal uzantıyı bul.

## Geriye Uyumluluk

Harici kütüphaneler olmadan basit yerel TS kodu, derlenmeli veya geçerli TS olarak kalan önemsiz düzeltmeler gerektirmelidir:

```typescript
let a = 10          // açık ek açıklama gerektirebilir
let a: number = 10  // hem TS hem de TSClang'de geçerli
```

Sınıflar, nesneler, diziler, döngüler, şablon değişmezleri içeren kod — olduğu gibi veya minimal değişikliklerle çalışır.

## Ayrıca Bkz

- [TSClang Nedir](./what-is-tsclang.md) — dile genel bakış
- [Bellek Modeli](../05-memory/index.md) — sahiplik ve ödünç alma denetleyicisi nasıl çalışır
- [Geçiş Rehberi](../12-migration/index.md) — TS kodunu TSClang'e taşıma
