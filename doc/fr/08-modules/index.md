# Système de modules

[← Haut](../index.md) | [Suivant →](./import-export.md)

---

TSClang utilise un **système de modules** compatible avec TypeScript en syntaxe : `export` / `import { } from ""` nommés. Un fichier = un module. Le compilateur génère automatiquement les `#include`, les déclarations anticipées et les fonctions d'initialisation dans le C généré.

## Principes

- **Un fichier — un module** — pas de `namespace`, pas de `module`
- **Exports nommés uniquement** — `export default` interdit (C requiert un nom explicite pour chaque symbole)
- **Importations circulaires autorisées** — le compilateur génère des déclarations anticipées dans `.h`
- **Fichiers `.d.tsc`** — déclarations pour l'interopérabilité C (analogue des `.d.ts` en TypeScript)
- **Alias de chemins** — noms courts `#/`, `~/` au lieu de `../../../`

## Import et Export

```typescript
// math.tsc — module avec exports
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — import
import { PI, add } from "./math"
console.log(add(1, 2))
```

## Point d'entrée

Le point d'entrée est défini par le champ `"main"` dans `tsc.package.json`. Le code de niveau supérieur du fichier d'entrée devient le corps de `main()` en C :

```typescript
const a: i32 = 1
console.log(a)
```

```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

## Initialisation des modules

Le compilateur construit un graphe de dépendances et effectue un **tri topologique**. Chaque module avec des variables de niveau module reçoit une fonction `_init()`. Le résultat est un unique `tsc_init_all()` avec l'ordre d'appel correct.

## Interopérabilité C

Pour interagir avec les bibliothèques C, TSClang fournit plusieurs mécanismes :

| Mécanisme | Objectif |
|----------|------------|
| `.d.tsc` | Déclarations de types, fonctions et constantes C |
| `native` | Code C en ligne (verbatim) |
| `unsafe {}` | Désactivation du vérificateur d'emprunt/de types |
| `FnPtr<T>` | Pointeurs de fonction pour les callbacks C |
| `@platform` | Compilation conditionnelle par plateforme |

## Sous-pages

| Page | Description |
|----------|----------|
| [Import / Export](./import-export.md) | Export/import nommés, import d'espace de noms, `import type`, initialisation, imports circulaires, alias de chemins |
| [Fichiers .d.tsc](./d-tsc.md) | Déclarations pour l'interopérabilité C : struct, type opaque, fonctions, constantes, MMIO |
| [native — C en ligne](./native.md) | Syntaxe, interpolation, limitations, inserts d'assembleur |
| [unsafe {} — Désactiver les vérifications](./unsafe.md) | Quand l'utiliser, ce qu'il désactive, différence avec `native` |
| [Callbacks et FnPtr\<T\>](./callbacks.md) | Pointeurs de fonction, macros TSC_CLOSURE_*, pontage de closures |
| [@platform — Compilation conditionnelle](./platform.md) | Implémentations dépendantes de la plateforme, structure du package |

## C généré

```c
// résultat de la compilation de plusieurs modules
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... code de niveau supérieur de main.tsc ...
    return 0;
}
```

## Erreurs

| Erreur | Cause |
|--------|---------|
| `cannot determine entry point` | Pas de champ `"main"` dans `tsc.package.json` |
| `main file not found: src/main.tsc` | Le fichier du `"main"` n'existe pas |
| `circular initialization dependency detected` | Cycle via les variables de niveau module |
| `export default is not allowed` | Tentative d'utilisation d'un export par défaut |
| `native block — C code inserted verbatim` | Avertissement sur chaque bloc `native` |

## Voir aussi

- [Syntaxe : Variables](../02-syntax/variables/index.md) — variables de niveau module
- [Mémoire : Propriété](../05-memory/ownership-types.md) — owned/borrow lors du passage entre modules
- [Concurrence](../07-concurrency/index.md) — thread-safety pour les variables de niveau module
