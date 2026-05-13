# Was ist TSClang

[← Hoch](./index.md) | [Weiter →](./design-philosophy.md)

---

TSClang ist eine kompilierte Sprache mit TypeScript-Syntax, die `.tsc`-Dateien in lesbaren C-Code übersetzt und automatisch `CMakeLists.txt` generiert.

## Warum

Viele Entwickler wechseln von TypeScript zu C — und das tut weh. C mangelt es an einem anständigen Ökosystem: kein Paketmanager, keine bequeme Cross-Kompilierung, keine eingebauten Speichersicherheitsprüfungen.

TSClang löst das:

- **Vertraute Syntax** — ein TS-Entwickler erkennt die Konstrukte und ist sofort produktiv
- **Sicherer Speicher** — Eigentum und Borgen-Prüfer zur Compile-Zeit, kein GC
- **Einheitliches Ökosystem** — Abhängigkeiten, Cross-Kompilierung, out-of-the-box Builds
- **Lesbare C-Ausgabe** — kann inspiziert, debuggt und mit handgeschriebenem C kombiniert werden

## Wofür

**Jetzt:**

- Server-Code — HTTP, Sockets, Backends
- Desktop — CLI/TUI, Dateimanager, Office-Anwendungen

**Wichtig:**

- Systemebene — Treiber, Betriebssysteme
- Embedded — Arduino, ESP, Raspberry Pi
- Spiele — via OpenGL, DirectX

**Traum:**

- Cross-Plattform — Windows, Linux, Mac, Android, iOS
- Retro-Plattformen — ZX Spectrum, NES, Sega, MS-DOS

## Dateierweiterung

`.tsc` — TSClang-Quelldatei.

```typescript
// hello.tsc
console.log("Hello world")
```

Kompiliert zu:

```c
// hello.c
#include "runtime.h"
int main(void) {
    tsc_console_log(tsc_string_from_cstr("Hello world"));
    return 0;
}
```

## Siehe auch

- [Design-Philosophie](./design-philosophy.md) — drei Prioritäten der Sprache
- [Schnellstart](./quick-start.md) — Installation und erstes Projekt
- [Speichermodell](../05-memory/index.md) — Eigentum und Borgen-Prüfer
