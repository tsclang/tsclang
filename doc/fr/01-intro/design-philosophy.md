# Philosophie de conception

[← Haut](./index.md) | [Suivant →](./quick-start.md) | [Précédent ←](./what-is-tsclang.md)

---

Dans chaque décision de conception, TSClang suit une stricte hiérarchie de priorités :

## Trois priorités

1. **Sécurité mémoire** — propriété, vérificateur d'emprunt, pas de GC
2. **Performance et typage** — abstractions sans coût, types stricts
3. **Syntaxe TS** — préserver autant que possible, mais pas au détriment du n°1 et du n°2

L'objectif n'est pas "le code TS existant compile sans changements", mais "le développeur TS reconnaît la syntaxe et se sent chez lui".

## La syntaxe TS est prioritaire

Emprunter la syntaxe de Rust, C, Go — uniquement si TS n'a pas de construction adaptée.

Les nouveaux concepts sont intégrés via une syntaxe compatible TS :

| Concept | Rust | TSClang |
|---------|------|---------|
| Emprunt immuable | `&T` | `Ref<T>` |
| Emprunt mutable | `&mut T` | `Mut<T>` |
| Variable mutable | `let mut` | `let mut` |
| Lecture seule | `let` (par défaut) | `const` / `readonly` |

Les classes sont préservées, malgré leur absence dans Rust — elles existent dans TS et sont familières aux développeurs.

## Question pour chaque décision

> *Cela peut-il s'exprimer via la syntaxe TS existante ou son extension naturelle ?*

Si oui — utilisez la syntaxe TS. Si non — trouvez l'extension minimale qui n'entre pas en conflit avec TS.

## Compatibilité ascendante

Un code TS natif simple sans bibliothèques externes devrait compiler ou nécessiter des corrections triviales qui restent du TS valide :

```typescript
let a = 10          // peut nécessiter une annotation explicite
let a: number = 10  // valide à la fois en TS et en TSClang
```

Le code avec des classes, des objets, des tableaux, des boucles, des littéraux de gabarit — fonctionne tel quel ou avec des modifications minimales.

## Voir aussi

- [Qu'est-ce que TSClang](./what-is-tsclang.md) — aperçu du langage
- [Modèle de mémoire](../05-memory/index.md) — comment fonctionnent la propriété et le vérificateur d'emprunt
- [Guide de migration](../12-migration/index.md) — portage de code TS vers TSClang
