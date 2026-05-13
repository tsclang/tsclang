# Speichermodell

[Zurück](../index.md) | [Weiter →](./ownership-types.md)

---

TSClang verwendet ein **hybrides Speicherverwaltungsmodell**: Statischer Eigentum-/Borgen-Prüfer + optionales ARC. Kein GC, kein manuelles `free`.

## Prinzip

Der Compiler verfolgt statisch den Eigentümer jedes Werts. Speicherfreigabe ist deterministisch, am Ende des Gültigkeitsbereichs des Eigentümers. Für Fälle, in denen die statische Analyse nicht ausreicht (Graphen, Zyklen) — `Shared<T>` mit atomarem Refcount (ARC).

## Eigentumstypen

| Typ | Semantik | Beschreibung |
|-----|----------|--------------|
| `T` | **Eigentümer** | Volles Eigentum, Move bei Übergabe |
| `Ref<T>` | **Unveränderliche Borgung** | Nur lesen, keine Modifikation oder Löschung |
| `Mut<T>` | **Veränderliche Borgung** | Lesen und Schreiben, nur ein `Mut` zur gleichen Zeit |
| `Shared<T>` | **ARC** | Starke Referenz, erhöht Refcount, nur Desktop |
| `Weak<T>` | **Schwache Referenz** | Erhöht Refcount nicht, bricht Zyklen |
| `Slice<T>` | **Geborgte Array-Ansicht** | Zero-Copy-Teilbereich, Zeiger + Länge |

## Grundregeln

- **Primitive** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — immer **kopiert**, Borgen-Prüfer gilt nicht
- **Komplexe Typen** (Arrays, Objekte, Strings, Klassen) — verwaltet vom Eigentumssystem
- `string` — Heap-alloziierter Eigentümer, übergeben als `Ref<string>`, kopiert via `clone()`

## Borgen-Prüfer

**Aliasing XOR Mutability**-Regel: Zwei `Mut` gleichzeitig sind nicht erlaubt, `Mut` + `Ref` ist nicht erlaubt, aber mehrere `Ref` gleichzeitig sind erlaubt.

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // ok — mehrere Ref erlaubt
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // Fehler: aktiver Mut existiert bereits
```

## Automatisches Drop

Der Compiler fügt `free()` am Ende des Gültigkeitsbereichs des Eigentümers ein. Bei mehreren `return` und `throw` — einzelner Cleanup-Punkt via `goto cleanup`:

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... Arbeit ...
cleanup:
    if (u) User_free(u);
}
```

## Unterseiten

| Seite | Beschreibung |
|-------|--------------|
| [Eigentumstypen](./ownership-types.md) | Übersicht aller Eigentumstypen und ihre C-Repräsentationen |
| [Eigentümer (T)](./owner.md) | Volles Eigentum, Move bei Zuweisung und Übergabe |
| [Ref<T>](./ref.md) | Unveränderliche Borgung, View-Muster |
| [Mut<T>](./mut.md) | Veränderliche Borgung, Exklusivitätsregeln |
| [Shared<T> und Weak<T>](./shared.md) | ARC und schwache Referenzen für Graphen und Zyklen |
| [Slice<T>](./slice.md) | Zero-Copy-Ansicht auf Teil eines Arrays oder Strings |
| [Borgen-Prüfer](./borrow-checker.md) | Aliasing-Regeln, Lebenszeit, Gültigkeitsbereichsbedingungen |
| [Drop und Cleanup](./drop.md) | Automatische Deallokation, `goto cleanup` |
| [Destrukturierung](./destructuring.md) | Borgen vs Move beim Destrukturieren von Feldern |
| [Closures](./closures.md) | Capture-Regeln: copy, Ref, Mut, Move |
| [Iteratoren](./iterators.md) | `Iterable<T>`, Pull-basierte Stapel-Iteratoren |

## C-Ausgabe

```typescript
let user = new User();
user.name = "Alice";
// Ende des Gültigkeitsbereichs — User_free wird automatisch aufgerufen
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... Verwendung ...
User_free(&user);   // vom Compiler eingefügt
```

## Fehler

| Fehler | Ursache |
|--------|---------|
| `use of moved value: "x"` | Zugriff auf Variable nach Move |
| `already borrowed as Mut` | Zweites `Mut` oder `Ref`, während `Mut` aktiv ist |
| `already borrowed as Ref` | `Mut`, während `Ref` aktiv ist |
| `Ref<T> not allowed in class field` | Versuch, Borgung in Klassenfeld zu speichern |
| `cannot move out of array by index` | `arr[i]` für Eigentumstyp ohne `.remove()` |

## Siehe auch

- [Variablen: let / const](../02-syntax/variables/index.md) — Auswirkung von `let`/`const` auf `Mut<T>` / `Ref<T>`
- [Funktionen](../02-syntax/functions/declaration.md) — Argumentübergaberegeln
- [Klassen](../04-classes/index.md) — `mut`-Methoden und `readonly`-Felder
- [Fehler](../06-errors/index.md) — `goto cleanup` bei `throw` / `?`
