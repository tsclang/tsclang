# Schnellstart

[← Hoch](./index.md) | [Weiter →](./cli.md) | [Zurück ←](./design-philosophy.md)

---

## Voraussetzungen

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16 (für Binärkompilierung)
- **C-Compiler** — gcc, clang oder avr-gcc (für AVR)

## Installation

```bash
npm install -g tsclang

tsclang --version
```

Ausführen ohne Installation:

```bash
npx tsclang build
```

## Projekt erstellen

```bash
tsclang init myapp
cd myapp
```

Erstellt Struktur:

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

## Hello World

`src/main.tsc`:

```typescript
console.log("Hello world")
```

## Build und Ausführen

```bash
tsclang build                  # generate C + compile to binary
tsclang build --emit c         # C generation only (no compilation)
tsclang run                    # build and run
```

Build-Ergebnis:

```
dist/
  main.c              # generated C code
  CMakeLists.txt      # for manual build
  myapp               # binary (if --emit binary)
```

## Einzeldatei-Build

Ohne `tsc.package.json` — einfach die Datei übergeben:

```bash
tsclang build hello.tsc
```

## Was kommt als Nächstes

- [Syntax](../02-syntax/index.md) — Sprachkonstrukte
- [Speichermodell](../05-memory/index.md) — Eigentum, Borgen, `Ref<T>`
- [CLI](./cli.md) — alle Befehle

## Siehe auch

- [CLI](./cli.md) — vollständige Befehlsbeschreibung
- [Build-System](../09-build/index.md) — Konfiguration, Plattformen, Profile
