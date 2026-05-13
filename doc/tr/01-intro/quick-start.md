# Hızlı Başlangıç

[← Yukarı](./index.md) | [Sonraki →](./cli.md) | [Önceki ←](./design-philosophy.md)

---

## Gereksinimler

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16 (binary derleme için)
- **C derleyici** — gcc, clang veya avr-gcc (AVR için)

## Kurulum

```bash
npm install -g tsclang

tsclang --version
```

Kurulum olmadan çalıştırma:

```bash
npx tsclang build
```

## Proje Oluşturma

```bash
tsclang init myapp
cd myapp
```

Yapıyı oluşturur:

```
myapp/
  tsc.package.json
  src/
    main.tsc
```

`tsc.package.json`:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc"
}
```

## Hello world

`src/main.tsc`:

```typescript
console.log("Hello world")
```

## Derleme ve Çalıştırma

```bash
tsclang build                  # C üret + binary'e derle
tsclang build --emit c         # sadece C üretim (derleme yok)
tsclang run                    # derle ve çalıştır
```

Derleme sonucu:

```
dist/
  main.c              # üretilen C kodu
  CMakeLists.txt      # elle derleme için
  myapp               # binary (eğer --emit binary)
```

## Tek Dosya Derlemesi

`tsc.package.json` olmadan — sadece dosyayı iletin:

```bash
tsclang build hello.tsc
```

## Sırada Ne Var

- [Sözdizimi](../02-syntax/index.md) — dil yapıları
- [Bellek Modeli](../05-memory/index.md) — sahiplik, ödünç alma, `Ref<T>`
- [CLI](./cli.md) — tüm komutlar

## Ayrıca Bkz

- [CLI](./cli.md) — tam komut açıklaması
- [Derleme Sistemi](../09-build/index.md) — yapılandırma, platformlar, profiller
