# TSClang-Dokumentationsplan

## Ziel

Erstelle umfassende Entwicklerdokumentation auf Englisch basierend auf der Spezifikation.
Die Dokumentation soll praxisnah, nutzerorientiert (entwicklerfokussiert) und nicht auf Compiler-Autoren ausgerichtet sein.

## Zielgruppe

1. Ein Entwickler, der aus TypeScript kommt und in TSClang schreiben möchte
2. Ein Entwickler, der die Sprache für Embedded-Entwicklung evaluiert
3. Ein Entwickler, der nach einer bestimmten API sucht (Zeichenkettenmethode, Eigentumstyp, HTTP-Server)

## Schreibprinzipien

- Sprache: Englisch
- Codebeispiele: funktionierend, minimal, mit Kommentaren auf Englisch
- Struktur: von einfach zu komplex
- Jeder Abschnitt ist in sich geschlossen — kann unabhängig gelesen werden
- Querverweise zwischen Abschnitten für vertieftes Studium

## Dateistruktur

**Verschachtelte Struktur:** Jede Methode, Funktion, Typ und Konstrukt erhält eine eigene Datei.
Keine monolithischen Seiten von 50 KB. Wenn eine Methode 3 Aufrufvarianten hat — das sind 3 Dateien
innerhalb des Methodenverzeichnisses.

Beispielstruktur:

```
doc/
  02-syntax/
    index.md                        # section overview + links
    variables/
      let.md
      const.md
    functions/
      declaration.md
      arrow.md
      anonymous.md
      iife.md
      default-params.md
      overload.md
        by-type.md
        by-count.md
        priority.md
    loops/
      for.md
      for-of.md
      while.md
      do-while.md
      break-continue.md
    match/
      syntax.md
      patterns/
        literal.md
        range.md
        destructuring.md
        wildcard.md
        union.md
      exhaustiveness.md
      vs-switch.md
    operators/
      arithmetic.md
      assignment.md
      comparison.md
      logical.md
      bitwise.md
      ternary.md
      optional-chaining.md
      nullish-coalescing.md
      spread.md
    truthy-falsy.md
    slices.md
```

## Regeln für den Dateiinhalt

Jede Datei beschreibt **eine** Methode / Funktion / Konstrukt / Typ und muss enthalten:

### 1. Vollständige Beschreibung

Was es ist, warum es gebraucht wird, wie es funktioniert. Kein Geschwafel — konkret und auf den Punkt.
Erwähne Grenzfälle und nicht-offensichtliches Verhalten.

### 2. Signatur / Syntax

Exakte Signatur mit Parametertypen und Rückgabetyp.
Wenn eine Methode mehrere Varianten hat (Overloads) — beschreibe jede separat.

### 3. Verwendungs- oder Implementierungsbeispiele

Mindestens ein funktionierendes Beispiel pro Variante.
Beispiele sollten minimal sein — ohne unnötigen Kontext.
Jedes Beispiel mit dem angezeigten Ergebnis (Kommentar `// →`).

### 4. C-Ausgabe

Für jedes Beispiel — wie es nach C kompiliert.
Zeige den generierten C-Code, damit der Entwickler versteht, was unter der Haube passiert.
Besonders wichtig für Eigentumskonstrukte (Move, Borgen, Drop, Cleanup).

### 5. Fehler und Behebungen

Typische Compilerfehler bei falscher Verwendung.
Format: `fehlerhafter Code → Fehlertext → korrigierter Code`.
Muss den Compiler-Hinweis enthalten.

### 6. Navigation und Links

Jede Datei muss Navigationslinks enthalten:

**Navigationsleiste** — am Anfang der Datei, nach der Überschrift:

```markdown
[← Up](./index.md) | [Next →](./filter.md) | [Previous ←](./sort.md)
```

Drei Links:
- **Hoch** (`←`) — Springe zur `index.md` des übergeordneten Verzeichnisses (Abschnittsübersicht)
- **Weiter** (`→`) — Springe zur nächsten Datei auf dieser Ebene (in logischer Reihenfolge, nicht alphabetisch)
- **Zurück** (`←`) — Springe zur vorherigen Datei auf dieser Ebene

Die erste Datei in einem Abschnitt hat keinen "Zurück", die letzte keinen "Weiter".

**Querverweise** — am Ende der Datei, Abschnitt "Siehe auch":

```markdown
## See Also

- [filter](./filter.md) — filtering elements
- [reduce](./reduce.md) — accumulation
- [forEach](./for-each.md) — iteration without result
```

Links zu verwandten Konstrukten in anderen Abschnitten — mit vollständigem Pfad:

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) — borrow of an element
```

**index.md in jedem Verzeichnis** — Abschnittsübersicht mit Links zu allen untergeordneten Dateien.
Dient als Einstiegspunkt für die Navigation von oben nach unten.

Beispiel-Dateivorlage:

```markdown
# map

Creates a new array by applying a function to each element of the source array.

## Signature

\`\`\`typescript
arr.map<U>(f: (Ref<T>) => U): U[]
\`\`\`

The callback receives `Ref<T>` — a borrow of the element, not ownership.

## Examples

### Basic Usage

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
const doubled = nums.map(x => x * 2)
// → [2, 4, 6]
\`\`\`

### C Output

\`\`\`c
int32_t* doubled = malloc(3 * sizeof(int32_t));
for (size_t i = 0; i < 3; i++) {
    doubled[i] = nums[i] * 2;
}
\`\`\`

### Type Conversion

\`\`\`typescript
const names: string[] = users.map(u => u.name)
// → ["Alice", "Bob"]
\`\`\`

## Errors

### Callback Mutates Element

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => { x++ })  // error: cannot assign to Ref<i32>
\`\`\`

Fix:

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => x * 2)  // return a new value
\`\`\`

## See Also

- [filter](./filter.md)
- [reduce](./reduce.md)
- [flatMap](./flat-map.md)
```

---

## Dokumentationsstruktur

### 01-intro.md — Einführung in TSClang

**Ziel:** Erkläre, was es ist, warum es existiert, und liefere ein erstes funktionierendes Beispiel.

- Was ist TSClang (TS-Syntax → C, Rust-Sicherheit, npm-Ökosystem)
- Design-Philosophie (3 Prioritäten: Sicherheit, Performance, TS-Syntax)
- Anwendungsfälle (Desktop, Embedded, Server, Retro-Plattformen)
- Schnellstart: Installation, `hello world`, Build und Ausführen
- Voraussetzungen (Node.js, CMake, gcc/clang)
- CLI-Übersicht: `tsclang build`, `tsclang lint`, `tsclang lsp`

**Quelle:** `spec/01-intro.md`

---

### 02-syntax.md — Syntax

**Ziel:** Vollständige Beschreibung der Sprachsyntax.

- Formatierung (ASI, K&R, Einrückung, Anführungszeichen, abschließendes Komma)
- Variablen: `let` / `const` — Unterschied im Kontext des Eigentums
- Funktionen: `function`, Arrow, anonyme, IIFE
- Parameter: Standard, Rest
- Funktionsüberladung (nach Typ und Anzahl, Auflösungspriorität)
- Operatoren: arithmetisch, Zuweisung, Vergleich, logisch, bitweise
- Truthy / Falsy (Tabelle nach Typ)
- Schleifen: `for`, `for-of`, `while`, `do-while`, `break`/`continue`, mit Label
- `switch` / `match` — Vergleich, Exhaustivität
- Spread-Operator (Arrays, Objekte, Eigentumsregeln)
- Indizierung und Slices (Arrays und Zeichenketten, negative Indizes)

**Quelle:** `spec/02-syntax.md`

---

### 03-types.md — Typsystem

**Ziel:** Beschreibung der Typisierung, aller Typen und Konvertierungen.

- Strukturelle vs. nominale Typisierung (`type`, `interface`, `class`)
- Typinferenz
- Numerische Typen (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`)
  - Literale (Hex, Binär, Oktal, `_`-Trennzeichen)
  - Auto-Cast (3 Mechanismen: Widening, Compile-Zeit, `as`)
  - `usize` — Plattformtyp
  - `number` = `f64` (überschreibbar)
  - Performance-Warnungen auf AVR
- `string` — UTF-8-Bytes, C-Layout, Indizierung, Iteration, eingebaute Methoden
- Spezielle Typen: `void`, `never`, `any`
- Null: `T | null`, optional `?`, Optional Chaining `?.`, Nullish Coalescing `??`
  - C-Darstellung von `T | null` (Struktur mit Flag)
  - Embedded-Muster: Sentinel-Wert, separates Flag
- Typkonvertierung: Zahl ↔ Zeichenkette, JS-kompatible Funktionen (`parseInt`, `parseFloat`)
- `Date` — Erstellung, Methoden, Formatierung
- Arrays: `T[]` (dynamisch), `T[N]` (fest), Methoden, funktionale Methoden
- `Slice<T>` / `MutSlice<T>` — Zero-Copy-Ansicht
- `Map<K,V>`, `Set<T>` — API, Eigentum, Embedded-Muster
- `Object` — statische Methoden
- Tupel: fest, mit Label, schreibgeschützt, optional, Rest, Spread
- `Clone` — Schnittstelle, `clone()`, `structuredClone()`
- Typaliasse (`type`)
- Zeichenketten-Literalunion
- Utility-Typen: `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`
- `Buffer`, `DataView`

**Quelle:** `spec/03-types.md`

---

### 04-classes.md — Klassen, Schnittstellen, Aufzählungen, Generics

**Ziel:** Das Objektsystem der Sprache.

- Generics: Syntax, Bounds (`implements`/`extends`), Monomorphisierung, Eigentum mit Generics
- Erweiterungsmethoden: Deklaration, Import, Konflikte
- Aufzählung: numerisch, Zeichenkette, `const enum`, Hilfsfunktionen, in switch/match
- Schnittstellen: Daten vs. Vertrag mit Methoden, Fat Pointer, Vtable
- `instanceof` — Typverengung via Vtable
- Klassen:
  - Keine Vererbung (außer `extends Error`), Komposition
  - Modifikatoren: `public`, `private`, `static`, `mut`, `move`
  - Semantik von `this` und Feldzugriff
  - `readonly`-Felder
  - Konstruktor: Auto-Generierung, explizit, `private`
  - Value-Object-Muster
  - Builder-Muster mit `move`
- Ausrichtung: `@packed`, `@align(N)`, Padding-Diagnose
- Dekoratoren: Übersicht, Verweis auf den vollständigen Abschnitt

**Quelle:** `spec/04-classes.md`, `spec/13-decorators.md`

---

### 05-memory.md — Speichermodell und Eigentum

**Ziel:** Das Schlüsselfeature der Sprache — sichere Speicherverwaltung.

- Eigentumstypen: `T` (Eigentümer), `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>`, `Slice<T>`
- Grundregeln: Primitive kopieren, komplexe Typen — Eigentum
- Eigentümer (T): Move bei Zuweisung und Übergabe
- `Ref<T>`: unveränderliches Borgen, Regeln, in Feldern verboten, Workaround-Muster
- `Mut<T>`: veränderliches Borgen, eines zur Zeit
- `Shared<T>`: ARC, `Weak<T>` zum Aufbrechen von Zyklen
- Regeln des Borgen-Prüfers (4 Regeln)
- Argumentübergabematrix (let/const/Ref/Mut/Shared → Ref/Mut/T/Shared)
- Interior Mutability — warum sie nicht vorhanden ist
- `@static let` — globaler veränderlicher Zustand
- Geltungsbereichs-Einschränkung (ohne Lebenszeit-Annotationen): 4 Regeln
- Automatisches Drop und `goto cleanup`
- `Iterable<T>` — benutzerdefinierte iterierbare Typen
- Feldzugriff und Destrukturierung (Borgen vs. Move)
- Slices (Borgen vs. Eigentum)
- Move aus Array, Mutation während des Borgens
- Rückgabe eines Borgens aus einer Methode
- Closures: Einfangregeln, explizite Einfangliste, Mut-Closure via await

**Quelle:** `spec/05-memory.md`

---

### 06-errors.md — Fehlerbehandlung

**Ziel:** Fehlersystem — Result-basiert ohne setjmp/longjmp.

- Prinzip: `throw`/`try`/`catch` in TS → Result-Strukturen in C
- Deklarieren von `throws` in der Signatur
- `Error` — Basisklasse, `error.stack`
- `throw`, `try`/`catch`/`finally`
- Union-Catch, exhaustive Behandlung
- `?`-Operator (Propagierung)
- `!`-Operator (Unwrap/Panik)
- C-Ausgabe: Result-Strukturen, `if/else` auf `ok` und `_kind`
- Eigentum während Fehlern (Cleanup via `goto`)
- Einschränkungen

**Quelle:** `spec/06-errors.md`

---

### 07-concurrency.md — Nebenläufigkeit

**Ziel:** Drei Ebenen der Nebenläufigkeit und deren Verwendung.

- Übersicht über drei Mechanismen (asynchron/await, Threads, ISR)

- **Asynchron/Await:**
  - Architektur der asynchronen Laufzeit (Zustandsmaschinen)
  - Größe der Zustandsmaschine, Stapelsicherheit auf Embedded
  - `Promise<T>`: Erstellung, `.then`/`.catch`/`.finally`
  - `Promise.all`, `Promise.any`, `Promise.race`, `Promise.allSettled`
  - Regeln von `await`, `async main`
  - Rekursive asynchrone Funktionen
  - `@embedded.stack` — expliziter Stapel
  - Task-Abbruch: `AbortController`, `AbortSignal`
  - `AsyncMutex`

- **Threads (std/threads):**
  - Isolates ohne gemeinsamen Speicher
  - `Atomic<T>`, `AtomicArray<T>`
  - `channel<T>`: bounded MPMC, ISR-sichere Operationen
  - `select`: Warten auf mehrere Kanäle
  - `Readonly<T>`: Zero-Copy-Sharing
  - `Thread<T>`: typisiertes Ergebnis
  - Thread.spawn-Regeln, Send-Prüfung

- **@embedded.isr:**
  - `Volatile<T>` — MMIO-Register
  - ISR: Signatur, Regeln, Muster
  - `std/sync` — kritische Abschnitte
  - `EmbeddedSignal` — ISR → asynchrone Brücke

- Embedded-Annotationen: `@embedded.inline`, `@embedded.noHeap`
- `@signal` — POSIX-Signale (Desktop)
- Asynchrone Generatoren: `async function*`, `for await`, `close()`
- Kooperatives Multitasking via Generatoren

**Quelle:** `spec/07-concurrency.md`

---

### 08-modules.md — Module und C-Interop

**Ziel:** Wie das Modulsystem funktioniert und C-Interop.

- Export: benannt, `export default` ist verboten
- Import: benannt, Namespace, `import type`
- Modulinitialisierungsreihenfolge, zyklische Imports
- Modul-Level-Variablen
- Pfadaliase (`#`, `~`)
- Einstiegspunkt: `"main"`, `"builds"`, C-Main-Generierung
- Bibliotheken: `"type": "library"`
- `.d.tsc`-Dateien: 5 Arten von Deklarationen
  - C-Struktur, opaker Typ, C-Funktionen, Konstanten, MMIO-Register
  - Link-Konfiguration (system, bundled, fetch)
- `native` — Inline-C (Syntax, Interpolation, Einschränkungen)
- Callbacks: `FnPtr<T>`, `TSC_CLOSURE_*`-Makros
- `unsafe {}` — Deaktivieren von Prüfungen
- `@platform` — bedingte Kompilierung
- Deklarationsvereinigung (Declaration Merging)
- Variadische C-Funktionen: `Scalar`-Typ

**Quelle:** `spec/08-modules.md`

---

### 09-build.md — Build-System

**Ziel:** Wie ein Projekt, ein Build und Pakete strukturiert sind.

- Projekttypen: ausführbar, Bibliothek, C-Wrapper, Plattform-Paket
- `tsc.package.json`: alle Felder
- C-Wrapper: Struktur, Veröffentlichung, Link-Konfiguration (system/bundled/fetch)
- Plattform-Paket: `declare platform {}`, Plattform-Felder
- CLI: `tsclang build`, Flags (`--outDir`, `--target`, `--profile`, `--optimize`)
- Paketmanager: `tsclang install`, `tsclang publish`, `tsclang search`
- Monorepo: `"workspaces"`
- Embedded-Builds: AVR, ARM, Retro-Plattformen
- CMakeLists.txt: Generierung, Anpassung
- Profile: Debug/Release, Optimierung

**Quelle:** `spec/09-build.md`

---

### 10-stdlib.md — Standardbibliothek

**Ziel:** Referenz für alle stdlib-Module.

- Prinzipien: einheitliche API via `std/`, Lazy Loading, Tree-Shaking
- Globale Objekte: `console`, `Math`, `process`, Timer, `performance`
- `Error` — Basisklasse
- `Map<K,V>`, `Set<T>` — API, Eigentum
- `Buffer`, `DataView`
- `std/io` — Reader/Writer
- `std/fs` — Dateioperationen
- `std/net` — fetch, HTTP-Server, TCP/UDP
- `std/ws` — WebSocket
- `std/math` — Konstanten und Methoden (vollständige Tabelle)
- `std/string` — Unicode, Kodierung, Formatierung
- `std/json` — Parsing und Serialisierung
- `std/url` — URL und URLSearchParams
- `std/blob` — Blob und File
- `std/formdata` — multipart/form-data
- `std/regex` — NFA-Regex, Syntax, API
- `std/random` — Random, HardwareRandom
- `std/temporal` — PlainDateTime, Instant, Duration
- `std/reactive` — ReactiveVar, computed, effect
- `std/hal` — GPIO, UART, SPI, I2C
- `std/embedded` — Volatile, Zeiger, HashMap, StaticMap
- Plattformkompatibilität (Tabelle)

**Quelle:** `spec/10-stdlib.md`, `spec/19-stdlib-*.md`

---

### 11-compiler.md — Compiler-Architektur

**Ziel:** Für Mitwirkende und diejenigen, die die Interna verstehen möchten.

- Kompilierungsphasen (Parse → AST → Decorator → Typecheck → IR → Codegen)
- IR: Basisblöcke, Instruktionen, Phi-Knoten
- Name Mangling (formales Schema)
- Debug-Info: `#line`-Direktiven, DAP-Server
- Consumer-seitige Monomorphisierung
- Inkrementelle Kompilierung (Roadmap)
- Optimierungsstufen (O0–O3, Os)
- Fehlermeldungen: Format, Kategorien, Fehlercodes

**Quelle:** `spec/11-compiler.md`

---

### 12-migration.md — Migrationsleitfaden: TypeScript → TSClang

**Ziel:** Hilf einem TS-Entwickler beim Migrieren von Code.

- Automatische Korrekturen (`tsclang migrate`)
- Was sofort funktioniert (Beispiele)
- Was manuelle Korrekturen erfordert (spezifische Muster)
- Inkompatible Muster (Tabelle der Alternativen)
- Was TSClang hinzufügt (was nicht in TS ist)

**Quelle:** `spec/12-migration.md`

---

## Zusammenfassende Tabelle der Abschnitte

| # | Datei | Inhalt | Quelle | Größe |
|---|-------|--------|--------|-------|
| 01 | intro | Was ist TSClang, Schnellstart, CLI | `spec/01-intro.md` | ~30 KB |
| 02 | syntax | Syntax, Operatoren, Schleifen, match/switch | `spec/02-syntax.md` | ~50 KB |
| 03 | types | Typen, Zahlen, Zeichenketten, Arrays, Map/Set, Tupel, Utility-Typen | `spec/03-types.md` | ~80 KB |
| 04 | classes | Klassen, Schnittstellen, Aufzählungen, Generics, Erweiterungsmethoden | `spec/04-classes.md`, `spec/13-decorators.md` | ~40 KB |
| 05 | memory | Eigentum, Borgen-Prüfer, Ref/Mut/Shared, Closures | `spec/05-memory.md` | ~50 KB |
| 06 | errors | throw/try/catch, Result, `?`/`!`-Operatoren | `spec/06-errors.md` | ~15 KB |
| 07 | concurrency | asynchron/await, Threads, ISR, Atomics, Kanäle, Generatoren | `spec/07-concurrency.md` | ~70 KB |
| 08 | modules | Import/Export, .d.tsc, nativ, unsicher, @platform | `spec/08-modules.md` | ~50 KB |
| 09 | build | Build, Pakete, C-Wrapper, Plattformen | `spec/09-build.md` | ~50 KB |
| 10 | stdlib | Referenz für alle std-Module | `spec/10-stdlib.md`, `spec/19-stdlib-*.md` | ~60 KB |
| 11 | compiler | Compiler-Architektur (für Mitwirkende) | `spec/11-compiler.md` | ~30 KB |
| 12 | migration | Migrationsleitfaden TypeScript → TSClang | `spec/12-migration.md` | ~15 KB |
| | | | **Gesamt** | **~540 KB** |

## Empfohlene Schreibreihenfolge

Empfohlene Reihenfolge (vom Wichtigsten und Häufigsten bis zum Fortgeschrittenen):

1. `01-intro.md` — Einstiegspunkt für alle
2. `02-syntax.md` — Grundkonstrukte
3. `05-memory.md` — Schlüsselfeature, für alle notwendig
4. `03-types.md` — Typsystem
5. `04-classes.md` — Objektsystem
6. `06-errors.md` — Fehlerbehandlung
7. `08-modules.md` — Module und C-Interop
8. `07-concurrency.md` — Nebenläufigkeit
9. `10-stdlib.md` — API-Referenz
10. `09-build.md` — Build-System
11. `12-migration.md` — Migration von TS
12. `11-compiler.md` — Interna (für Mitwirkende)

## Größenschätzung

| Dokument | Geschätzte Größe |
|----------|------------------|
| 01-intro | ~30 KB |
| 02-syntax | ~50 KB |
| 03-types | ~80 KB |
| 04-classes | ~40 KB |
| 05-memory | ~50 KB |
| 06-errors | ~15 KB |
| 07-concurrency | ~70 KB |
| 08-modules | ~50 KB |
| 09-build | ~50 KB |
| 10-stdlib | ~60 KB |
| 11-compiler | ~30 KB |
| 12-migration | ~15 KB |
| **Gesamt** | **~540 KB** |

## Format

- Markdown (.md)
- Jede Datei ist ein in sich geschlossener Abschnitt
- H1-Überschriften für Abschnittstitel, H2/H3 für Unterabschnitte
- Tabellen für Referenzinformationen
- Codeblöcke mit Sprachbezeichner (```typescript, ```c, ```bash)
- `> **Hinweis:**` für wichtige Anmerkungen
- `> **Warnung:**` für kritische Einschränkungen
