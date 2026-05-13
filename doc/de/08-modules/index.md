# Modulsystem

[Hoch](../index.md) | [Weiter](./import-export.md)

---

TSClang verwendet ein **Modulsystem**, das in der Syntax mit TypeScript kompatibel ist: benannte `export` / `import { } from ""`. Eine Datei = ein Modul. Der Compiler generiert automatisch `#include`, Vorwärtsdeklarationen und Initialisierungsfunktionen in der C-Ausgabe.

## Prinzipien

- **Eine Datei — ein Modul** — kein `namespace`, kein `module`
- **Nur benannte Exports** — `export default` verboten (C erfordert einen expliziten Namen für jedes Symbol)
- **Zirkuläre Imports erlaubt** — Compiler generiert Vorwärtsdeklarationen in `.h`
- **`.d.tsc`-Dateien** — Deklarationen für C-Interop (Analogon zu `.d.ts` in TypeScript)
- **Pfad-Aliase** — Kurzbezeichnungen `#/`, `~/` statt `../../../`

## Import und Export

```typescript
// math.tsc — Modul mit Exports
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — Import
import { PI, add } from "./math"
console.log(add(1, 2))
```

## Einstiegspunkt

Der Einstiegspunkt wird durch das Feld `"main"` in `tsc.package.json` definiert. Top-Level-Code der Einstiegsdatei wird zum Rumpf von `main()` in C:

```typescript
const a: i32 = 1
console.log(a)
```

```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

## Modulinitialisierung

Der Compiler baut einen Abhängigkeitsgraphen auf und führt eine **topologische Sortierung** durch. Jedes Modul mit Modul-Level-Variablen erhält eine `_init()`-Funktion. Das Ergebnis ist eine einzelne `tsc_init_all()` mit der korrekten Aufrufreihenfolge.

## C-Interop

Für die Interaktion mit C-Bibliotheken bietet TSClang mehrere Mechanismen:

| Mechanismus | Zweck |
|-------------|-------|
| `.d.tsc` | Deklarationen von C-Typen, Funktionen, Konstanten |
| `native` | Inline-C-Code (wörtlich) |
| `unsafe {}` | Deaktivierung des Borrow-/Typ-Checkers |
| `FnPtr<T>` | Funktionszeiger für C-Callbacks |
| `@platform` | Bedingte Kompilierung pro Plattform |

## Unterseiten

| Seite | Beschreibung |
|-------|--------------|
| [Import / Export](./import-export.md) | Benannter Export/Import, Namespace-Import, `import type`, Initialisierung, zirkuläre Imports, Pfad-Aliase |
| [.d.tsc-Dateien](./d-tsc.md) | Deklarationen für C-Interop: struct, opaker Typ, Funktionen, Konstanten, MMIO |
| [native — Inline-C](./native.md) | Syntax, Interpolation, Einschränkungen, Assembly-Einschübe |
| [unsafe {} — Deaktivierung von Prüfungen](./unsafe.md) | Wann zu verwenden, was es deaktiviert, Unterschied zu `native` |
| [Callbacks und FnPtr\<T\>](./callbacks.md) | Funktionszeiger, TSC_CLOSURE_*-Makros, Closure-Bridging |
| [@platform — Bedingte Kompilierung](./platform.md) | Plattformabhängige Implementierungen, Paketstruktur |

## C-Ausgabe

```c
// Ergebnis der Kompilierung mehrerer Module
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... Top-Level-Code aus main.tsc ...
    return 0;
}
```

## Fehler

| Fehler | Ursache |
|--------|---------|
| `cannot determine entry point` | Kein `"main"`-Feld in `tsc.package.json` |
| `main file not found: src/main.tsc` | Datei aus `"main"` existiert nicht |
| `circular initialization dependency detected` | Zyklus durch Modul-Level-Variablen |
| `export default is not allowed` | Versuch, Standard-Export zu verwenden |
| `native block — C code inserted verbatim` | Warnung bei jedem `native`-Block |

## Siehe auch

- [Syntax: Variablen](../02-syntax/variables/index.md) — Modul-Level-Variablen
- [Speicher: Ownership](../05-memory/ownership-types.md) — owned/borrow beim Übergabe zwischen Modulen
- [Nebenläufigkeit](../07-concurrency/index.md) — Thread-Sicherheit für Modul-Level-Variablen
