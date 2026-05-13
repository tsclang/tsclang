# Design-Philosophie

[← Hoch](./index.md) | [Weiter →](./quick-start.md) | [Zurück ←](./what-is-tsclang.md)

---

Bei jeder Designentscheidung folgt TSClang einer strikten Prioritätshierarchie:

## Drei Prioritäten

1. **Speichersicherheit** — Eigentum, Borgen-Prüfer, kein GC
2. **Performance und Typisierung** — Zero-Cost-Abstraktionen, strikte Typen
3. **TS-Syntax** — so weit wie möglich bewahren, aber nicht auf Kosten von #1 und #2

Das Ziel ist nicht, dass bestehender TS-Code ohne Änderungen kompiliert, sondern dass der TS-Entwickler die Syntax erkennt und sich wohlfühlt.

## TS-Syntax hat Priorität

Leihe Syntax von Rust, C, Go — nur wenn TS kein geeignetes Konstrukt hat.

Neue Konzepte werden durch TS-kompatible Syntax eingebettet:

| Konzept | Rust | TSClang |
|---------|------|---------|
| Unveränderliches Borgen | `&T` | `Ref<T>` |
| Veränderliches Borgen | `&mut T` | `Mut<T>` |
| Veränderliche Variable | `let mut` | `let mut` |
| Schreibgeschützt | `let` (Standard) | `const` / `readonly` |

Klassen bleiben erhalten, trotz ihrer Abwesenheit in Rust — sie existieren in TS und sind Entwicklern vertraut.

## Frage für jede Entscheidung

> *Kann das durch bestehende TS-Syntax oder deren natürliche Erweiterung ausgedrückt werden?*

Wenn ja — verwende TS-Syntax. Wenn nein — finde die minimale Erweiterung, die nicht mit TS kollidiert.

## Abwärtskompatibilität

Einfacher nativer TS-Code ohne externe Bibliotheken sollte kompilieren oder nur triviale Korrekturen erfordern, die gültiges TS bleiben:

```typescript
let a = 10          // may require explicit annotation
let a: number = 10  // valid in both TS and TSClang
```

Code mit Klassen, Objekten, Arrays, Schleifen, Template-Literalen — funktioniert unverändert oder mit minimalen Änderungen.

## Siehe auch

- [Was ist TSClang](./what-is-tsclang.md) — Sprachübersicht
- [Speichermodell](../05-memory/index.md) — wie Eigentum und Borgen-Prüfer funktionieren
- [Migrationsleitfaden](../12-migration/index.md) — Portieren von TS-Code nach TSClang
