# Compiler-Architektur

[Hoch](../index.md) | [Weiter](./phases.md)

---

TSClang-Compiler-Architektur für Mitwirkende. Der Compiler übersetzt `.tsc` zu C99 und delegiert Maschinenoptimierungen an den C-Compiler (gcc/clang/avr-gcc).

## Pipeline

```
.tsc-Quelle
    ↓
Parse (Lexer + Parser)      →  AST
    ↓
Decorator-Pass              →  modifizierter AST
    ↓
Typecheck                   →  typisierter AST
    ↓
Lower to IR                 →  SSA-ähnliche IR (Basisblöcke)
    ↓
Ownership Analysis          →  Borrow-Checker + ARC-Injektion
    ↓
Codegen                     →  C99 + #line + CMakeLists.txt
    ↓
C-Compiler                  →  Binary / .hex
```

## Quellcode

| Pfad | Zweck |
|------|-------|
| `src/compiler/lexer.js` | Lexer |
| `src/compiler/parser.js` | Parser → AST |
| `src/compiler/types.js` | Hilfstypen und Mangling |
| `src/compiler/codegen.js` | Codegen-Einstiegspunkt, Context-Klasse |
| `src/compiler/codegen/top-level/` | Klassen, Funktionen, Interfaces, Enum, Typ-Aliase |
| `src/compiler/codegen/stmt/` | Variablendeklarationen, Kontrollfluss, Destrukturierung, Match |
| `src/compiler/codegen/expr/` | Ausdrucks-Dispatcher, Operatoren, Zuweisung, Literale |
| `src/compiler/codegen/calls/` | Aufrufe: Methoden, Console, Stdlib, Builtin, Konvertierungen, Nebenläufigkeit |
| `src/compiler/codegen/types/` | Typauflösung, Inferenz, Hilfsmittel |
| `src/compiler/codegen/misc/` | Hilfsmittel, New-Expr, Closures, Arrays |
| `src/compiler/codegen/async/` | Async: Anweisungen, Emit, Generatoren, Hilfsmittel, Scanning |
| `src/compiler/codegen/generics.js` | Generische Monomorphisierung |
| `src/runtime/runtime.h` | C-Runtime-Headerdatei |

## Testmethodik

Jede Komponente wird in einem Zyklus implementiert:

```
1. Tests     — Corpus (input.tsc → expected.c / expected.error)
2. Implementierung — bis alle Tests bestehen
3. Log       — log/<komponente>.md: Entscheidungen, Probleme, Änderungen
```

Test-Corpus: `test/cases/phase0–phase19`, insgesamt 1028 Tests. Format beschrieben in `test/CORPUS.md`.

## Unterseiten

| Seite | Beschreibung |
|-------|--------------|
| [Kompilierungsphasen](./phases.md) | Parse → AST → Decorator → Typecheck → IR → Ownership → Codegen |
| [Name Mangling](./name-mangling.md) | Formales Schema, Typkodierung, Modul-Slug, Kollisionen |
| [Debug-Info](./debug.md) | `#line`-Direktiven, DAP-Server, Embedded-Debugging |
| [Optimierung](./optimization.md) | Stufen O0–O3/Os, Consumer-seitige Monomorphisierung, inkrementell *(Roadmap)* |

## Fehler

| Fehler | Ursache |
|--------|---------|
| `type name must start with uppercase letter` | Klassen/Interface-Name nicht PascalCase |
| `type name uses reserved mangling prefix` | Verwendung von `ref_`, `mut_`, `arc_`, `opt_`, `arr_` im Typnamen |
| `error[TSC-EXXX]` | Stabiler Fehlercode — in der Dokumentation durchsuchbar |

## Siehe auch

- [Dekoratoren](../04-classes/decorators.md) — Decorator-Pass: Algorithmus und Einschränkungen
- [Speichermodell](../05-memory/index.md) — Ownership, Borrow-Checker, IR-Anweisungen
- [Build-System](../09-build/index.md) — CMake, Profile, eingebettete Ziele
