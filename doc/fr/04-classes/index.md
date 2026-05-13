# Classes et système d'objets

[← Haut](../index.md) | [Suivant →](./classes.md)

---

Le système d'objets de TSClang repose sur la composition plutôt que l'héritage, le typage nominal pour les classes, et le typage structurel pour les interfaces. Les génériques sont monomorphisés — code C séparé pour chaque type concret.

## Principes clés

- **Pas d'héritage** — seul `extends Error` est autorisé pour les hiérarchies d'erreurs. Polymorphisme via `interface` + `implements`.
- **Composition** — au lieu de `class Dog extends Animal`, utiliser `class Dog { animal: Animal }`.
- **Propriété intégrée** — les modificateurs `mut`, `move` contrôlent la sémantique de `this`.
- **Génériques monomorphisés** — `Stack<i32>` et `Stack<User>` génèrent des fonctions C séparées.
- **Décorateurs à la compilation** — transforment l'AST avant la vérification de types, zéro surcharge à l'exécution.

## Sous-pages

| Page | Description |
|------|-------------|
| [Classes](./classes.md) | Définition, modificateurs, sémantique de `this`, `readonly`, constructeurs, objet valeur, builder |
| [Interfaces](./interfaces.md) | Interfaces de données vs contrat, fat pointer vtable, `instanceof`, compatibilité structurelle |
| [Enum](./enum.md) | Numériques, chaînes, `const enum`, utilitaires, exhaustivité dans `match` |
| [Génériques](./generics.md) | Syntaxe, bornes (`implements`/`extends`), monomorphisation, propriété avec génériques |
| [Décorateurs](./decorators.md) | `decorator function`, Descriptor API, `@packed`, `@align`, `@static`, `@embedded.*`, `@signal`, `@platform` |

## Méthodes d'extension

TSClang prend en charge les méthodes d'extension — ajout de méthodes à des types existants sans modifier la définition. Importées explicitement, ne polluent pas la portée globale.

```typescript
export extension function charCount(this: string): i32 {
    // compte les points de code
}

import { charCount } from "std/string"
"привет".charCount()   // ok
```

Sortie C — appel statique, zéro surcharge :

```c
int32_t n = tsc_std_string_charCount(s);
```

Une extension en conflit avec une méthode existante — erreur de compilation. Deux extensions avec le même nom provenant de modules différents — résolues via `import { format as fmtA } from "./module-a"`.

## Erreurs

| Erreur | Cause |
|-------|-------|
| `extends is only allowed for Error` | Tentative d'hériter d'une classe arbitraire |
| `extension 'format' conflicts with existing method` | Extension portant le nom d'une méthode existante |
| `ambiguous extension 'format' for type 'string'` | Deux extensions importées avec le même nom |

## Voir aussi

- [Modèle de mémoire](../05-memory/index.md) — propriété, `Ref<T>`, `Mut<T>`, sémantique de déplacement
- [Système de types](../03-types/index.md) — typage structurel vs nominal
- [Gestion des erreurs](../06-errors/index.md) — `extends Error`, `throws`, `try/catch`
- [Spécification : Classes](../../spec/04-classes.md) — description complète du système d'objets
