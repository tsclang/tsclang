# Gestion des erreurs

[← Haut](../index.md) | [Suivant →](./throw-try.md)

---

TSClang utilise la syntaxe `throw`/`try`/`catch`/`finally` comme TypeScript, mais compile les erreurs en **structures Result en C** — sans `setjmp`/`longjmp`. Cela offre :

- **Zéro coût** : pas de sauvegarde de registres à chaque bloc `try`
- **Interop C sûre** : pas de `longjmp` à travers du code C tiers
- **Propriété correcte** : flux de contrôle ordinaire, le compilateur connaît toutes les variables possédées

## Principe

Chaque fonction susceptible d'échouer déclare `throws` dans sa signature. Dans la sortie C, le type de retour est enveloppé dans une structure Result avec un champ `ok` et une union pour la valeur ou l'erreur. Les gestionnaires `try`/`catch` se compilent en `if/else` ordinaires sur le champ `ok` et `_kind`.

## Concepts clés

### Déclaration throws

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Sans `throws` — une fonction ne peut pas contenir `throw` (erreur de compilation).

### Error — classe de base

Toutes les erreurs héritent de `Error` :

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // desktop uniquement — points de throw "__FILE__:__LINE__"
}
```

### Opérateurs ? et !

| Opérateur | Sémantique | Requiert `throws` ? |
|----------|-----------|-------------------|
| `expr?`  | Propager — retourner l'erreur depuis la fonction courante | Oui |
| `expr!`  | Déballer — panique (`abort()`) en cas d'erreur | Non |

### Structure Result en C

```c
typedef struct {
    bool ok;
    union {
        Response value;
        struct {
            _fetch_err_kind _kind;
            union {
                IOError io;
                NetworkError net;
            } _err;
        };
    };
} _Result_Response_IOError_NetworkError;
```

### Propriété avec les erreurs

Le compilateur trace toutes les variables possédées dans un bloc `try`. En cas d'erreur, toutes les variables possédées déjà initialisées sont libérées via un flux de contrôle ordinaire (`goto cleanup`).

## Sous-pages

| Page | Description |
|----------|----------|
| [throw / try / catch / finally](./throw-try.md) | Syntaxe de gestion des erreurs, catch par type, finally |
| [Structures Result](./result.md) | Result<T, E>, union discriminée, représentation C |
| [Opérateurs ? et !](./operators.md) | Propager, déballer/paniquer, sortie C |

## Erreurs

| Erreur | Cause |
|--------|---------|
| `throw in non-throws function` | `throw` dans une fonction sans `throws` |
| `? operator in non-throws function` | Opérateur `?` sans `throws` dans la fonction courante |
| `extern "C" cannot throw` | `throws` dans une fonction `extern "C"` |
| `throw/return in finally` | `throw` ou `return` dans un bloc `finally` |
| `error.stack on embedded` | Accès à `stack` sur une plateforme embarquée |

## Restrictions

- `throw` est interdit dans les fonctions sans `throws`
- `?` est interdit dans une fonction sans `throws`
- Les exceptions ne peuvent pas être propagées à travers les frontières d'interop C — `extern "C"` ne peut pas contenir `throws`
- `finally` ne peut pas contenir `throw` ou `return`
- `error.stack` n'est pas disponible sur les plateformes embarquées

## Voir aussi

- [Modèle de mémoire : Libération automatique](../05-memory/auto-drop.md) — `goto cleanup` avec plusieurs points de sortie
- [Modèle de mémoire : Propriétaire](../05-memory/owner.md) — déplacement et propriété avec les erreurs
- [Classes](../04-classes/index.md) — Héritage d'Error et types d'erreur personnalisés
