# TSClang Dokümantasyon Planı

## Hedef

Spesifikasyona dayalı olarak kapsamlı geliştirici dokümantasyonunu İngilizce olarak oluşturmak.
Dokümantasyon pratik, kullanıcı odaklı (geliştirici merkezli) olmalı, derleyici yazarı odaklı değil.

## Hedef Kitle

1. TypeScript'ten gelip TSClang'de yazmaya başlamak isteyen bir geliştirici
2. Dili gömülü geliştirme için değerlendiren bir geliştirici
3. Belirli bir API arayan bir geliştirici (dizi metodu, sahiplik tipi, HTTP sunucusu)

## Yazım İlkeleri

- Dil: İngilizce
- Kod örnekleri: çalışan, minimal, yorumlar İngilizce
- Yapı: basitten karmaşığa
- Her bölüm kendi başına tamamlanmıştır — bağımsız olarak okunabilir
- Daha derin çalışma için bölümler arası çapraz referanslar

## Dosya Yapısı

**İç içe yapı:** her metot, fonksiyon, tip ve yapı kendi dosyasını alır.
50 KB'lık tek sayfalar yok. Bir metodun 3 çağrı varyantı varsa — bu, metodun
 dizini içinde 3 dosya demektir.

Örnek yapı:

```
doc/
  02-syntax/
    index.md                        # bölüm genel bakış + bağlantılar
    variables/
      let.md
      const.md
    functions/
      declaration.md
      arrow.md
      anonymous.md
      iife.md
      default-params.md
      overload.md
        by-type.md
        by-count.md
        priority.md
    loops/
      for.md
      for-of.md
      while.md
      do-while.md
      break-continue.md
    match/
      syntax.md
      patterns/
        literal.md
        range.md
        destructuring.md
        wildcard.md
        union.md
      exhaustiveness.md
      vs-switch.md
    operators/
      arithmetic.md
      assignment.md
      comparison.md
      logical.md
      bitwise.md
      ternary.md
      optional-chaining.md
      nullish-coalescing.md
      spread.md
    truthy-falsy.md
    slices.md
```

## Dosya İçerik Kuralları

Her dosya **bir** metodu / fonksiyonu / yapıyı / tipi açıklar ve şunları içermelidir:

### 1. Tam Açıklama

Nedir, neden gerekli, nasıl çalışır. Boş laf yok — somut ve konuya odaklı.
Kenar durumları ve bariz olmayan davranışlardan bahsedin.

### 2. İmza / Sözdizimi

Parametre tipleri ve dönüş tipi ile tam imza.
Bir metodun birkaç varyantı varsa (aşırı yüklemeler) — her birini ayrı ayrı açıklayın.

### 3. Kullanım veya Uygulama Örnekleri

Varyant başına en az bir çalışan örnek.
Örnekler gereksiz bağlam olmadan minimal olmalıdır.
Her örnek sonucu belirtilmiş olarak (yorum `// →`).

### 4. C Çıktısı

Her örnek için — C'ye nasıl derlendiği.
Geliştiricinin kaputun altında ne olduğunu anlaması için üretilen C kodunu gösterin.
Sahiplik yapıları için (move, borrow, drop, cleanup) özellikle önemlidir.

### 5. Hatalar ve Düzeltmeler

Yanlış kullanıldığında tipik derleyici hataları.
Format: `hatalı kod → hata metni → düzeltilmiş kod`.
Derleyici ipucunu içermelidir.

### 6. Navigasyon ve Bağlantılar

Her dosya navigasyon bağlantıları içermelidir:

**Navigasyon çubuğu** — dosyanın en üstünde, başlıktan sonra:

```markdown
[← Yukarı](./index.md) | [Sonraki →](./filter.md) | [Önceki ←](./sort.md)
```

Üç bağlantı:
- **Yukarı** (`←`) — üst dizinin `index.md`'sine atla (bölüm genel bakış)
- **Sonraki** (`→`) — bu seviyedeki sonraki dosyaya (mantıksal sırayla, alfabetik değil)
- **Önceki** (`←`) — bu seviyedeki önceki dosyaya

Bir bölümdeki ilk dosyanın "Önceki"si yoktur, son dosyanın "Sonraki"si yoktur.

**Çapraz referanslar** — dosyanın sonunda, "Ayrıca bkz" bölümü:

```markdown
## Ayrıca Bkz

- [filter](./filter.md) — elemanları filtreleme
- [reduce](./reduce.md) — biriktirme
- [forEach](./for-each.md) — sonuçsuz yineleme
```

Diğer bölümlerdeki ilgili yapılara bağlantılar — tam yolla:

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) — bir elemanın ödünç alınması
```

**Her dizindeki index.md** — tüm alt dosyalara bağlantılarla bölüm genel bakışı.
Yukarıdan aşağıya navigasyon için giriş noktası olarak hizmet eder.

Örnek dosya şablonu:

```markdown
# map

Kaynak dizinin her elemanına bir fonksiyon uygulayarak yeni bir dizi oluşturur.

## İmza

\`\`\`typescript
arr.map<U>(f: (Ref<T>) => U): U[]
\`\`\`

Geri çağırım (callback) `Ref<T>` alır — elemanın sahipliği değil, ödünç alınması.

## Örnekler

### Temel Kullanım

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
const doubled = nums.map(x => x * 2)
// → [2, 4, 6]
\`\`\`

### C Çıktısı

\`\`\`c
int32_t* doubled = malloc(3 * sizeof(int32_t));
for (size_t i = 0; i < 3; i++) {
    doubled[i] = nums[i] * 2;
}
\`\`\`

### Tip Dönüşümü

\`\`\`typescript
const names: string[] = users.map(u => u.name)
// → ["Alice", "Bob"]
\`\`\`

## Hatalar

### Geri Çağırım Elemanı Değiştirir

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => { x++ })  // error: cannot assign to Ref<i32>
\`\`\`

Düzeltme:

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => x * 2)  // yeni bir değer döndür
\`\`\`

## Ayrıca Bkz

- [filter](./filter.md)
- [reduce](./reduce.md)
- [flatMap](./flat-map.md)
```

---

## Dokümantasyon Yapısı

### 01-intro.md — TSClang'a Giriş

**Hedef:** nedir, neden var ve ilk çalışan örneği sağlamak.

- TSClang Nedir (TS sözdizimi → C, Rust güvenliği, npm ekosistemi)
- Tasarım felsefesi (3 öncelik: güvenlik, performans, TS sözdizimi)
- Kullanım alanları (masaüstü, gömülü, sunucular, retro platformlar)
- Hızlı başlangıç: kurulum, `hello world`, derleme ve çalıştırma
- Gereksinimler (Node.js, CMake, gcc/clang)
- CLI genel bakış: `tsclang build`, `tsclang lint`, `tsclang lsp`

**Kaynak:** `spec/01-intro.md`

---

### 02-syntax.md — Sözdizimi

**Hedef:** dil sözdiziminin tam açıklaması.

- Biçimlendirme (ASI, K&R, girinti, tırnaklar, sondaki virgül)
- Değişkenler: `let` / `const` — sahiplik bağlamında fark
- Fonksiyonlar: `function`, ok fonksiyonu, anonim, IIFE
- Parametreler: varsayılan, rest
- Fonksiyon aşırı yüklemesi (tipe ve sayıya göre, çözümleme önceliği)
- Operatörler: aritmetik, atama, karşılaştırma, mantıksal, bitsel
- Truthy / Falsy (tipe göre tablo)
- Döngüler: `for`, `for-of`, `while`, `do-while`, `break`/`continue`, etiketli
- `switch` / `match` — karşılaştırma, tükenme (exhaustiveness)
- Yayılma operatörü (spread) (diziler, nesneler, sahiplik kuralları)
- İndeksleme ve dilimler (slices) (diziler ve diziler, negatif indeksler)

**Kaynak:** `spec/02-syntax.md`

---

### 03-types.md — Tip Sistemi

**Hedef:** tip tanımlama, tüm tipler ve dönüşümler.

- Yapısal vs nominal tip tanımlama (`type`, `interface`, `class`)
- Tip çıkarımı
- Sayısal tipler (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`)
  - Değişmezler (hex, binary, octal, `_` ayraçları)
  - Otomatik dönüşüm (3 mekanizma: genişletme, derleme zamanı, `as`)
  - `usize` — platform tipi
  - `number` = `f64` (üzerine yazılabilir)
  - AVR üzerinde performans uyarıları
- `string` — UTF-8 baytlar, C yerleşimi, indeksleme, yineleme, yerleşik metotlar
- Özel tipler: `void`, `never`, `any`
- Null: `T | null`, isteğe bağlı `?`, isteğe bağlı zincirleme `?.`, nullish birleştirme `??`
  - `T | null`'ın C gösterimi (bayraklı yapı)
  - Gömülü kalıplar: bekçi değer, ayrı bayrak
- Tip dönüşümü: sayı ↔ dizi, JS uyumlu fonksiyonlar (`parseInt`, `parseFloat`)
- `Date` — oluşturma, metotlar, biçimlendirme
- Diziler: `T[]` (dinamik), `T[N]` (sabit), metotlar, fonksiyonel metotlar
- `Slice<T>` / `MutSlice<T>` — sıfır kopyalı görünüm
- `Map<K,V>`, `Set<T>` — API, sahiplik, gömülü kalıplar
- `Object` — statik metotlar
- Demetler (tuple): sabit, etiketli, readonly, isteğe bağlı, rest, spread
- `Clone` — arayüz, `clone()`, `structuredClone()`
- Tip takma adları (`type`)
- Dizi değişmez birleşimi (string literal union)
- Yardımcı tipler: `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`
- `Buffer`, `DataView`

**Kaynak:** `spec/03-types.md`

---

### 04-classes.md — Sınıflar, Arayüzler, Numaralandırma, Jenerikler

**Hedef:** dilin nesne sistemi.

- Jenerikler: sözdizimi, sınırlar (`implements`/`extends`), monomorflaştırma, jeneriklerle sahiplik
- Genişletme metotları: bildirim, içe aktarma, çakışmalar
- Numaralandırma: sayısal, dizi, `const enum`, yardımcı programlar, switch/match içinde
- Arayüzler: metotları olan veri vs sözleşme, kalın gösterici (fat pointer), vtable
- `instanceof` — vtable üzerinden tip daraltma
- Sınıflar:
  - Kalıtım yok (`extends Error` hariç), kompozisyon
  - Değiştiriciler: `public`, `private`, `static`, `mut`, `move`
  - `this` ve alan erişimi semantiği
  - `readonly` alanlar
  - Kurucu: otomatik oluşturma, açık, `private`
  - Değer nesnesi kalıbı
  - `move` ile oluşturucu kalıbı (builder pattern)
- Hizalama: `@packed`, `@align(N)`, dolgu teşhisi
- Dekaratörler: genel bakış, tam bölüme referans

**Kaynak:** `spec/04-classes.md`, `spec/13-decorators.md`

---

### 05-memory.md — Bellek Modeli ve Sahiplik

**Hedef:** dilin ana özelliği — güvenli bellek yönetimi.

- Sahiplik tipleri: `T` (Sahip), `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>`, `Slice<T>`
- Temel kurallar: ilkel tipler kopyalanır, karmaşık tipler — sahiplik
- Sahip (T): atamada ve geçişte taşıma (move)
- `Ref<T>`: değiştirilemez ödünç alma, kurallar, alanlarda yasak, geçici çözüm kalıpları
- `Mut<T>`: değiştirilebilir ödünç alma, bir seferde bir tane
- `Shared<T>`: ARC, döngüleri kırmak için `Weak<T>`
- Ödünç Alma Denetleyicisi Kuralları (4 kural)
- Argüman geçiş matrisi (let/const/Ref/Mut/Shared → Ref/Mut/T/Shared)
- İç Değiştirilebilirlik (Interior Mutability) — neden mevcut değil
- `@static let` — küresel değiştirilebilir durum
- Kapsam Kısıtlaması (ömür (lifetime) ek açıklamaları olmadan): 4 kural
- Otomatik Drop ve `goto cleanup`
- `Iterable<T>` — kullanıcı tanımlı yinelenebilir tipler
- Alan erişimi ve parçalama (borrow vs move)
- Dilimler (borrow vs sahipli)
- Diziden taşıma, ödünç alma sırasında değişiklik
- Metottan ödünç alma döndürme
- Kapanışlar: yakalama kuralları, açık yakalama listesi, await ile Mut-kapanış

**Kaynak:** `spec/05-memory.md`

---

### 06-errors.md — Hata İşleme

**Hedef:** hata sistemi — setjmp/longjmp olmadan Result tabanlı.

- İlke: TS'deki `throw`/`try`/`catch` → C'deki Result yapıları
- İmzada `throws` bildirimi
- `Error` — temel sınıf, `error.stack`
- `throw`, `try`/`catch`/`finally`
- Birleşim catch, tükenme işleme (exhaustive handling)
- `?` operatörü (yayma)
- `!` operatörü (açma/panic)
- C çıktısı: Result yapıları, `ok` ve `_kind` üzerinde `if/else`
- Hatalar sırasında sahiplik (cleanup via `goto`)
- Sınırlamalar

**Kaynak:** `spec/06-errors.md`

---

### 07-concurrency.md — Eşzamanlılık

**Hedef:** üç seviye eşzamanlılık ve bunların nasıl kullanılacağı.

- Üç mekanizmanın genel bakışı (async/await, iş parçacıkları, ISR)
- **Async/Await:**
  - Async çalışma zamanı mimarisi (durum makineleri)
  - Durum makinesi boyutu, gömülü sistemlerde yığın (stack) güvenliği
  - `Promise<T>`: oluşturma, `.then`/`.catch`/`.finally`
  - `Promise.all`, `Promise.any`, `Promise.race`, `Promise.allSettled`
  - `await` kuralları, `async main`
  - Özyinelemeli async fonksiyonlar
  - `@embedded.stack` — açık yığın (stack)
  - Görev iptali: `AbortController`, `AbortSignal`
  - `AsyncMutex`
- **İş Parçacıkları (std/threads):**
  - Paylaşımlı bellek olmadan izolatlar
  - `Atomic<T>`, `AtomicArray<T>`
  - `channel<T>`: sınırlandırılmış MPMC, ISR-güvenli işlemler
  - `select`: birden fazla kanalda bekleme
  - `Readonly<T>`: sıfır kopyalı paylaşım
  - `Thread<T>`: tipli sonuç
  - Thread.spawn kuralları, Send kontrolü
- **@embedded.isr:**
  - `Volatile<T>` — MMIO kayıtları
  - ISR: imza, kurallar, kalıplar
  - `std/sync` — kritik bölümler
  - `EmbeddedSignal` — ISR → async köprüsü
- Gömülü ek açıklamalar: `@embedded.inline`, `@embedded.noHeap`
- `@signal` — POSIX sinyalleri (masaüstü)
- Async jeneratörler: `async function*`, `for await`, `close()`
- Jeneratörler aracılığıyla iş birlikçi çok görevlilik (cooperative multitasking)

**Kaynak:** `spec/07-concurrency.md`

---

### 08-modules.md — Modüller ve C Birlikte Çalışabilirliği

**Hedef:** modül sistemi nasıl çalışır ve C birlikte çalışabilirliği.

- Dışa aktarma: adlandırılmış, `export default` yasaktır
- İçe aktarma: adlandırılmış, ad alanı (namespace), `import type`
- Modül başlatma sırası, döngüsel içe aktarmalar
- Modül düzeyi değişkenler
- Yol takma adları (`#`, `~`)
- Giriş noktası: `"main"`, `"builds"`, C main oluşturma
- Kütüphaneler: `"type": "library"`
- `.d.tsc` dosyaları: 5 çeşit bildirim
  - C yapısı, opak tip, C fonksiyonları, sabitler, MMIO kayıtları
  - Bağlantı yapılandırması (system, bundled, fetch)
- `native` — satır içi C (sözdizimi, enterpolasyon, sınırlamalar)
- Geri çağrılar: `FnPtr<T>`, `TSC_CLOSURE_*` makroları
- `unsafe {}` — denetimleri devre dışı bırakma
- `@platform` — koşullu derleme
- Bildirim Birleştirme
- Değişken C fonksiyonları: `Scalar` tipi

**Kaynak:** `spec/08-modules.md`

---

### 09-build.md — Derleme Sistemi

**Hedef:** proje, derleme ve paketler nasıl yapılandırılır.

- Proje tipleri: çalıştırılabilir, kütüphane, C-wrapper, platform paketi
- `tsc.package.json`: tüm alanlar
- C-wrapper: yapı, yayınlama, bağlantı yapılandırması (system/bundled/fetch)
- Platform paketi: `declare platform {}`, platform alanları
- CLI: `tsclang build`, bayraklar (`--outDir`, `--target`, `--profile`, `--optimize`)
- Paket yöneticisi: `tsclang install`, `tsclang publish`, `tsclang search`
- Monorepo: `"workspaces"`
- Gömülü derlemeler: AVR, ARM, retro platformlar
- CMakeLists.txt: oluşturma, özelleştirme
- Profiller: debug/release, optimizasyon

**Kaynak:** `spec/09-build.md`

---

### 10-stdlib.md — Standart Kütüphane

**Hedef:** tüm stdlib modülleri için referans.

- İlkeler: `std/` üzerinden birleşik API, tembel yükleme, tree-shaking
- Küresel nesneler: `console`, `Math`, `process`, zamanlayıcılar, `performance`
- `Error` — temel sınıf
- `Map<K,V>`, `Set<T>` — API, sahiplik
- `Buffer`, `DataView`
- `std/io` — Reader/Writer
- `std/fs` — dosya işlemleri
- `std/net` — fetch, HTTP sunucusu, TCP/UDP
- `std/ws` — WebSocket
- `std/math` — sabitler ve metotlar (tam tablo)
- `std/string` — Unicode, kodlama, biçimlendirme
- `std/json` — ayrıştırma ve serileştirme
- `std/url` — URL ve URLSearchParams
- `std/blob` — Blob ve File
- `std/formdata` — multipart/form-data
- `std/regex` — NFA regex, sözdizimi, API
- `std/random` — Random, HardwareRandom
- `std/temporal` — PlainDateTime, Instant, Duration
- `std/reactive` — ReactiveVar, computed, effect
- `std/hal` — GPIO, UART, SPI, I2C
- `std/embedded` — Volatile, gösterici (pointer), HashMap, StaticMap
- Platform uyumluluğu (tablo)

**Kaynak:** `spec/10-stdlib.md`, `spec/19-stdlib-*.md`

---

### 11-compiler.md — Derleyici Mimarisi

**Hedef:** katkıda bulunanlar ve iç işleyişi anlamak isteyenler için.

- Derleme aşamaları (Parse → AST → Dekaratör → Tip kontrolü → IR → Kod üretimi)
- IR: temel bloklar, komutlar, phi düğümleri
- Ad mangeling (biçimsel şema)
- Hata ayıklama bilgisi: `#line` yönergeleri, DAP sunucusu
- Tüketici tarafı monomorflaştırma
- Artımlı derleme (yol haritası)
- Optimizasyon seviyeleri (O0–O3, Os)
- Hata mesajları: format, kategoriler, hata kodları

**Kaynak:** `spec/11-compiler.md`

---

### 12-migration.md — Geçiş Rehberi: TypeScript → TSClang

**Hedef:** TS geliştiricisinin kodunu taşımasına yardımcı olmak.

- Otomatik düzeltmeler (`tsclang migrate`)
- Olduğu gibi çalışanlar (örnekler)
- Manuel düzeltme gerektirenler (belirli kalıplar)
- Uyumsuz kalıplar (alternatifler tablosu)
- TSClang'ın ekledikleri (TS'te olmayanlar)

**Kaynak:** `spec/12-migration.md`

---

## Bölümlerin Özet Tablosu

| # | Dosya | İçerik | Kaynak | Boyut |
|---|------|---------|--------|------|
| 01 | intro | TSClang nedir, hızlı başlangıç, CLI | `spec/01-intro.md` | ~30 KB |
| 02 | syntax | Sözdizimi, operatörler, döngüler, match/switch | `spec/02-syntax.md` | ~50 KB |
| 03 | types | Tipler, sayılar, diziler, Map/Set, demetler, yardımcı tipler | `spec/03-types.md` | ~80 KB |
| 04 | classes | Sınıflar, arayüzler, numaralandırma, jenerikler, genişletme metotları | `spec/04-classes.md`, `spec/13-decorators.md` | ~40 KB |
| 05 | memory | Sahiplik, ödünç alma denetleyicisi, Ref/Mut/Shared, kapanışlar | `spec/05-memory.md` | ~50 KB |
| 06 | errors | throw/try/catch, Result, `?`/`!` operatörleri | `spec/06-errors.md` | ~15 KB |
| 07 | concurrency | async/await, iş parçacıkları, ISR, atomik, kanallar, jeneratörler | `spec/07-concurrency.md` | ~70 KB |
| 08 | modules | İçe/dışa aktarma, .d.tsc, yerel (native), unsafe, @platform | `spec/08-modules.md` | ~50 KB |
| 09 | build | Derleme, paketler, C-wrapper, platformlar | `spec/09-build.md` | ~50 KB |
| 10 | stdlib | Tüm std modülleri için referans | `spec/10-stdlib.md`, `spec/19-stdlib-*.md` | ~60 KB |
| 11 | compiler | Derleyici mimarisi (katkıda bulunanlar için) | `spec/11-compiler.md` | ~30 KB |
| 12 | migration | TypeScript → TSClang geçiş rehberi | `spec/12-migration.md` | ~15 KB |
| | | | **Toplam** | **~540 KB** |

## Önerilen Yazım Sırası

Önerilen sıra (en önemli ve yaygından gelişmişe):

1. `01-intro.md` — herkes için giriş noktası
2. `02-syntax.md` — temel yapılar
3. `05-memory.md` — ana özellik, herkesin bilmesi gerekir
4. `03-types.md` — tip sistemi
5. `04-classes.md` — nesne sistemi
6. `06-errors.md` — hata işleme
7. `08-modules.md` — modüller ve C birlikte çalışabilirliği
8. `07-concurrency.md` — eşzamanlılık
9. `10-stdlib.md` — API referansı
10. `09-build.md` — derleme sistemi
11. `12-migration.md` — TS'ten taşıma
12. `11-compiler.md` — iç işleyiş (katkıda bulunanlar için)

## Boyut Tahmini

| Doküman | Tahmini Boyut |
|----------|----------------|
| 01-intro | ~30 KB |
| 02-syntax | ~50 KB |
| 03-types | ~80 KB |
| 04-classes | ~40 KB |
| 05-memory | ~50 KB |
| 06-errors | ~15 KB |
| 07-concurrency | ~70 KB |
| 08-modules | ~50 KB |
| 09-build | ~50 KB |
| 10-stdlib | ~60 KB |
| 11-compiler | ~30 KB |
| 12-migration | ~15 KB |
| **Toplam** | **~540 KB** |

## Format

- Markdown (.md)
- Her dosya kendi başına bir bölümdür
- Bölüm başlıkları için H1, alt bölümler için H2/H3
- Referans bilgileri için tablolar
- Dil belirteci olan kod blokları (```typescript, ```c, ```bash)
- Önemli notlar için `> **Not:**`
- Kritik sınırlamalar için `> **Uyarı:**`
