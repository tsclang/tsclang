# Derleyici Mimarisi

[Yukarı](../index.md) | [Sonraki](./phases.md)

---

Katkıda bulunanlar için TSClang derleyici mimarisi. Derleyici, `.tsc` dosyalarını C99'a çevirir ve makine optimizasyonlarını C derleyicisine (gcc/clang/avr-gcc) devreder.

## Pipeline

```
.tsc kaynağı
    ↓
Parse (lexer + parser)      →  AST
    ↓
Decorator pass              →  değiştirilmiş AST
    ↓
Typecheck                   →  tip atanmış AST
    ↓
Lower to IR                 →  SSA-benzeri IR (temel bloklar)
    ↓
Ownership Analysis          →  borrow checker + ARC enjeksiyonu
    ↓
Codegen                     →  C99 + #line + CMakeLists.txt
    ↓
C derleyici                  →  binary / .hex
```

## Kaynak Kodu

| Yol | Amaç |
|-----|------|
| `src/compiler/lexer.js` | Lexer |
| `src/compiler/parser.js` | Parser → AST |
| `src/compiler/types.js` | Yardımcı türler ve mangling |
| `src/compiler/codegen.js` | Codegen giriş noktası, Context sınıfı |
| `src/compiler/codegen/top-level/` | Sınıflar, işlevler, arayüzler, enum, tür takma adları |
| `src/compiler/codegen/stmt/` | Değişken bildirimleri, kontrol akışı, destructuring, match |
| `src/compiler/codegen/expr/` | İfade dağıtıcısı, operatörler, atama, literal'ler |
| `src/compiler/codegen/calls/` | Çağrılar: metotlar, console, stdlib, builtin, dönüşümler, eşzamanlılık |
| `src/compiler/codegen/types/` | Tür çözümleme, çıkarım, yardımcılar |
| `src/compiler/codegen/misc/` | Yardımcılar, new-expr, closures, diziler |
| `src/compiler/codegen/async/` | Async: ifadeler, emit, generator'lar, yardımcılar, tarama |
| `src/compiler/codegen/generics.js` | Generic monomorfozasyon |
| `src/runtime/runtime.h` | C-runtime başlık dosyası |

## Test Metodolojisi

Her bileşen bir döngüde uygulanır:

```
1. Testler     — corpus (input.tsc → expected.c / expected.error)
2. Uygulama — tüm testler geçene kadar
3. Log       — log/<bileşen>.md: kararlar, sorunlar, değişiklikler
```

Test corpus: `test/cases/phase0–phase19`, toplam 1028 test. Biçim `test/CORPUS.md` içinde açıklanmıştır.

## Alt Sayfalar

| Sayfa | Açıklama |
|-------|----------|
| [Derleme Aşamaları](./phases.md) | Parse → AST → Decorator → Typecheck → IR → Ownership → Codegen |
| [İsim mangling](./name-mangling.md) | Biçimsel şema, tür kodlaması, modül slug'ı, çakışmalar |
| [Debug bilgisi](./debug.md) | `#line` yönergeleri, DAP sunucusu, gömülü debugging |
| [Optimizasyon](./optimization.md) | Seviyeler O0–O3/Os, tüketici tarafı monomorfozasyon, artımlı *(yol haritası)* |

## Hatalar

| Hata | Neden |
|------|-------|
| `type name must start with uppercase letter` | Sınıf/arayüz adı PascalCase değil |
| `type name uses reserved mangling prefix` | Tür adında `ref_`, `mut_`, `arc_`, `opt_`, `arr_` kullanımı |
| `error[TSC-EXXX]` | Kararlı hata kodu — dokümantasyonda aranabilir |

## Ayrıca bakınız

- [Dekoratörler](../04-classes/decorators.md) — dekoratör pass: algoritma ve sınırlamalar
- [Bellek Modeli](../05-memory/index.md) — sahiplik, borrow checker, IR komutları
- [Derleme Sistemi](../09-build/index.md) — CMake, profiller, gömülü hedefler
