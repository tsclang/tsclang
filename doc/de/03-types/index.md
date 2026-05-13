# Typsystem

[Zurück](../index.md) | [Weiter →](./numbers.md)

---

TSClang's Typsystem ist statisch, mit Typinferenz und drei Sicherheitsstufen: Compile-Zeit-Prüfungen, Eigentum-/Borgen-Prüfer und optionales ARC.

## Zwei Ebenen der Typisierung

TSClang trennt Typen in **strukturelle** und **nominale**:

| Konstrukt | Typisierung | Objektliterale | C-Ausgabe |
|-----------|-------------|----------------|-----------|
| `type Foo = { ... }` | Strukturell | ✅ | `typedef struct`, Methoden verboten |
| `interface Foo { ... }` | Strukturell | ✅ (wenn keine Methoden) | `typedef struct` oder Fat-Pointer + Vtable |
| `class Foo { ... }` | **Nominal** | ❌ | Struktur + Methoden |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // ok — strukturelle Kompatibilität
const v: Vector = p                     // ok — gleiche Felder

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // Fehler — Klasse ist nominal
```

Wesentlicher Unterschied `type` vs `interface`:
- `type Point = { x: f64; y: f64 }` — **garantiert** Datenstruktur ohne Vtable. Methoden sind durch Compilerfehler verboten. Verwendung für Embedded-MMIO, binäre Strukturen, ABI-kritischen Code.
- `interface Point { x: f64; y: f64 }` — Datenstruktur vorerst, kann aber in Zukunft mit Methoden erweitert werden (dann wechselt die ABI zu Vtable).

## Typinferenz

Der Typ wird inferiert, wenn er nicht explizit angegeben ist:

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — anonyme Struktur
const s = "hello"            // → string
const n = 42                 // → number (= f64 auf Desktop)
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[] (= f64[])
```

Explizite Annotation überschreibt: `const i: i32 = 1` → `i32`.

## Numerische Typ-Autocast

Drei Mechanismen, sequentiell angewendet. Der erste anwendbare gewinnt.

### Mechanismus 1 — Typ-Level-Widening (let und const)

Funktioniert nur auf Typen, betrachtet nicht die Werte. Bedingungslos sicher.

| Von | Zu | Kommentar |
|-----|----|-----------|
| `i8`/`i16`/`i32` | `i64` | gleiches Vorzeichen, kein Verlust |
| `u8`/`u16`/`u32` | `u64` | gleiches Vorzeichen, kein Verlust |
| `u8` | `i16` | alle 256 Werte passen |
| `u16` | `i32` | alle 65.536 passen |
| `u32` | `i64` | alle 4,3 Mrd. passen |
| `i32`, `u32` | `f64` | kein Verlust (53-Bit-Mantisse) |
| `f32` | `f64` | kein Verlust |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 passt immer in i64
```

### Mechanismus 2 — Compile-Zeit-Werteanalyse (nur const)

Wenn beide Operanden `const` mit bekannten Literalwerten sind und Mechanismus 1 nicht anwendbar ist. Schritt-für-Schritt-Algorithmus — siehe [Numerische Typen → Autocast](./numbers.md).

### Mechanismus 3 — explizites `as` (für let)

Wenn Mechanismus 1 nicht auf `let`-Variablen anwendbar ist — explizite Typumwandlung ist erforderlich:

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // Fehler — kein Typ-Level-Widening
let c: f64 = (a + (b as i64)) as f64  // ok
```

Details für jeden Mechanismus — auf der Seite [Numerische Typen](./numbers.md).

## Unterseiten

| Seite | Beschreibung |
|-------|--------------|
| [Numerische Typen](./numbers.md) | i8..i64, u8..u64, f32, f64, usize, number, Autocast, `as` |
| [Strings](./strings.md) | UTF-8-Strings, Literale, Methoden, std/string |
| [Spezielle Typen](./special-types.md) | any, never, void, unknown |
| [Null](./null.md) | Nullable Typen, optionale Verkettung, `??` |
| [Arrays](./arrays.md) | Dynamisch, fest, Slice<T> |
| [Map und Set](./map-set.md) | Hash-Tabellen und Mengen |
| [Tuples](./tuples.md) | Tupel, benannt, readonly, optional, Rest |
| [Clone](./clone.md) | Explizites Klonen von Eigentumswerten |
| [Typ-Aliasse](./type-aliases.md) | `type`, opaque Aliasse, String-Literal-Union |
| [Hilfstypen](./utility-types.md) | Partial, Required, Readonly, Pick, Omit, Record, etc. |
| [Date](./date.md) | Legacy-JS-kompatibler Datum-/Zeittyp |

## Fehler

| Fehler | Ursache |
|--------|---------|
| `expected f64, got i32` | Inkompatible numerische Typen ohne Autocast |
| `empty object literal is forbidden` | Leeres `{}` — verwende `Map<K,V>` oder deklariere Typ |
| `cannot use "void" as variable type` | `void` nur für Funktionsrückgabetyp |
| `non-nullable runtime union: string \| i32` | Nicht-nullable Union verboten, verwende Schnittstelle oder diskriminierte Union |

## Siehe auch

- [Variablen: let / const](../02-syntax/variables/index.md) — Auswirkung von `let`/`const` auf Typen und Autocast
- [Speichermodell](../05-memory/index.md) — Eigentum, `Ref<T>`, `Mut<T>`
- [Klassen und Schnittstellen](../04-classes/index.md) — Nominale Typisierung, Generics
- [Fehlerbehandlung](../06-errors/index.md) — `throws`, `T | null` vs `T throws E`
