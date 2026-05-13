# Build-System

[Hoch](../index.md) | [Weiter](./projects.md)

---

Das Build-System von TSClang kompiliert `.tsc`-Dateien zu C99 und erstellt ein Binary über CMake. Unterstützt Desktop-Anwendungen, Bibliotheken, C-Wrapper für native C-Bibliotheken und eingebettete Ziele (AVR, ARM, Retro-Plattformen).

## Pipeline

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (oder .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

`outDir`-Struktur:

```
build/desktop/
  c/              ← generierte .c und .h
  CMakeLists.txt
  myapp           ← Binary (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## Schnellstart

```bash
npm install -g tsclang   # Compiler installieren
tsclang init myapp       # Projekt erstellen
cd myapp
tsclang install          # Abhängigkeiten installieren
tsclang run              # bauen und ausführen
```

## Projekttypen

| Typ | Beschreibung | `"type"` | Einstiegspunkt |
|-----|--------------|----------|----------------|
| **Executable** | Anwendung | nicht angegeben (Standard) | `"main"` (erforderlich) |
| **TSClang-Bibliothek** | TSClang-Bibliothek | `"library"` | `index.tsc` (Konvention) |
| **C-Wrapper** | Wrapper über C-Bibliothek | `"library"` | `index.d.tsc` |
| **Plattformprofil** | Plattformprofil | `"platform"` | `index.d.tsc` |

## CLI-Befehle

| Befehl | Alias | Beschreibung |
|--------|-------|--------------|
| `tsclang init` | — | Neues Projekt erstellen |
| `tsclang build` | `b` | Projekt bauen |
| `tsclang run` | — | Bauen und ausführen |
| `tsclang dev` | — | Watch-Modus |
| `tsclang install` | `i` | Abhängigkeiten installieren |
| `tsclang update` | `u` | Abhängigkeiten aktualisieren |
| `tsclang remove` | `r` | Abhängigkeit entfernen |
| `tsclang clean` | `c` | Build-Artefakte entfernen |
| `tsclang lint` | `l` | Formatierung prüfen |
| `tsclang migrate` | — | TypeScript → TSClang-Migration *(Roadmap)* |
| `tsclang lsp` | — | Language Server Protocol *(Roadmap)* |

## Unterseiten

| Seite | Beschreibung |
|-------|--------------|
| [Projekttypen](./projects.md) | Executable, Bibliothek, C-Wrapper, Plattformprofil |
| [Konfiguration](./config.md) | Felder von `tsc.package.json`, Builds, platformSettings |
| [CLI](./cli.md) | Befehle build, run, init, lint, migrate, lsp |
| [Paketmanager](./packages.md) | install, publish, search, workspaces, Lock-Datei |
| [Embedded-Build](./embedded.md) | AVR, ARM, Retro-Plattformen, binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt, Debug-/Release-Profile, Optimierung |

## C-Ausgabe

```c
// build/desktop/c/main.c — generiert aus src/main.tsc
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## Fehler

| Fehler | Ursache |
|--------|---------|
| `cannot determine entry point` | `"main"`-Feld für Executable nicht angegeben |
| `unknown target arch '6502'` | Unbekannte Architektur ohne Plattformprofil |
| `toolchain 'avr-gcc' not found in PATH` | Compiler nicht installiert |
| `dependency conflict` | Inkompatible Semver-Einschränkungen |

## Siehe auch

- [Module: Import/Export](../08-modules/import-export.md) — Einstiegspunkt und Initialisierung
- [Speicher: Ownership](../05-memory/ownership-types.md) — owned/borrow während FFI
- [Nebenläufigkeit](../07-concurrency/index.md) — Async-Runtime: libuv, kooperativ, none
