# Plan de documentation TSClang

## Objectif

Créer une documentation complète pour les développeurs en anglais basée sur la spécification.
La documentation doit être pratique, orientée utilisateur (centrée sur le développeur), pas centrée sur l'auteur du compilateur.

## Public cible

1. Un développeur venant de TypeScript qui souhaite commencer à écrire en TSClang
2. Un développeur évaluant le langage pour le développement embarqué
3. Un développeur cherchant une API spécifique (méthode de chaîne, type de propriété, serveur HTTP)

## Principes de rédaction

- Langue : anglais
- Exemples de code : fonctionnels, minimaux, avec des commentaires en anglais
- Structure : du simple au complexe
- Chaque section est autonome — peut être lue indépendamment
- Références croisées entre sections pour approfondir

## Structure des fichiers

**Structure imbriquée :** chaque méthode, fonction, type et construction a son propre fichier.
Pas de pages monolithiques de 50 Ko. Si une méthode a 3 variantes d'appel — ce sont 3 fichiers
à l'intérieur du répertoire de la méthode.

Exemple de structure :

```
doc/
  02-syntax/
    index.md                        # aperçu de la section + liens
    variables/
      let.md
      const.md
    functions/
      declaration.md
      arrow.md
      anonymous.md
      iife.md
      default-params.md
      overload.md
        by-type.md
        by-count.md
        priority.md
    loops/
      for.md
      for-of.md
      while.md
      do-while.md
      break-continue.md
    match/
      syntax.md
      patterns/
        literal.md
        range.md
        destructuring.md
        wildcard.md
        union.md
      exhaustiveness.md
      vs-switch.md
    operators/
      arithmetic.md
      assignment.md
      comparison.md
      logical.md
      bitwise.md
      ternary.md
      optional-chaining.md
      nullish-coalescing.md
      spread.md
    truthy-falsy.md
    slices.md
```

## Règles de contenu des fichiers

Chaque fichier décrit **une** méthode / fonction / construction / type et doit contenir :

### 1. Description complète

Ce que c'est, pourquoi c'est nécessaire, comment ça marche. Pas de remplissage — concret et direct.
Mentionner les cas limites et les comportements non évidents.

### 2. Signature / Syntaxe

Signature exacte avec les types des paramètres et le type de retour.
Si une méthode a plusieurs variantes (surcharges) — décrire chacune séparément.

### 3. Exemples d'utilisation ou d'implémentation

Au moins un exemple fonctionnel par variante.
Les exemples doivent être minimaux — sans contexte inutile.
Chaque exemple avec le résultat indiqué (commentaire `// →`).

### 4. Sortie C

Pour chaque exemple — comment ça se compile en C.
Montrer le code C généré pour que le développeur comprenne ce qui se passe sous le capot.
Particulièrement important pour les constructions de propriété (move, borrow, drop, cleanup).

### 5. Erreurs et corrections

Erreurs typiques du compilateur lors d'une utilisation incorrecte.
Format : `code erroné → texte d'erreur → code corrigé`.
Doit inclure l'indice du compilateur.

### 6. Navigation et liens

Chaque fichier doit contenir des liens de navigation :

**Barre de navigation** — en haut du fichier, après le titre :

```markdown
[← Haut](./index.md) | [Suivant →](./filter.md) | [Précédent ←](./sort.md)
```

Trois liens :
- **Haut** (`←`) — saut vers le `index.md` du répertoire parent (aperçu de la section)
- **Suivant** (`→`) — saut vers le fichier suivant à ce niveau (dans l'ordre logique, pas alphabétique)
- **Précédent** (`←`) — saut vers le fichier précédent à ce niveau

Le premier fichier d'une section n'a pas de "Précédent", le dernier n'a pas de "Suivant".

**Références croisées** — à la fin du fichier, section "Voir aussi" :

```markdown
## Voir aussi

- [filter](./filter.md) — filtrage d'éléments
- [reduce](./reduce.md) — accumulation
- [forEach](./for-each.md) — itération sans résultat
```

Liens vers des constructions liées dans d'autres sections — avec le chemin complet :

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) — emprunt d'un élément
```

**index.md dans chaque répertoire** — aperçu de la section avec des liens vers tous les fichiers enfants.
Sert de point d'entrée pour la navigation de haut en bas.

Exemple de modèle de fichier :

```markdown
# map

Crée un nouveau tableau en appliquant une fonction à chaque élément du tableau source.

## Signature

\`\`\`typescript
arr.map<U>(f: (Ref<T>) => U): U[]
\`\`\`

Le callback reçoit `Ref<T>` — un emprunt de l'élément, pas la propriété.

## Exemples

### Utilisation de base

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
const doubled = nums.map(x => x * 2)
// → [2, 4, 6]
\`\`\`

### Sortie C

\`\`\`c
int32_t* doubled = malloc(3 * sizeof(int32_t));
for (size_t i = 0; i < 3; i++) {
    doubled[i] = nums[i] * 2;
}
\`\`\`

### Conversion de type

\`\`\`typescript
const names: string[] = users.map(u => u.name)
// → ["Alice", "Bob"]
\`\`\`

## Erreurs

### Callback mute l'élément

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => { x++ })  // error: cannot assign to Ref<i32>
\`\`\`

Correction :

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => x * 2)  // return a new value
\`\`\`

## Voir aussi

- [filter](./filter.md)
- [reduce](./reduce.md)
- [flatMap](./flat-map.md)
```

---

## Structure de la documentation

### 01-intro.md — Introduction à TSClang

**Objectif :** expliquer ce que c'est, pourquoi ça existe, et fournir un premier exemple fonctionnel.

- Qu'est-ce que TSClang (syntaxe TS → C, sécurité Rust, écosystème npm)
- Philosophie de conception (3 priorités : sécurité, performance, syntaxe TS)
- Cas d'utilisation (bureau, embarqué, serveurs, plateformes rétro)
- Démarrage rapide : installation, `hello world`, build et exécution
- Prérequis (Node.js, CMake, gcc/clang)
- Aperçu CLI : `tsclang build`, `tsclang lint`, `tsclang lsp`

**Source :** `spec/01-intro.md`

---

### 02-syntax.md — Syntaxe

**Objectif :** description complète de la syntaxe du langage.

- Formatage (ASI, K&R, indentation, guillemets, virgule finale)
- Variables : `let` / `const` — différence dans le contexte de la propriété
- Fonctions : `function`, fléchée, anonyme, IIFE
- Paramètres : par défaut, reste
- Surcharge de fonctions (par type et compte, priorité de résolution)
- Opérateurs : arithmétiques, d'affectation, de comparaison, logiques, bit à bit
- Truthy / Falsy (tableau par type)
- Boucles : `for`, `for-of`, `while`, `do-while`, `break`/`continue`, étiquetées
- `switch` / `match` — comparaison, exhaustivité
- Opérateur spread (tableaux, objets, règles de propriété)
- Indexation et tranches (tableaux et chaînes, index négatifs)

**Source :** `spec/02-syntax.md`

---

### 03-types.md — Système de types

**Objectif :** description du typage, de tous les types et des conversions.

- Typage structurel vs nominal (`type`, `interface`, `class`)
- Inférence de type
- Types numériques (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`)
  - Littéraux (hex, binaire, octal, séparateurs `_`)
  - Conversion automatique (3 mécanismes : élargissement, compile-time, `as`)
  - `usize` — type plateforme
  - `number` = `f64` (surchargeable)
  - Avertissements de performance sur AVR
- `string` — octets UTF-8, layout C, indexation, itération, méthodes intégrées
- Types spéciaux : `void`, `never`, `any`
- Null : `T | null`, optionnel `?`, chaînage optionnel `?.`, coalescence nullish `??`
  - Représentation C de `T | null` (structure avec drapeau)
  - Patterns embarqués : valeur sentinelle, drapeau séparé
- Conversion de type : nombre ↔ chaîne, fonctions compatibles JS (`parseInt`, `parseFloat`)
- `Date` — création, méthodes, formatage
- Tableaux : `T[]` (dynamique), `T[N]` (fixe), méthodes, méthodes fonctionnelles
- `Slice<T>` / `MutSlice<T>` — vue zero-copy
- `Map<K,V>`, `Set<T>` — API, propriété, patterns embarqués
- `Object` — méthodes statiques
- Tuples : fixes, étiquetés, readonly, optionnels, reste, spread
- `Clone` — interface, `clone()`, `structuredClone()`
- Alias de type (`type`)
- Union de littéraux de chaîne
- Types utilitaires : `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`
- `Buffer`, `DataView`

**Source :** `spec/03-types.md`

---

### 04-classes.md — Classes, Interfaces, Énumération, Génériques

**Objectif :** le système objet du langage.

- Génériques : syntaxe, contraintes (`implements`/`extends`), monomorphisation, propriété avec génériques
- Méthodes d'extension : déclaration, import, conflits
- Énumération : numérique, chaîne, `const enum`, utilitaires, dans switch/match
- Interfaces : données vs contrat avec méthodes, gros pointeur, vtable
- `instanceof` — rétrécissement de type via vtable
- Classes :
  - Pas d'héritage (sauf `extends Error`), composition
  - Modificateurs : `public`, `private`, `static`, `mut`, `move`
  - Sémantique de `this` et accès aux champs
  - Champs `readonly`
  - Constructeur : auto-génération, explicite, `private`
  - Pattern value object
  - Pattern builder avec `move`
- Alignement : `@packed`, `@align(N)`, diagnostics de remplissage
- Décorateurs : aperçu, référence vers la section complète

**Source :** `spec/04-classes.md`, `spec/13-decorators.md`

---

### 05-memory.md — Modèle de mémoire et propriété

**Objectif :** la fonctionnalité clé du langage — gestion mémoire sûre.

- Types de propriété : `T` (Propriétaire), `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>`, `Slice<T>`
- Règles de base : primitives copiées, types complexes — propriété
- Propriétaire (T) : move lors de l'affectation et du passage
- `Ref<T>` : emprunt immuable, règles, interdit dans les champs, patterns de contournement
- `Mut<T>` : emprunt mutable, un à la fois
- `Shared<T>` : ARC, `Weak<T>` pour briser les cycles
- Règles du vérificateur d'emprunt (4 règles)
- Matrice de passage d'arguments (let/const/Ref/Mut/Shared → Ref/Mut/T/Shared)
- Mutabilité intérieure — pourquoi elle n'est pas présente
- `@static let` — état global mutable
- Contrainte de portée (sans annotations de durée de vie) : 4 règles
- Drop automatique et `goto cleanup`
- `Iterable<T>` — types itérables définis par l'utilisateur
- Accès aux champs et déstructuration (emprunt vs move)
- Tranches (emprunt vs propriété)
- Move depuis un tableau, mutation pendant l'emprunt
- Retour d'emprunt depuis une méthode
- Closures : règles de capture, liste de capture explicite, closure Mut via await

**Source :** `spec/05-memory.md`

---

### 06-errors.md — Gestion des erreurs

**Objectif :** système d'erreurs — basé sur Result sans setjmp/longjmp.

- Principe : `throw`/`try`/`catch` en TS → structures Result en C
- Déclaration de `throws` dans la signature
- `Error` — classe de base, `error.stack`
- `throw`, `try`/`catch`/`finally`
- Catch d'union, gestion exhaustive
- Opérateur `?` (propager)
- Opérateur `!` (déballer/paniquer)
- Sortie C : structures Result, `if/else` sur `ok` et `_kind`
- Propriété pendant les erreurs (cleanup via `goto`)
- Limitations

**Source :** `spec/06-errors.md`

---

### 07-concurrency.md — Concurrence

**Objectif :** trois niveaux de concurrence et comment les utiliser.

- Aperçu des trois mécanismes (async/await, threads, ISR)
- **Async/Await :**
  - Architecture du runtime async (machines à états)
  - Taille de la machine à états, sécurité de la pile sur l'embarqué
  - `Promise<T>` : création, `.then`/`.catch`/`.finally`
  - `Promise.all`, `Promise.any`, `Promise.race`, `Promise.allSettled`
  - Règles de `await`, `async main`
  - Fonctions async récursives
  - `@embedded.stack` — pile explicite
  - Annulation de tâche : `AbortController`, `AbortSignal`
  - `AsyncMutex`
- **Threads (std/threads) :**
  - Isolates sans mémoire partagée
  - `Atomic<T>`, `AtomicArray<T>`
  - `channel<T>` : MPMC borné, opérations sûres ISR
  - `select` : attente sur plusieurs canaux
  - `Readonly<T>` : partage zero-copy
  - `Thread<T>` : résultat typé
  - Règles Thread.spawn, vérification Send
- **@embedded.isr :**
  - `Volatile<T>` — registres MMIO
  - ISR : signature, règles, patterns
  - `std/sync` — sections critiques
  - `EmbeddedSignal` — pont ISR → async
- Annotations embarquées : `@embedded.inline`, `@embedded.noHeap`
- `@signal` — signaux POSIX (bureau)
- Générateurs async : `async function*`, `for await`, `close()`
- Multitâche coopératif via générateurs

**Source :** `spec/07-concurrency.md`

---

### 08-modules.md — Modules et interopérabilité C

**Objectif :** comment fonctionne le système de modules et l'interop C.

- Export : nommé, `export default` est interdit
- Import : nommé, espace de noms, `import type`
- Ordre d'initialisation des modules, imports cycliques
- Variables au niveau du module
- Alias de chemin (`#`, `~`)
- Point d'entrée : `"main"`, `"builds"`, génération du main C
- Bibliothèques : `"type": "library"`
- Fichiers `.d.tsc` : 5 types de déclarations
  - Structure C, type opaque, fonctions C, constantes, registres MMIO
  - Configuration de lien (system, bundled, fetch)
- `native` — C inline (syntaxe, interpolation, limitations)
- Callbacks : `FnPtr<T>`, macros `TSC_CLOSURE_*`
- `unsafe {}` — désactivation des vérifications
- `@platform` — compilation conditionnelle
- Fusion de déclarations
- Fonctions C variadiques : type `Scalar`

**Source :** `spec/08-modules.md`

---

### 09-build.md — Système de build

**Objectif :** comment un projet, un build et des packages sont structurés.

- Types de projet : exécutable, bibliothèque, C-wrapper, package plateforme
- `tsc.package.json` : tous les champs
- C-wrapper : structure, publication, configuration de lien (system/bundled/fetch)
- Package plateforme : `declare platform {}`, champs plateforme
- CLI : `tsclang build`, flags (`--outDir`, `--target`, `--profile`, `--optimize`)
- Gestionnaire de packages : `tsclang install`, `tsclang publish`, `tsclang search`
- Monorepo : `"workspaces"`
- Builds embarqués : AVR, ARM, plateformes rétro
- CMakeLists.txt : génération, personnalisation
- Profils : debug/release, optimisation

**Source :** `spec/09-build.md`

---

### 10-stdlib.md — Bibliothèque standard

**Objectif :** référence pour tous les modules de la bibliothèque standard.

- Principes : API unifiée via `std/`, chargement paresseux, tree-shaking
- Objets globaux : `console`, `Math`, `process`, timers, `performance`
- `Error` — classe de base
- `Map<K,V>`, `Set<T>` — API, propriété
- `Buffer`, `DataView`
- `std/io` — Reader/Writer
- `std/fs` — opérations sur les fichiers
- `std/net` — fetch, serveur HTTP, TCP/UDP
- `std/ws` — WebSocket
- `std/math` — constantes et méthodes (tableau complet)
- `std/string` — Unicode, encodage, formatage
- `std/json` — parsing et sérialisation
- `std/url` — URL et URLSearchParams
- `std/blob` — Blob et File
- `std/formdata` — multipart/form-data
- `std/regex` — regex NFA, syntaxe, API
- `std/random` — Random, HardwareRandom
- `std/temporal` — PlainDateTime, Instant, Duration
- `std/reactive` — ReactiveVar, computed, effect
- `std/hal` — GPIO, UART, SPI, I2C
- `std/embedded` — Volatile, pointeur, HashMap, StaticMap
- Compatibilité plateforme (tableau)

**Source :** `spec/10-stdlib.md`, `spec/19-stdlib-*.md`

---

### 11-compiler.md — Architecture du compilateur

**Objectif :** pour les contributeurs et ceux qui veulent comprendre les internals.

- Phases de compilation (Parse → AST → Decorator → Typecheck → IR → Codegen)
- IR : blocs de base, instructions, nœuds phi
- Mangling de noms (schéma formel)
- Info de debug : directives `#line`, serveur DAP
- Monomorphisation côté consommateur
- Compilation incrémentale (feuille de route)
- Niveaux d'optimisation (O0–O3, Os)
- Messages d'erreur : format, catégories, codes d'erreur

**Source :** `spec/11-compiler.md`

---

### 12-migration.md — Guide de migration : TypeScript → TSClang

**Objectif :** aider un développeur TS à migrer du code.

- Corrections automatiques (`tsclang migrate`)
- Ce qui fonctionne tel quel (exemples)
- Ce qui nécessite des corrections manuelles (patterns spécifiques)
- Patterns incompatibles (tableau d'alternatives)
- Ce que TSClang ajoute (ce qui n'est pas dans TS)

**Source :** `spec/12-migration.md`

---

## Tableau récapitulatif des sections

| # | Fichier | Contenu | Source | Taille |
|---|---------|---------|--------|--------|
| 01 | intro | Qu'est-ce que TSClang, démarrage rapide, CLI | `spec/01-intro.md` | ~30 Ko |
| 02 | syntax | Syntaxe, opérateurs, boucles, match/switch | `spec/02-syntax.md` | ~50 Ko |
| 03 | types | Types, nombres, chaînes, tableaux, Map/Set, tuples, types utilitaires | `spec/03-types.md` | ~80 Ko |
| 04 | classes | Classes, interfaces, énumération, génériques, méthodes d'extension | `spec/04-classes.md`, `spec/13-decorators.md` | ~40 Ko |
| 05 | memory | Propriété, vérificateur d'emprunt, Ref/Mut/Shared, closures | `spec/05-memory.md` | ~50 Ko |
| 06 | errors | throw/try/catch, Result, opérateurs `?`/`!` | `spec/06-errors.md` | ~15 Ko |
| 07 | concurrency | async/await, threads, ISR, atomique, canaux, générateurs | `spec/07-concurrency.md` | ~70 Ko |
| 08 | modules | Import/export, .d.tsc, natif, unsafe, @platform | `spec/08-modules.md` | ~50 Ko |
| 09 | build | Build, packages, C-wrapper, plateformes | `spec/09-build.md` | ~50 Ko |
| 10 | stdlib | Référence pour tous les modules std | `spec/10-stdlib.md`, `spec/19-stdlib-*.md` | ~60 Ko |
| 11 | compiler | Architecture du compilateur (pour les contributeurs) | `spec/11-compiler.md` | ~30 Ko |
| 12 | migration | Guide de migration TypeScript → TSClang | `spec/12-migration.md` | ~15 Ko |
| | | | **Total** | **~540 Ko** |

## Ordre de rédaction recommandé

Ordre recommandé (du plus important et commun au plus avancé) :

1. `01-intro.md` — point d'entrée pour tout le monde
2. `02-syntax.md` — constructions de base
3. `05-memory.md` — fonctionnalité clé, nécessaire à tous
4. `03-types.md` — système de types
5. `04-classes.md` — système objet
6. `06-errors.md` — gestion des erreurs
7. `08-modules.md` — modules et interop C
8. `07-concurrency.md` — concurrence
9. `10-stdlib.md` — référence API
10. `09-build.md` — système de build
11. `12-migration.md` — migration depuis TS
12. `11-compiler.md` — internals (pour les contributeurs)

## Estimation de taille

| Document | Taille estimée |
|----------|----------------|
| 01-intro | ~30 Ko |
| 02-syntax | ~50 Ko |
| 03-types | ~80 Ko |
| 04-classes | ~40 Ko |
| 05-memory | ~50 Ko |
| 06-errors | ~15 Ko |
| 07-concurrency | ~70 Ko |
| 08-modules | ~50 Ko |
| 09-build | ~50 Ko |
| 10-stdlib | ~60 Ko |
| 11-compiler | ~30 Ko |
| 12-migration | ~15 Ko |
| **Total** | **~540 Ko** |

## Format

- Markdown (.md)
- Chaque fichier est une section autonome
- Titres H1 pour les titres de section, H2/H3 pour les sous-sections
- Tableaux pour les informations de référence
- Blocs de code avec spécificateur de langage (```typescript, ```c, ```bash)
- `> **Note :**` pour les remarques importantes
- `> **Warning :**` pour les limitations critiques
