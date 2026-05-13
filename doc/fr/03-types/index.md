# Système de types

[← Haut](../index.md) | [Suivant →](./numbers.md)

---

Le système de types de TSClang est statique, avec inférence de types et trois niveaux de sécurité : vérifications à la compilation, vérificateur de propriété/emprunt et ARC optionnel.

## Deux niveaux de typage

TSClang sépare les types en **structuraux** et **nominaux** :

| Construct | Typage | Littéraux d'objet | Sortie C |
|-----------|--------|-------------------|----------|
| `type Foo = { ... }` | Structurel | ✅ | `typedef struct`, méthodes interdites |
| `interface Foo { ... }` | Structurel | ✅ (si pas de méthodes) | `typedef struct` ou fat pointer + vtable |
| `class Foo { ... }` | **Nominal** | ❌ | struct + méthodes |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // ok — compatibilité structurelle
const v: Vector = p                     // ok — mêmes champs

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // erreur — la classe est nominale
```

Différence clé `type` vs `interface` :
- `type Point = { x: f64; y: f64 }` — structure de données **garantie** sans vtable. Les méthodes sont interdites par erreur de compilation. À utiliser pour le MMIO embarqué, les structs binaires, le code critique pour l'ABI.
- `interface Point { x: f64; y: f64 }` — structure de données pour l'instant, mais peut être étendue avec des méthodes dans le futur (l'ABI passera alors à la vtable).

## Inférence de types

Le type est inféré s'il n'est pas explicitement spécifié :

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — struct anonyme
const s = "hello"            // → string
const n = 42                 // → number (= f64 sur desktop)
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[] (= f64[])
```

L'annotation explicite prévaut : `const i: i32 = 1` → `i32`.

## Conversion automatique des types numériques

Trois mécanismes, appliqués séquentiellement. Le premier applicable l'emporte.

### Mécanisme 1 — élargissement au niveau du type (let et const)

Fonctionne uniquement sur les types, ne regarde pas les valeurs. Inconditionnellement sûr.

| De | Vers | Commentaire |
|------|-----|---------|
| `i8`/`i16`/`i32` | `i64` | même signe, pas de perte |
| `u8`/`u16`/`u32` | `u64` | même signe, pas de perte |
| `u8` | `i16` | les 256 valeurs tiennent |
| `u16` | `i32` | les 65 536 tiennent |
| `u32` | `i64` | les 4,3 G tiennent |
| `i32`, `u32` | `f64` | pas de perte (mantisse 53 bits) |
| `f32` | `f64` | pas de perte |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 tient toujours dans i64
```

### Mécanisme 2 — analyse de valeur à la compilation (const uniquement)

Quand les deux opérandes sont des `const` avec des valeurs littérales connues et que le mécanisme 1 ne s'applique pas. Algorithme étape par étape — voir [Types numériques → Conversion automatique](./numbers.md).

### Mécanisme 3 — `as` explicite (pour let)

Si le mécanisme 1 ne s'applique pas aux variables `let` — une conversion explicite est requise :

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // erreur — pas d'élargissement au niveau du type
let c: f64 = (a + (b as i64)) as f64  // ok
```

Les détails de chaque mécanisme — sur la page [Types numériques](./numbers.md).

## Sous-pages

| Page | Description |
|------|-------------|
| [Types numériques](./numbers.md) | i8..i64, u8..u64, f32, f64, usize, number, conversion automatique, `as` |
| [Chaînes de caractères](./strings.md) | Chaînes UTF-8, littéraux, méthodes, std/string |
| [Types spéciaux](./special-types.md) | any, never, void, unknown |
| [Null](./null.md) | Types nullables, chaînage optionnel, `??` |
| [Tableaux](./arrays.md) | Dynamiques, fixes, Slice<T> |
| [Map et Set](./map-set.md) | Tables de hachage et ensembles |
| [Tuples](./tuples.md) | Tuples, étiquetés, readonly, optionnels, rest |
| [Clone](./clone.md) | Clonage explicite des valeurs possédées |
| [Alias de type](./type-aliases.md) | `type`, alias opaques, String Literal Union |
| [Types utilitaires](./utility-types.md) | Partial, Required, Readonly, Pick, Omit, Record, etc. |
| [Date](./date.md) | Type date/heure compatible héritage JS |

## Erreurs

| Erreur | Cause |
|-------|-------|
| `expected f64, got i32` | Types numériques incompatibles sans conversion automatique |
| `empty object literal is forbidden` | `{}` vide — utiliser `Map<K,V>` ou déclarer un type |
| `cannot use "void" as variable type` | `void` uniquement pour le type de retour de fonction |
| `non-nullable runtime union: string \| i32` | Union non-nullable interdite, utiliser une interface ou une union discriminée |

## Voir aussi

- [Variables : let / const](../02-syntax/variables/index.md) — impact de `let`/`const` sur les types et la conversion automatique
- [Modèle de mémoire](../05-memory/index.md) — propriété, `Ref<T>`, `Mut<T>`
- [Classes et interfaces](../04-classes/index.md) — typage nominal, génériques
- [Gestion des erreurs](../06-errors/index.md) — `throws`, `T | null` vs `T throws E`
