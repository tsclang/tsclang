# Bibliothèque standard

[← Haut](../index.md) | [Suivant →](./globals.md)

---

La bibliothèque standard de TSClang est un ensemble de modules avec l'espace de noms unifié `std/`. Tous les modules sont disponibles via `import { ... } from "std/<module>"`.

## Principes

| Principe | Description |
|-----------|-------------|
| **API unifiée** | Tout passe par `std/`, pas de séparation publique en niveaux |
| **Chargement paresseux** | Le compilateur charge les modules à la demande, ne parse pas l'intégralité de `std/` au démarrage |
| **Tree-shaking** | Seul le code utilisé est inclus dans le binaire |

```typescript
import { parse } from "std/json"   // ok
import { serve } from "std/net"    // ok
import { Regex } from "std/regex"  // ok
```

Les packages `@tsc/*` — wrappers C uniquement, pas des modules de la stdlib :

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // ok — wrapper C
import { parse } from "@tsc/json"            // erreur — utiliser std/json
```

## Import court

Tous les modules `std/` peuvent être importés sans préfixe :

```typescript
import { Thread } from "std/threads"   // forme explicite (recommandée)
import { Thread } from "threads"       // forme courte
```

Ordre de résolution : `./name.tsc` → `std/name` → erreur.

## Compatibilité par plateforme

| Module | Desktop | Embarqué (ARM) | Embarqué (AVR) | Note |
|--------|---------|----------------|----------------|------|
| Objets globaux | ✅ | ✅ | ✅ | `console`, `Math`, timers |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA, ≈5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — embarqué avec RNG uniquement |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM : sans horloge murale |
| `std/io` | ✅ | ❌ | ❌ | requiert un tas et un OS |
| `std/fs` | ✅ | ❌ | ❌ | requiert un système de fichiers |
| `std/net` | ✅ | ❌ | ❌ | requiert une pile TCP/IP |
| `std/ws` | ✅ | ❌ | ❌ | au-dessus de `std/net` |
| `std/threads` | ✅ | ❌ | ❌ | requiert des threads OS |
| `std/reactive` | ✅ | ❌ | ❌ | au-dessus de `std/threads` |
| `std/hal` | ✅ | ✅ | ✅ | GPIO, UART, SPI, I2C ; desktop — mock |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`, `pointer<T>`, `HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | atomiques sans OS |
| `std/avr` | ❌ | ✅ | ✅ | spécifique AVR |

**Légende :** ✅ — support complet, 🟡 — partiel, ❌ — indisponible.

Le compilateur vérifie la compatibilité à l'import :

```typescript
// target: avr
import { readFile } from "std/fs"   // erreur : std/fs n'est pas supporté sur AVR
import { gpio } from "std/embedded"  // ok
```

## Sous-pages

| Page | Description |
|------|-------------|
| [Objets globaux](./globals.md) | `console`, `Math`, `process`, timers, `performance` |
| [console](./console.md) | Journalisation : `log`, `error`, `warn`, `time`, `timeEnd`, `assert` |
| [Math](./math.md) | Constantes et fonctions mathématiques |
| [std/io](./io.md) | Flux : `Reader`, `Writer`, `Stream` |
| [std/fs](./fs.md) | Système de fichiers : lecture, écriture, répertoires |
| [std/net](./net.md) | Réseau : `fetch`, serveur HTTP, TCP/UDP |
| [std/ws](./ws.md) | WebSocket : client et serveur |
| [std/string](./string.md) | Unicode, encodage, formatage |
| [std/json](./json.md) | JSON : `parse` et `stringify` |
| [std/regex](./regex.md) | Expressions régulières NFA |
| [std/hal et embedded](./hal.md) | HAL, modules embarqués, `std/random`, `std/temporal`, `std/reactive` |

## Voir aussi

- [Modèle de mémoire](../05-memory/index.md) — propriété, `Ref<T>`, `Mut<T>`
- [Gestion des erreurs](../06-errors/index.md) — `throws`, `try`/`catch`
- [Modules](../08-modules/index.md) — `import`/`export`, `.d.tsc`, native
- [Build](../09-build/index.md) — plateformes, `tsc.package.json`
