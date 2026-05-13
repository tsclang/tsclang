# Sözdizimi

[← Yukarı](../index.md) | [Sonraki →](./formatting.md)

---

TSClang sözdiziminin tam açıklaması. Dil, güvenli bellek yönetimi için uzantılarla birlikte TypeScript/JavaScript kurallarını takip eder.

## Bölümler

### Temeller
- [Biçimlendirme](./formatting.md) — noktalı virgüller, girintileme, tırnak işaretleri, linter
- [Doğru / Yanlış](./truthy-falsy.md) — hangi değerler doğru/yanlış olarak kabul edilir

### Değişkenler
- [let / const](./variables/index.md) — değişebilirlik, sahiplik farkları

### Fonksiyonlar
- [Bildirim](./functions/declaration.md) — `function`, parametreler, dönüş tipi
- [Ok](./functions/arrow.md) — `=>` sözdizimi
- [Aşırı Yükleme](./functions/overload.md) — tip ve parametre sayısına göre
- [Varsayılan Parametreler](./functions/default-params.md) — varsayılan değerler

### Operatörler
- [Aritmetik](./operators/arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Atama](./operators/assignment.md) — `=`, `+=`, `-=`, vb.
- [Karşılaştırma](./operators/comparison.md) — `==`, `!=`, `===`, `!==`
- [Mantıksal](./operators/logical.md) — `&&`, `||`, `!`, `??`
- [Bit Düzeyinde](./operators/bitwise.md) — `&`, `|`, `^`, `~`, `<<`, `>>`
- [İsteğe Bağlı](./operators/optional.md) — `?.`, `??`, yayılma `...`
- [Operatör Önceliği](./operators/precedence.md) — öncelik tablosu

### Döngüler
- [for](./loops/for.md) — klasik döngü
- [for-of](./loops/for-of.md) — koleksiyon üzerinde iterasyon
- [while / do-while](./loops/while.md) — koşul döngüleri
- [break / continue](./loops/break-continue.md) — iterasyon kontrolü

### Akış Kontrolü
- [switch](./match/switch.md) — değer seçimi
- [match](./match/index.md) — desen eşleme

### Dilimler
- [İndeksleme ve Dilimler](./slices.md) — `[]`, `[a..b]`, negatif indeksler

## Ayrıca bakınız

- [Tipler](../03-types/index.md) — tip sistemi
- [Bellek Modeli](../05-memory/index.md) — sahiplik ve ödünç alma denetleyicisi
