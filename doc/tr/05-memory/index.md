# Bellek Modeli

[← Yukarı](../index.md) | [Sonraki →](./ownership-types.md)

---

TSClang **hibrit bir bellek yönetim modeli** kullanır: statik sahiplik/ödünç alma denetleyicisi + isteğe bağlı ARC. GC yok, elle `free` yok.

## Prensip

Derleyici her değerin sahibini statik olarak izler. Bellek serbest bırakma, sahibin kapsamının sonunda deterministiktir. Statik analizin yetersiz kaldığı durumlarda (grafikler, döngüler) — `Shared<T>` ile atomik refcount (ARC).

## Sahiplik Tipleri

| Tip | Semantik | Açıklama |
|------|-----------|-------------|
| `T` | **Sahip** | Tam sahiplik, aktarımda taşıma |
| `Ref<T>` | **Değiştirilemez ödünç alma** | Salt okunur, değişiklik veya silme yok |
| `Mut<T>` | **Değiştirilebilir ödünç alma** | Okuma ve yazma, aynı anda sadece bir `Mut` |
| `Shared<T>` | **ARC** | Güçlü referans, refcount artırır, sadece masaüstü |
| `Weak<T>` | **Zayıf referans** | Refcount artırmaz, döngüleri kırar |
| `Slice<T>` | **Ödünç alınan dizi görünümü** | Sıfır kopya alt aralık, gösterici + uzunluk |

## Temel Kurallar

- **Temel tipler** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — her zaman **kopyalanır**, ödünç alma denetleyicisi uygulanmaz
- **Karmaşık tipler** (diziler, nesneler, stringler, sınıflar) — sahiplik sistemi tarafından yönetilir
- `string` — yığın (heap) üzerinde tahsis edilmiş Sahip, `Ref<string>` olarak iletilir, `clone()` ile kopyalanır

## Ödünç alma denetleyicisi

**Takma ad XOR değiştirilebilirlik** kuralı: iki `Mut` aynı anda izin verilmez, `Mut` + `Ref` izin verilmez, ancak birden fazla `Ref` aynı anda izin verilir.

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // tamam — birden fazla Ref izin verilir
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // hata: aktif Mut zaten mevcut
```

## Otomatik Drop

Derleyici sahibin kapsamının sonunda `free()` ekler. Birden fazla `return` ve `throw` ile — `goto cleanup` üzerinden tek temizleme noktası:

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... iş ...
cleanup:
    if (u) User_free(u);
}
```

## Alt sayfalar

| Sayfa | Açıklama |
|------|-------------|
| [Sahiplik Tipleri](./ownership-types.md) | Tüm sahiplik tiplerine ve C temsillerine genel bakış |
| [Sahip (T)](./owner.md) | Tam sahiplik, atama ve aktarımda taşıma |
| [Ref<T>](./ref.md) | Değiştirilemez ödünç alma, görünüm desenleri |
| [Mut<T>](./mut.md) | Değiştirilebilir ödünç alma, özel kurallar |
| [Shared<T> ve Weak<T>](./shared.md) | Grafikler ve döngüler için ARC ve zayıf referanslar |
| [Slice<T>](./slice.md) | Dizi veya string parçası üzerinde sıfır kopya görünümü |
| [Ödünç alma denetleyicisi](./borrow-checker.md) | Takma ad kuralları, ömür, kapsam kısıtlamaları |
| [Drop ve temizleme](./drop.md) | Otomatik bellek serbest bırakma, `goto cleanup` |
| [Yapı bozma](./destructuring.md) | Alanları yapı bozarken ödünç alma vs taşıma |
| [Closure'lar](./closures.md) | Yakalama kuralları: kopya, Ref, Mut, taşıma |
| [Yineleyiciler](./iterators.md) | `Iterable<T>`, yığıt (stack) tabanlı çekme yineleyicileri |

## C-çıktısı

```typescript
let user = new User();
user.name = "Alice";
// kapsam sonu — User_free otomatik çağrılır
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... kullanım ...
User_free(&user);   // derleyici tarafından eklenir
```

## Hatalar

| Hata | Neden |
|-------|-------|
| `use of moved value: "x"` | Taşımadan sonra değişkene erişim |
| `already borrowed as Mut` | `Mut` aktifken ikinci `Mut` veya `Ref` |
| `already borrowed as Ref` | `Ref` aktifken `Mut` |
| `Ref<T> not allowed in class field` | Ödünç almayı sınıf alanında saklama girişimi |
| `cannot move out of array by index` | `arr[i]` sahip olunan tip için `.remove()` olmadan |

## Ayrıca bakınız

- [Değişkenler: let / const](../02-syntax/variables/index.md) — `let`/`const`'un `Mut<T>` / `Ref<T>` üzerindeki etkisi
- [Fonksiyonlar](../02-syntax/functions/declaration.md) — argüman aktarma kuralları
- [Sınıflar](../04-classes/index.md) — `mut`-metodlar ve `readonly` alanlar
- [Hatalar](../06-errors/index.md) — `throw` / `?` üzerinde `goto cleanup`
