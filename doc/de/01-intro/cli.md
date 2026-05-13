# CLI — Befehlsübersicht

[← Hoch](./index.md) | [Zurück ←](./quick-start.md)

---

## Befehlsliste

| Befehl | Alias | Beschreibung |
|--------|-------|--------------|
| `tsclang init` | — | Neues Projekt erstellen |
| `tsclang build` | `b` | Projekt builden |
| `tsclang run` | `r` | Builden und ausführen |
| `tsclang lint` | `l` | Formatierung prüfen |
| `tsclang migrate` | — | TypeScript → TSClang-Migration *(Roadmap)* |
| `tsclang lsp` | — | Language Server Protocol für IDE *(Roadmap)* |

Aliase:

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

Erstellt ein Projekt aus einer Vorlage.

```bash
tsclang init myapp                    # executable (default)
tsclang init mylib --library          # TSClang library
tsclang init sqlite3 --declaration    # C-wrapper (wrapper over C library)
tsclang init                          # in current directory
```

Kurzflags: `-l` (Bibliothek), `-d` (Deklaration).

## tsclang build

Kompiliert `.tsc` → `.c` → Binärdatei (standardmäßig).

```bash
tsclang build                  # build default build
tsclang build <name>           # build specific build from configuration
tsclang build hello.tsc        # single file
tsclang build --emit c         # C generation only
tsclang build --emit binary    # C + compile to binary (default)
tsclang build --emit hex       # C + avr-gcc → .hex (for AVR)
tsclang build --outDir ./dist  # override outDir
tsclang build --target desktop # explicitly specify target
tsclang build --clean          # full rebuild (no cache)
```

## tsclang run

Buildet und führt die Binärdatei aus. Äquivalent zu `tsclang build` + Ausführen.

```bash
tsclang run
tsclang run -- args...         # pass arguments to program
```

Nur für `emit: "binary"`.

## tsclang lint

Prüft den Code-Stil. Für CI — `tsclang lint` (ohne `--fix`) gibt Exit-Code 1 bei Verstößen zurück.

```bash
tsclang lint          # check without changes
tsclang lint --fix    # format code in place (like prettier / gofmt)
```

Unterschied zu `tsclang build`:

| Befehl | Was geprüft wird |
|--------|------------------|
| `tsclang build` | Semantische Fehler, Formatierung ignoriert |
| `tsclang lint` | Semantik + Stil-Warnungen, Exit 1 bei Verstößen |
| `tsclang lint --fix` | Formatiert Code automatisch |

## tsclang migrate *(Roadmap)*

Migration von TypeScript-Code nach TSClang.

```bash
tsclang migrate ./src            # show what will change (dry-run)
tsclang migrate ./src --fix      # apply changes
tsclang migrate ./src --check    # CI mode: exit 1 if incompatibilities exist
```

## tsclang lsp *(Roadmap)*

Language Server Protocol für IDE (VS Code, Neovim usw.).

```bash
tsclang lsp               # stdio transport
tsclang lsp --port 7777   # TCP transport
```

## Siehe auch

- [Schnellstart](./quick-start.md) — Installation und erstes Projekt
- [Build-System](../09-build/index.md) — Konfiguration, Profile, Plattformen
- [Migrationsleitfaden](../12-migration/index.md) — Portieren von TS-Code
