# Syntax

[← Hoch](../index.md) | [Weiter →](./formatting.md)

---

Vollständige Beschreibung der TSClang-Syntax. Die Sprache folgt TypeScript/JavaScript-Konventionen mit Erweiterungen für sicheres Speichermanagement.

## Abschnitte

### Grundlagen
- [Formatierung](./formatting.md) — Semikolons, Einrückung, Anführungszeichen, Linter
- [Truthy / Falsy](./truthy-falsy.md) — welche Werte als wahr/falsch gelten

### Variablen
- [let / const](./variables/index.md) — Mutabilität, Besitzunterschiede

### Funktionen
- [Deklaration](./functions/declaration.md) — `function`, Parameter, Rückgabetyp
- [Pfeil](./functions/arrow.md) — `=>`-Syntax
- [Überladung](./functions/overload.md) — nach Typ und Parameteranzahl
- [Standardparameter](./functions/default-params.md) — Standardwerte

### Operatoren
- [Arithmetik](./operators/arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Zuweisung](./operators/assignment.md) — `=`, `+=`, `-=`, usw.
- [Vergleich](./operators/comparison.md) — `==`, `!=`, `===`, `!==`
- [Logisch](./operators/logical.md) — `&&`, `||`, `!`, `??`
- [Bitweise](./operators/bitwise.md) — `&`, `|`, `^`, `~`, `<<`, `>>`
- [Optional](./operators/optional.md) — `?.`, `??`, Spread `...`
- [Operatorrangfolge](./operators/precedence.md) — Rangfolgetabelle

### Schleifen
- [for](./loops/for.md) — klassische Schleife
- [for-of](./loops/for-of.md) — Sammlungsiteration
- [while / do-while](./loops/while.md) — Bedingungsschleifen
- [break / continue](./loops/break-continue.md) — Iterationssteuerung

### Ablaufsteuerung
- [switch](./match/switch.md) — Wertauswahl
- [match](./match/index.md) — Pattern Matching

### Slices
- [Indizierung und Slices](./slices.md) — `[]`, `[a..b]`, negative Indizes

## Siehe auch

- [Typen](../03-types/index.md) — Typsystem
- [Speichermodell](../05-memory/index.md) — Besitz und Borrow Checker
