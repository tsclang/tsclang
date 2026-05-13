# Sınıflar ve Nesne Sistemi

[← Yukarı](../index.md) | [Sonraki →](./classes.md)

---

TSClang nesne sistemi, kalıtım yerine kompozisyona, sınıflar için nominal tiplemeye ve arayüzler için yapısal tiplemeye dayanır. Jenerik'ler monomorfize edilir — her somut tip için ayrı C kodu.

## Temel prensipler

- **Kalıtım yok** — sadece `extends Error` hata hiyerarşileri için. Polimorfizm `arayüz` + `implements` ile sağlanır.
- **Kompozisyon** — `class Dog extends Animal` yerine `class Dog { animal: Animal }` kullanın.
- **Sahiplik entegredir** — `mut`, `move` metod değiştiricileri `this` semantiğini kontrol eder.
- **Jenerik'ler monomorfize edilir** — `Stack<i32>` ve `Stack<User>` ayrı C fonksiyonları üretir.
- **Dekoratörler derleme zamanındadır** — AST'yi tip denetiminden önce dönüştürür, sıfır çalışma zamanı maliyeti.

## Alt sayfalar

| Sayfa | Açıklama |
|------|-------------|
| [Sınıflar](./classes.md) | Tanım, değiştiriciler, `this` semantiği, `readonly`, yapıcılar, değer nesnesi, builder |
| [Arayüzler](./interfaces.md) | Veri arayüzleri vs sözleşme, fat pointer vtable, `instanceof`, yapısal uyumluluk |
| [Numaralandırma](./enum.md) | Sayısal, string, `const enum`, yardımcı fonksiyonlar, `match`'te tükenirlik |
| [Jenerik'ler](./generics.md) | Sözdizimi, sınırlar (`implements`/`extends`), monomorfizasyon, jenerik'lerle sahiplik |
| [Dekoratörler](./decorators.md) | `decorator function`, Descriptor API, `@packed`, `@align`, `@static`, `@embedded.*`, `@signal`, `@platform` |

## Genişletme Metodları

TSClang, tanımı değiştirmeden mevcut tiplere metod eklemeyi destekler — genişletme metodları. Açıkça içe aktarılır, global kapsamı kirletmez.

```typescript
export extension function charCount(this: string): i32 {
    // count codepoints
}

import { charCount } from "std/string"
"привет".charCount()   // tamam
```

C-çıktısı — statik çağrı, sıfır maliyet:

```c
int32_t n = tsc_std_string_charCount(s);
```

Mevcut bir metodla çakışan genişletme — derleyici hatası. Farklı modüllerden aynı isimde iki genişletme — `import { format as fmtA } from "./module-a"}` ile çözülür.

## Hatalar

| Hata | Neden |
|-------|-------|
| `extends is only allowed for Error` | Rastgele bir sınıftan kalıtım alma girişimi |
| `extension 'format' conflicts with existing method` | Mevcut bir metodun adıyla genişletme |
| `ambiguous extension 'format' for type 'string'` | Aynı adla içe aktarılan iki genişletme |

## Ayrıca bakınız

- [Bellek Modeli](../05-memory/index.md) — sahiplik, `Ref<T>`, `Mut<T>`, taşıma semantiği
- [Tip Sistemi](../03-types/index.md) — yapısal vs nominal tipleme
- [Hata İşleme](../06-errors/index.md) — `extends Error`, `throws`, `try/catch`
- [Spesifikasyon: Sınıflar](../../spec/04-classes.md) — nesne sisteminin tam açıklaması
