# Architecture du compilateur

[← Haut](../index.md) | [Suivant →](./phases.md)

---

Architecture du compilateur TSClang pour les contributeurs. Le compilateur traduit les `.tsc` vers C99, déléguant les optimisations machine au compilateur C (gcc/clang/avr-gcc).

## Pipeline

```
.tsc source
    ↓
Parse (lexer + parser)      →  AST
    ↓
Decorator pass              →  AST modifié
    ↓
Typecheck                   →  AST typé
    ↓
Lower to IR                 →  IR de type SSA (blocs de base)
    ↓
Ownership Analysis          →  borrow checker + injection ARC
    ↓
Codegen                     →  C99 + #line + CMakeLists.txt
    ↓
Compilateur C               →  binaire / .hex
```

## Code source

| Chemin | Objectif |
|------|---------|
| `src/compiler/lexer.js` | Lexer |
| `src/compiler/parser.js` | Parser → AST |
| `src/compiler/types.js` | Types utilitaires et mangling |
| `src/compiler/codegen.js` | Point d'entrée du codegen, classe Context |
| `src/compiler/codegen/top-level/` | Classes, fonctions, interfaces, enum, alias de types |
| `src/compiler/codegen/stmt/` | Déclarations de variables, flux de contrôle, déstructuration, match |
| `src/compiler/codegen/expr/` | Dispatcher d'expressions, opérateurs, assignation, littéraux |
| `src/compiler/codegen/calls/` | Appels : méthodes, console, stdlib, builtin, conversions, concurrence |
| `src/compiler/codegen/types/` | Résolution de types, inférence, utilitaires |
| `src/compiler/codegen/misc/` | Utilitaires, new-expr, closures, tableaux |
| `src/compiler/codegen/async/` | Async : statements, émission, générateurs, utilitaires, scan |
| `src/compiler/codegen/generics.js` | Monomorphisation des génériques |
| `src/runtime/runtime.h` | Fichier d'en-tête du runtime C |

## Méthodologie de test

Chaque composant est implémenté selon un cycle :

```
1. Tests     — corpus (input.tsc → expected.c / expected.error)
2. Implémentation — jusqu'à ce que tous les tests passent
3. Log       — log/<composant>.md : décisions, problèmes, changements
```

Corpus de tests : `test/cases/phase0–phase19`, 1028 tests au total. Le format est décrit dans `test/CORPUS.md`.

## Sous-pages

| Page | Description |
|------|-------------|
| [Phases de compilation](./phases.md) | Parse → AST → Decorator → Typecheck → IR → Ownership → Codegen |
| [Name mangling](./name-mangling.md) | Schéma formel, encodage de types, slug de module, collisions |
| [Debug info](./debug.md) | Directives `#line`, serveur DAP, débogage embarqué |
| [Optimisation](./optimization.md) | Niveaux O0–O3/Os, monomorphisation côté consommateur, incrémental *(feuille de route)* |

## Erreurs

| Erreur | Cause |
|-------|-------|
| `type name must start with uppercase letter` | Nom de classe/interface non en PascalCase |
| `type name uses reserved mangling prefix` | Utilisation de `ref_`, `mut_`, `arc_`, `opt_`, `arr_` dans un nom de type |
| `error[TSC-EXXX]` | Code d'erreur stable — consultable dans la documentation |

## Voir aussi

- [Décorateurs](../04-classes/decorators.md) — passe décorateur : algorithme et limitations
- [Modèle de mémoire](../05-memory/index.md) — propriété, borrow checker, instructions IR
- [Système de build](../09-build/index.md) — CMake, profils, cibles embarquées
