# Introduction à TSClang

[← Haut](../index.md) | [Suivant →](./what-is-tsclang.md)

---

TSClang est un langage avec une syntaxe TypeScript qui se compile en C.

- **TypeScript comme syntaxe** — `let`/`const` familiers, classes, fonctions fléchées, `async`/`await`
- **C comme cible de compilation** — du code C lisible + `CMakeLists.txt` est généré
- **Rust comme modèle de sécurité** — propriété, vérificateur d'emprunt, `Ref<T>`, `Mut<T>`
- **npm comme expérience d'écosystème** — `tsc.package.json`, `tsclang install`, registre de packages

## Sections

- [Qu'est-ce que TSClang](./what-is-tsclang.md) — pourquoi, pour qui, cas d'utilisation
- [Philosophie de conception](./design-philosophy.md) — trois priorités : sécurité, performance, syntaxe TS
- [Démarrage rapide](./quick-start.md) — installation, hello world, build et exécution
- [CLI](./cli.md) — aperçu des commandes : `build`, `init`, `lint`, `migrate`, `lsp`

## Voir aussi

- [Syntaxe](../02-syntax/index.md) — constructions du langage
- [Modèle de mémoire](../05-memory/index.md) — propriété et vérificateur d'emprunt
