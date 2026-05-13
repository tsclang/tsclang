# Klassen und Objektsystem

[Zurück](../index.md) | [Weiter →](./classes.md)

---

Das TSClang-Objektsystem baut auf Komposition statt Vererbung, nominale Typisierung für Klassen und strukturelle Typisierung für Schnittstellen. Generics werden monomorphisiert — separater C-Code für jeden konkreten Typ.

## Grundprinzipien

- **Keine Vererbung** — nur `extends Error` für Fehlerhierarchien. Polymorphismus über `interface` + `implements`.
- **Komposition** — statt `class Dog extends Animal` verwende `class Dog { animal: Animal }`.
- **Eigentum ist integriert** — `mut`-, `move`-Methodenmodifikatoren steuern `this`-Semantik.
- **Generics werden monomorphisiert** — `Stack<i32>` und `Stack<User>` generieren separate C-Funktionen.
- **Dekoratoren sind Compile-Zeit** — transformieren AST vor der Typprüfung, null Laufzeit-Overhead.

## Unterseiten

| Seite | Beschreibung |
|-------|--------------|
| [Klassen](./classes.md) | Definition, Modifikatoren, `this`-Semantik, `readonly`, Konstruktoren, Wertobjekt, Builder |
| [Schnittstellen](./interfaces.md) | Datenschnittstellen vs Vertrag, Fat-Pointer-Vtable, `instanceof`, strukturelle Kompatibilität |
| [Aufzählung](./enum.md) | Numerisch, String, `const enum`, Hilfsmittel, Exhaustivität in `match` |
| [Generics](./generics.md) | Syntax, Grenzen (`implements`/`extends`), Monomorphisierung, Eigentum mit Generics |
| [Dekoratoren](./decorators.md) | `decorator function`, Descriptor-API, `@packed`, `@align`, `@static`, `@embedded.*`, `@signal`, `@platform` |

## Erweiterungsmethoden

TSClang unterstützt Erweiterungsmethoden — Hinzufügen von Methoden zu bestehenden Typen ohne Änderung der Definition. Explizit importiert, verunreinigen nicht den globalen Gültigkeitsbereich.

```typescript
export extension function charCount(this: string): i32 {
    // Codepoints zählen
}

import { charCount } from "std/string"
"привет".charCount()   // ok
```

C-Ausgabe — statischer Aufruf, null Overhead:

```c
int32_t n = tsc_std_string_charCount(s);
```

Eine Erweiterung, die mit einer bestehenden Methode kollidiert — Compilerfehler. Zwei Erweiterungen mit demselben Namen aus verschiedenen Modulen — Auflösung über `import { format as fmtA } from "./module-a"`.

## Fehler

| Fehler | Ursache |
|--------|---------|
| `extends is only allowed for Error` | Versuch, von einer beliebigen Klasse zu erben |
| `extension 'format' conflicts with existing method` | Erweiterung mit dem Namen einer bestehenden Methode |
| `ambiguous extension 'format' for type 'string'` | Zwei importierte Erweiterungen mit demselben Namen |

## Siehe auch

- [Speichermodell](../05-memory/index.md) — Eigentum, `Ref<T>`, `Mut<T>`, Move-Semantik
- [Typsystem](../03-types/index.md) — Strukturelle vs nominale Typisierung
- [Fehlerbehandlung](../06-errors/index.md) — `extends Error`, `throws`, `try/catch`
- [Spezifikation: Klassen](../../spec/04-classes.md) — vollständige Beschreibung des Objektsystems
