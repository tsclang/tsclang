# Fehlerbehandlung

[Zurück](../index.md) | [Weiter →](./throw-try.md)

---

TSClang verwendet `throw`/`try`/`catch`/`finally`-Syntax wie TypeScript, kompiliert Fehler aber in **Result-Strukturen in C** — ohne `setjmp`/`longjmp`. Dies bietet:

- **Zero-cost**: kein Register-Speichern in jedem `try`-Block
- **Sichere C-Interop**: kein `longjmp` durch Third-Party-C-Code
- **Korrektes Eigentum**: gewöhnlicher Kontrollfluss, der Compiler kennt alle Eigentumsvariablen

## Prinzip

Jede Funktion, die fehlschlagen kann, deklariert `throws` in ihrer Signatur. In der C-Ausgabe ist der Rückgabetyp in eine Result-Struktur mit einem `ok`-Feld und einer Union für den Wert oder Fehler eingewickelt. `try`/`catch`-Handler kompilieren zu gewöhnlichem `if/else` auf dem `ok`-Feld und `_kind`.

## Schlüsselkonzepte

### throws-Deklaration

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Ohne `throws` — eine Funktion kann kein `throw` enthalten (Compilerfehler).

### Error — Basisklasse

Alle Fehler erben von `Error`:

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // nur Desktop — "__FILE__:__LINE__" Throw-Punkte
}
```

### ?- und !-Operatoren

| Operator | Semantik | Erfordert `throws`? |
|----------|----------|---------------------|
| `expr?`  | Propagieren — gibt den Fehler aus der aktuellen Funktion zurück | Ja |
| `expr!`  | Entpacken — Panic (`abort()`) bei Fehler | Nein |

### Result-Struktur in C

```c
typedef struct {
    bool ok;
    union {
        Response value;
        struct {
            _fetch_err_kind _kind;
            union {
                IOError io;
                NetworkError net;
            } _err;
        };
    };
} _Result_Response_IOError_NetworkError;
```

### Eigentum bei Fehlern

Der Compiler verfolgt alle Eigentumsvariablen in einem `try`-Block. Bei Fehler werden alle bereits initialisierten Eigentumsvariablen durch gewöhnlichen Kontrollfluss (`goto cleanup`) freigegeben.

## Unterseiten

| Seite | Beschreibung |
|-------|--------------|
| [throw / try / catch / finally](./throw-try.md) | Fehlerbehandlungssyntax, Catch nach Typ, finally |
| [Result-Strukturen](./result.md) | Result<T, E>, diskriminierte Union, C-Repräsentation |
| [?- und !-Operatoren](./operators.md) | Propagieren, Entpacken/Panic, C-Ausgabe |

## Fehler

| Fehler | Ursache |
|--------|---------|
| `throw in non-throws function` | `throw` in einer Funktion ohne `throws` |
| `? operator in non-throws function` | `?`-Operator ohne `throws` in der aktuellen Funktion |
| `extern "C" cannot throw` | `throws` in einer `extern "C"`-Funktion |
| `throw/return in finally` | `throw` oder `return` innerhalb eines `finally`-Blocks |
| `error.stack on embedded` | Zugriff auf `stack` auf einer Embedded-Plattform |

## Einschränkungen

- `throw` ist in Funktionen ohne `throws` verboten
- `?` ist in einer Funktion ohne `throws` verboten
- Ausnahmen können nicht über C-Interop-Grenzen geworfen werden — `extern "C"` kann kein `throws` enthalten
- `finally` kann kein `throw` oder `return` enthalten
- `error.stack` ist auf Embedded-Plattformen nicht verfügbar

## Siehe auch

- [Speichermodell: Auto Drop](../05-memory/auto-drop.md) — `goto cleanup` mit mehreren Exit-Punkten
- [Speichermodell: Eigentümer](../05-memory/owner.md) — Move und Eigentum bei Fehlern
- [Klassen](../04-classes/index.md) — Error-Vererbung und benutzerdefinierte Fehlertypen
