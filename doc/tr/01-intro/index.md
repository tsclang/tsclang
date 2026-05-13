# TSClang'a Giriş

[← Yukarı](../index.md) | [Sonraki →](./what-is-tsclang.md)

---

TSClang, TypeScript sözdizimine sahip ve C'ye derlenen bir dildir.

- **TypeScript sözdizimi** — tanıdık `let`/`const`, sınıflar, ok fonksiyonları, `async`/`await`
- **C derleme hedefi** — okunabilir C kodu + `CMakeLists.txt` üretilir
- **Rust güvenlik modeli** — sahiplik, ödünç alma denetleyicisi, `Ref<T>`, `Mut<T>`
- **npm ekosistemi deneyimi** — `tsc.package.json`, `tsclang install`, paket kayıt defteri

## Bölümler

- [TSClang Nedir](./what-is-tsclang.md) — neden, kim için, kullanım alanları
- [Tasarım Felsefesi](./design-philosophy.md) — üç öncelik: güvenlik, performans, TS sözdizimi
- [Hızlı Başlangıç](./quick-start.md) — kurulum, hello world, derleme ve çalıştırma
- [CLI](./cli.md) — komutlara genel bakış: `build`, `init`, `lint`, `migrate`, `lsp`

## Ayrıca Bkz

- [Sözdizimi](../02-syntax/index.md) — dil yapıları
- [Bellek Modeli](../05-memory/index.md) — sahiplik ve ödünç alma denetleyicisi
