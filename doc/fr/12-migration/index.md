# Migration : TypeScript → TSClang

[← Haut](../index.md) | [Suivant →](./automatic.md)

---

Guide pour les développeurs migrant de TypeScript vers TSClang. Décrit les conversions automatiques et manuelles, les patterns incompatibles et les nouvelles capacités.

## Vue d'ensemble du processus

TSClang vise une compatibilité maximale avec la syntaxe TypeScript. La plupart du code TypeScript se porte sans modification ou avec des éditions minimales. Le processus de migration se divise en trois étapes :

1. **Corrections automatiques** — `tsclang migrate` applique les transformations mécaniques
2. **Corrections manuelles** — patterns qui ne peuvent pas être automatisés en toute sécurité
3. **Patterns incompatibles** — constructions sans analogie directe, nécessitant une refonte

## Vérification rapide

```bash
tsclang migrate ./src            # dry-run : afficher ce qui va changer
tsclang migrate ./src --fix      # appliquer les corrections automatiques
tsclang migrate ./src --check    # CI : exit 1 si des incompatibilités existent
```

## Ce qui migre inchangé

Les interfaces, les fonctions typées, les fonctions fléchées, les classes (sans `extends`), les génériques, `try/catch`, les template strings, la déstructuration — tout cela fonctionne comme en TypeScript. Les détails — dans [Migration manuelle](./manual.md).

## Sous-pages

| Page | Description |
|------|-------------|
| [Migration automatique](./automatic.md) | `tsclang migrate` : dry-run, --fix, --check, liste des auto-transformations |
| [Migration manuelle](./manual.md) | Ce qui fonctionne tel quel et ce qui nécessite des corrections manuelles |
| [Patterns incompatibles](./incompatible.md) | Constructions sans analogie et alternatives |
| [Nouvelles fonctionnalités](./new-features.md) | Propriété, Ref/Mut/Shared, match, throws et plus |

## Erreurs

| Erreur | Cause |
|-------|-------|
| `undefined is not defined` | Utilisation de `undefined` — remplacer par `null` |
| `throw requires Error instance` | Lancer une chaîne ou un nombre — encapsuler dans `new Error()` |
| `export default is not supported` | Remplacer par un export nommé |
| `extends is not supported` | Héritage de classes — remplacer par la composition |

## Voir aussi

- [Introduction : Qu'est-ce que TSClang](../01-intro/what-is-tsclang.md) — aperçu du langage et philosophie
- [Build : CLI](../09-build/cli.md) — commandes `tsclang build`, `tsclang migrate`
- [Modèle de mémoire](../05-memory/index.md) — propriété, borrow checker, Ref/Mut/Shared
