# Einführung in TSClang

[← Hoch](../index.md) | [Weiter →](./what-is-tsclang.md)

---

TSClang ist eine Sprache mit TypeScript-Syntax, die nach C kompiliert.

- **TypeScript als Syntax** — vertraute `let`/`const`, Klassen, Arrow-Funktionen, `async`/`await`
- **C als Kompilierungsziel** — lesbarer C-Code + `CMakeLists.txt` wird generiert
- **Rust als Sicherheitsmodell** — Eigentum, Borgen-Prüfer, `Ref<T>`, `Mut<T>`
- **npm als Ökosystem-Erlebnis** — `tsc.package.json`, `tsclang install`, Paketregistry

## Abschnitte

- [Was ist TSClang](./what-is-tsclang.md) — warum, für wen, Anwendungsfälle
- [Design-Philosophie](./design-philosophy.md) — drei Prioritäten: Sicherheit, Performance, TS-Syntax
- [Schnellstart](./quick-start.md) — Installation, Hello World, Build und Ausführen
- [CLI](./cli.md) — Befehlsübersicht: `build`, `init`, `lint`, `migrate`, `lsp`

## Siehe auch

- [Syntax](../02-syntax/index.md) — Sprachkonstrukte
- [Speichermodell](../05-memory/index.md) — Eigentum und Borgen-Prüfer
