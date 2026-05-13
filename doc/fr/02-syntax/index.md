# Syntaxe

[← Haut](../index.md) | [Suivant →](./formatting.md)

---

Description complète de la syntaxe de TSClang. Le langage suit les conventions TypeScript/JavaScript avec des extensions pour la gestion sécurisée de la mémoire.

## Sections

### Bases
- [Formatage](./formatting.md) — points-virgules, indentation, guillemets, linter
- [Truthy / Falsy](./truthy-falsy.md) — quelles valeurs sont considérées comme vraies/fausses

### Variables
- [let / const](./variables/index.md) — mutabilité, différences de propriété

### Fonctions
- [Déclaration](./functions/declaration.md) — `function`, paramètres, type de retour
- [Flèche](./functions/arrow.md) — syntaxe `=>`
- [Surcharge](./functions/overload.md) — par type et nombre de paramètres
- [Paramètres par défaut](./functions/default-params.md) — valeurs par défaut

### Opérateurs
- [Arithmétiques](./operators/arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Affectation](./operators/assignment.md) — `=`, `+=`, `-=`, etc.
- [Comparaison](./operators/comparison.md) — `==`, `!=`, `===`, `!==`
- [Logiques](./operators/logical.md) — `&&`, `||`, `!`, `??`
- [Bit à bit](./operators/bitwise.md) — `&`, `|`, `^`, `~`, `<<`, `>>`
- [Optionnels](./operators/optional.md) — `?.`, `??`, spread `...`
- [Priorité des opérateurs](./operators/precedence.md) — table de priorité

### Boucles
- [for](./loops/for.md) — boucle classique
- [for-of](./loops/for-of.md) — itération sur collection
- [while / do-while](./loops/while.md) — boucles conditionnelles
- [break / continue](./loops/break-continue.md) — contrôle d'itération

### Contrôle de flux
- [switch](./match/switch.md) — sélection par valeur
- [match](./match/index.md) — filtrage par motif

### Tranches
- [Indexation et tranches](./slices.md) — `[]`, `[a..b]`, indices négatifs

## Voir aussi

- [Types](../03-types/index.md) — système de types
- [Modèle de mémoire](../05-memory/index.md) — propriété et vérificateur d'emprunt
