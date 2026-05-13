# Migration: TypeScript → TSClang

[Hoch](../index.md) | [Weiter](./automatic.md)

---

Leitfaden für Entwickler, die von TypeScript zu TSClang migrieren. Beschreibt automatische und manuelle Konvertierungen, inkompatible Muster und neue Fähigkeiten.

## Prozessübersicht

TSClang strebt maximale Kompatibilität mit TypeScript-Syntax an. Die meiste TypeScript-Code portiert sich ohne Änderungen oder mit minimalen Bearbeitungen. Der Migrationsprozess ist in drei Stufen unterteilt:

1. **Automatische Korrekturen** — `tsclang migrate` wendet mechanische Transformationen an
2. **Manuelle Korrekturen** — Muster, die nicht sicher automatisiert werden können
3. **Inkompatible Muster** — Konstrukte ohne direktes Analogon, die einen Redesign erfordern

## Schnellcheck

```bash
tsclang migrate ./src            # dry-run: zeigen, was sich ändern wird
tsclang migrate ./src --fix      # automatische Korrekturen anwenden
tsclang migrate ./src --check    # CI: Exit 1, falls Inkompabilitäten existieren
```

## Was unverändert migriert

Interfaces, Funktionen mit Typen, Pfeilfunktionen, Klassen (ohne `extends`), Generics, `try/catch`, Template-Strings, Destrukturierung — all dies funktioniert wie in TypeScript. Details — in [Manuelle Migration](./manual.md).

## Unterseiten

| Seite | Beschreibung |
|-------|--------------|
| [Automatische Migration](./automatic.md) | `tsclang migrate`: dry-run, --fix, --check, Liste der Auto-Transformationen |
| [Manuelle Migration](./manual.md) | Was wie ist funktioniert und was manuelle Korrekturen erfordert |
| [Inkompatible Muster](./incompatible.md) | Konstrukte ohne Analogon und Alternativen |
| [Neue Features](./new-features.md) | Ownership, Ref/Mut/Shared, match, throws und mehr |

## Fehler

| Fehler | Ursache |
|--------|---------|
| `undefined is not defined` | Verwendung von `undefined` — durch `null` ersetzen |
| `throw requires Error instance` | Werfen von String oder Number — in `new Error()` wrappen |
| `export default is not supported` | Durch benannten Export ersetzen |
| `extends is not supported` | Klassenvererbung — durch Komposition ersetzen |

## Siehe auch

- [Einführung: Was ist TSClang](../01-intro/what-is-tsclang.md) — Sprachüberblick und Philosophie
- [Build: CLI](../09-build/cli.md) — Befehle `tsclang build`, `tsclang migrate`
- [Speichermodell](../05-memory/index.md) — Ownership, Borrow-Checker, Ref/Mut/Shared
