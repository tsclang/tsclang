# Hata İşleme

[← Yukarı](../index.md) | [Sonraki →](./throw-try.md)

---

TSClang, `throw`/`try`/`catch`/`finally` sözdizimini TypeScript gibi kullanır, ancak hataları C'de **Result yapılarına** derler — `setjmp`/`longjmp` olmadan. Bu şunları sağlar:

- **Sıfır maliyet**: her `try` bloğunda register kaydetme yok
- **Güvenli C birlikte çalışabilirliği**: üçüncü taraf C kodu içinden `longjmp` yok
- **Doğru sahiplik**: sıradan kontrol akışı, derleyici tüm sahip değişkenleri bilir

## Prensip

Başarısız olabilecek her fonksiyon imzasında `throws` bildirir. C-çıktısında dönüş tipi, `ok` alanı ve değer veya hata için bir birlik içeren bir Result yapısıyla sarmalanır. `try`/`catch` işleyicileri, `ok` alanı ve `_kind` üzerinde sıradan `if/else`'lere derlenir.

## Temel kavramlar

### throws bildirimi

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

`throws` olmadan — bir fonksiyon `throw` içeremez (derleme hatası).

### Error — temel sınıf

Tüm hatalar `Error`'dan kalıtım alır:

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // sadece masaüstü — "__FILE__:__LINE__" throw noktaları
}
```

### ? ve ! operatörleri

| Operatör | Semantik | `throws` gerekir mi? |
|----------|-----------|-------------------|
| `expr?`  | Yayımla — hatayı mevcut fonksiyondan döndür | Evet |
| `expr!`  | Aç — hata durumunda panik (`abort()`) | Hayır |

### C'deki Result yapısı

```c
typedef struct {
    bool ok;
    union {
        Response value;
        struct {
            _fetch_err_kind _kind;
            union {
                IOError io;
                NetworkError net;
            } _err;
        };
    };
} _Result_Response_IOError_NetworkError;
```

### Hatalarla sahiplik

Derleyici, bir `try` bloğundaki tüm sahip değişkenleri izler. Hata durumunda, zaten başlatılmış tüm sahip değişkenler sıradan kontrol akışı (`goto cleanup`) ile serbest bırakılır.

## Alt sayfalar

| Sayfa | Açıklama |
|----------|----------|
| [throw / try / catch / finally](./throw-try.md) | Hata işleme sözdizimi, tipe göre catch, finally |
| [Result yapıları](./result.md) | Result<T, E>, ayrımlı birlik, C temsili |
| [? ve ! operatörleri](./operators.md) | Yayımla, aç/panik, C-çıktısı |

## Hatalar

| Hata | Neden |
|--------|---------|
| `throw in non-throws function` | `throws` olmayan bir fonksiyonda `throw` |
| `? operator in non-throws function` | Mevcut fonksiyonda `throws` olmadan `?` operatörü |
| `extern "C" cannot throw` | `extern "C"` fonksiyonunda `throws` |
| `throw/return in finally` | `finally` bloğu içinde `throw` veya `return` |
| `error.stack on embedded` | Gömülü platformda `stack`'e erişim |

## Kısıtlamalar

- `throws` olmayan fonksiyonlarda `throw` yasaktır
- `throws` olmayan bir fonksiyonda `?` yasaktır
- İstisnalar C birlikte çalışabilirlik sınırları arasında atılamaz — `extern "C"` `throws` içeremez
- `finally` `throw` veya `return` içeremez
- `error.stack` gömülü platformlarda kullanılamaz

## Ayrıca bakınız

- [Bellek Modeli: Otomatik Drop](../05-memory/auto-drop.md) — birden fazla çıkış noktasıyla `goto cleanup`
- [Bellek Modeli: Sahip](../05-memory/owner.md) — hatalarla taşıma ve sahiplik
- [Sınıflar](../04-classes/index.md) — Error kalıtımı ve özel hata tipleri
