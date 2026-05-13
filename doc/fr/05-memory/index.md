# Modèle de mémoire

[← Haut](../index.md) | [Suivant →](./ownership-types.md)

---

TSClang utilise un **modèle de gestion de mémoire hybride** : vérificateur statique de propriété/emprunt + ARC optionnel. Pas de GC, pas de `free` manuel.

## Principe

Le compilateur trace statiquement le propriétaire de chaque valeur. La désallocation de la mémoire est déterministe, à la fin de la portée du propriétaire. Pour les cas où l'analyse statique est insuffisante (graphes, cycles) — `Shared<T>` avec comptage de références atomique (ARC).

## Types de propriété

| Type | Sémantique | Description |
|------|-----------|-------------|
| `T` | **Propriétaire** | Propriété totale, déplacement lors du transfert |
| `Ref<T>` | **Emprunt immuable** | Lecture seule, pas de modification ni de suppression |
| `Mut<T>` | **Emprunt mutable** | Lecture et écriture, un seul `Mut` à la fois |
| `Shared<T>` | **ARC** | Référence forte, incrémente le compteur, desktop uniquement |
| `Weak<T>` | **Référence faible** | N'incrémente pas le compteur, brise les cycles |
| `Slice<T>` | **Vue empruntée de tableau** | Sous-plage zéro-copie, pointeur + longueur |

## Règles de base

- **Primitifs** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — toujours **copiés**, le vérificateur d'emprunt ne s'applique pas
- **Types complexes** (tableaux, objets, chaînes, classes) — gérés par le système de propriété
- `string` — Propriétaire alloué sur le tas, passé comme `Ref<string>`, copié via `clone()`

## Vérificateur d'emprunt

Règle **Aliasing XOR mutabilité** : deux `Mut` simultanément ne sont pas autorisés, `Mut` + `Ref` n'est pas autorisé, mais plusieurs `Ref` simultanément le sont.

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // ok — plusieurs Ref autorisés
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // erreur : un Mut actif existe déjà
```

## Libération automatique

Le compilateur insère `free()` à la fin de la portée du propriétaire. Avec plusieurs `return` et `throw` — point de nettoyage unique via `goto cleanup` :

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... travail ...
cleanup:
    if (u) User_free(u);
}
```

## Sous-pages

| Page | Description |
|------|-------------|
| [Types de propriété](./ownership-types.md) | Vue d'ensemble de tous les types de propriété et leurs représentations C |
| [Propriétaire (T)](./owner.md) | Propriété totale, déplacement lors de l'affectation et du transfert |
| [Ref<T>](./ref.md) | Emprunt immuable, motifs de vue |
| [Mut<T>](./mut.md) | Emprunt mutable, règles d'exclusivité |
| [Shared<T> et Weak<T>](./shared.md) | ARC et références faibles pour les graphes et les cycles |
| [Slice<T>](./slice.md) | Vue zéro-copie sur une partie de tableau ou de chaîne |
| [Vérificateur d'emprunt](./borrow-checker.md) | Règles d'aliasing, durée de vie, contraintes de portée |
| [Drop et nettoyage](./drop.md) | Désallocation automatique, `goto cleanup` |
| [Déstructuration](./destructuring.md) | Emprunt vs déplacement lors de la déstructuration des champs |
| [Fermetures](./closures.md) | Règles de capture : copie, Ref, Mut, déplacement |
| [Itérateurs](./iterators.md) | `Iterable<T>`, itérateurs pull-based sur la pile |

## Sortie C

```typescript
let user = new User();
user.name = "Alice";
// fin de portée — User_free appelé automatiquement
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... utilisation ...
User_free(&user);   // inséré par le compilateur
```

## Erreurs

| Erreur | Cause |
|-------|-------|
| `use of moved value: "x"` | Accès à une variable après déplacement |
| `already borrowed as Mut` | Deuxième `Mut` ou `Ref` pendant qu'un `Mut` est actif |
| `already borrowed as Ref` | `Mut` pendant qu'un `Ref` est actif |
| `Ref<T> not allowed in class field` | Tentative de stocker un emprunt dans un champ de classe |
| `cannot move out of array by index` | `arr[i]` pour un type possédé sans `.remove()` |

## Voir aussi

- [Variables : let / const](../02-syntax/variables/index.md) — impact de `let`/`const` sur `Mut<T>` / `Ref<T>`
- [Fonctions](../02-syntax/functions/declaration.md) — règles de passage d'arguments
- [Classes](../04-classes/index.md) — méthodes `mut` et champs `readonly`
- [Erreurs](../06-errors/index.md) — `goto cleanup` sur `throw` / `?`
