# Tip Sistemi

[← Yukarı](../index.md) | [Sonraki →](./numbers.md)

---

TSClang'ın tip sistemi statiktir, tip çıkarımı vardır ve üç güvenlik seviyesi sunar: derleme zamanı kontrolleri, sahiplik/ödünç alma denetleyicisi ve isteğe bağlı ARC.

## İki Seviyeli Tip Sistemi

TSClang tipleri **yapısal** ve **nominal** olarak ayırır:

| Yapı | Tip Sistemi | Nesne Değişmezleri | C-çıktısı |
|-----------|--------|-----------------|----------|
| `type Foo = { ... }` | Yapısal | ✅ | `typedef struct`, metodlar yasak |
| `interface Foo { ... }` | Yapısal | ✅ (metod yoksa) | `typedef struct` veya fat pointer + vtable |
| `class Foo { ... }` | **Nominal** | ❌ | struct + metodlar |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // tamam — yapısal uyumluluk
const v: Vector = p                     // tamam — aynı alanlar

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // hata — class nominaldir
```

`type` vs `interface` arasındaki temel fark:
- `type Point = { x: f64; y: f64 }` — **garantili** vtable olmayan veri yapısı. Metodlar derleyici hatasıyla yasaktır. Gömülü MMIO, ikili yapılar, ABI-kritik kod için kullanın.
- `interface Point { x: f64; y: f64 }` — şimdilik veri yapısı, ancak gelecekte metodlarla genişletilebilir (o zaman ABI vtable'a geçer).

## Tip çıkarımı

Tip açıkça belirtilmemişse çıkarılır:

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — anonim struct
const s = "hello"            // → string
const n = 42                 // → number (= f64 on desktop)
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[] (= f64[])
```

Açık açıklama geçersiz kılar: `const i: i32 = 1` → `i32`.

## Sayısal tip otocast'i

Üç mekanizma, sırayla uygulanır. İlk uygulanan kazanır.

### Mekanizma 1 — tip seviyesinde genişletme (let ve const)

Sadece tipler üzerinde çalışır, değerlere bakmaz. Koşulsuz olarak güvenli.

| Kaynak | Hedef | Açıklama |
|------|-----|---------|
| `i8`/`i16`/`i32` | `i64` | aynı işaret, kayıp yok |
| `u8`/`u16`/`u32` | `u64` | aynı işaret, kayıp yok |
| `u8` | `i16` | tüm 256 değer sığar |
| `u16` | `i32` | tüm 65.536 değer sığar |
| `u32` | `i64` | tüm 4.3G değer sığar |
| `i32`, `u32` | `f64` | kayıp yok (53-bit mantis) |
| `f32` | `f64` | kayıp yok |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // tamam — u32 her zaman i64'e sığar
```

### Mekanizma 2 — derleme zamanı değer analizi (sadece const)

Her iki işlenen de `const` ile bilinen değişmez değerlere sahipse ve mekanizma 1 uygulanmazsa. Adım adım algoritma — bkz. [Sayısal Tipler → Otocast](./numbers.md).

### Mekanizma 3 — açık `as` (let için)

Mekanizma 1 `let` değişkenler için uygulanmazsa — açık cast gerekir:

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // hata — tip seviyesinde genişletme yok
let c: f64 = (a + (b as i64)) as f64  // tamam
```

Her mekanizmanın detayları — [Sayısal Tipler](./numbers.md) sayfasında.

## Alt sayfalar

| Sayfa | Açıklama |
|------|-------------|
| [Sayısal Tipler](./numbers.md) | i8..i64, u8..u64, f32, f64, usize, number, otocast, `as` |
| [Metinler](./strings.md) | UTF-8 metinleri, değişmezler, metodlar, std/string |
| [Özel Tipler](./special-types.md) | any, never, void, unknown |
| [Null](./null.md) | Nullable tipler, isteğe bağlı zincirleme, `??` |
| [Diziler](./arrays.md) | Dinamik, sabit, Slice<T> |
| [Map ve Set](./map-set.md) | Hash tabloları ve kümeler |
| [Tuple'lar](./tuples.md) | Tuple'lar, etiketli, readonly, isteğe bağlı, rest |
| [Klonlama](./clone.md) | Sahip olunan değerlerin açık klonlanması |
| [Tip Takma Adları](./type-aliases.md) | `type`, opak takma adlar, String Literal Union |
| [Yardımcı Tipler](./utility-types.md) | Partial, Required, Readonly, Pick, Omit, Record, vb. |
| [Tarih](./date.md) | Miras JS-uyumlu tarih/saat tipi |

## Hatalar

| Hata | Neden |
|-------|-------|
| `expected f64, got i32` | Otocast olmadan uyumsuz sayısal tipler |
| `empty object literal is forbidden` | Boş `{}` — `Map<K,V>` kullanın veya tip bildirin |
| `cannot use "void" as variable type` | `void` sadece fonksiyon dönüş tipi içindir |
| `non-nullable runtime union: string \| i32` | Null olamayan çalışma zamanı birleşimi yasaktır, interface veya discriminated union kullanın |

## Ayrıca bakınız

- [Değişkenler: let / const](../02-syntax/variables/index.md) — `let`/`const`'un tipler ve otocast üzerindeki etkisi
- [Bellek Modeli](../05-memory/index.md) — sahiplik, `Ref<T>`, `Mut<T>`
- [Sınıflar ve Arayüzler](../04-classes/index.md) — nominal typing, generics
- [Hata İşleme](../06-errors/index.md) — `throws`, `T | null` vs `T throws E`
