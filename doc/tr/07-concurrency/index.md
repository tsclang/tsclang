# Eşzamanlılık

[← Yukarı](../index.md) | [Sonraki →](./async.md)

---

TSClang eşzamanlılığı, her biri kendi soyutlama düzeyinde ve platformunda çalışan **üç bağımsız mekanizmaya** ayırır.

## Genel bakış

| Mekanizma | Platform | Düzey | Açıklama |
|-----------|----------|-------|-------------|
| `async/await` | tümü | standart | Olay döngüsü, durum makineleri, Promise |
| `std/threads` | İS (masaüstü/sunucu) | gelişmiş | İzolatlar, kanallar, Atomic |
| `@embedded.isr` | gömülü (AVR/Cortex) | sistem | Donanım kesmeleri, MMIO |

```
┌─────────────────────────────────────────────────────┐
│  TSC Eşzamanlılık Modeli                             │
│                                                      │
│  async/await ──── olay döngüsü ──── tüm platformlar  │
│       │                                              │
│       ├── Promise<T> — async fonksiyonların sonucu   │
│       ├── AbortController — işbirlikçi iptal         │
│       └── async generators — veri akışı              │
│                                                      │
│  std/threads ───── izolatlar ────── sadece İS        │
│       │                                              │
│       ├── channel<T>: sahiplik aktarımı              │
│      ├── Atomic<T> / AtomicArray<T>: paylaşımlı sayaçlar│
│      ├── Readonly<T>: sıfır kopya değişmez paylaşım  │
│       └── Thread<T>: tip belirtilmiş sonuç           │
│                                                      │
│  @embedded.isr ─── ISR ─────────── sadece gömülü     │
│       │                                              │
│       ├── Volatile<T> — MMIO registerları            │
│       ├── EmbeddedSignal — ISR → async köprüsü       │
│       └── interrupts.disable() — kritik bölümler     │
└─────────────────────────────────────────────────────┘
```

## Temel Prensipler

- **async/await** — tek iş parçacıklı olay döngüsü, `Shared<T>` ve `Weak<T>` atomik değildir, sıfır maliyet
- **İş parçacıkları** — paylaşımlı bellek olmadan izolatlar, kanallar (sahiplik aktarımı) veya `Atomic<T>` ile iletişim
- **ISR** — donanım kesmeleri, bağlam yakalama yok, yığın (heap) yasak

## Async ve iş parçacıkları — ayrı dünyalar

`Thread.spawn` içinde `await` — derleyici hatası. Bir iş parçacığının olay döngüsü yoktur. Kanal tek köprüdür:

```
Olay döngüsü: await rx.receive()  ←──────────────┐  engellemez
                                                │
İş parçacığı: tx.send(result)  ────────────────┘  engeller (doluysa)
```

## Alt sayfalar

| Sayfa | Açıklama |
|------|-------------|
| [Async/Await](./async.md) | Durum makineleri, await kuralları, async main, AbortController, AsyncMutex |
| [Promise](./promise.md) | Promise<T>, .then/.catch/.finally, all/any/race/allSettled |
| [İş parçacıkları](./threads.md) | Thread.spawn, Atomic<T>, AtomicArray<T>, Readonly<T>, Send-check |
| [Kanallar ve select](./channels.md) | channel<T>, sınırlı MPMC, ISR-güvenli işlemler, select |
| [ISR (Gömülü)](./isr.md) | @embedded.isr, Volatile<T>, std/sync, EmbeddedSignal |
| [Generators](./generators.md) | async function*, for await, close(), işbirlikçi çoklu görev |

## Ayrıca bakınız

- [Bellek Modeli](../05-memory/index.md) — sahiplik, ödünç alma denetleyicisi, Shared/Weak
- [Hatalar](../06-errors/index.md) — throws, try/catch, ?-operatörü
- [Modüller ve Platformlar](../08-modules/index.md) — çalışma zamanı, platform profilleri
