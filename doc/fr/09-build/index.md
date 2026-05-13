# Système de build

[← Haut](../index.md) | [Suivant →](./projects.md)

---

Le système de build de TSClang compile les fichiers `.tsc` vers C99 et construit un binaire via CMake. Il prend en charge les applications desktop, les bibliothèques, les wrappers C pour les bibliothèques C natives, et les cibles embarquées (AVR, ARM, plates-formes rétro).

## Pipeline

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (ou .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

Structure de `outDir` :

```
build/desktop/
  c/              ← .c et .h générés
  CMakeLists.txt
  myapp           ← binaire (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## Démarrage rapide

```bash
npm install -g tsclang   # installer le compilateur
tsclang init myapp       # créer le projet
cd myapp
tsclang install          # installer les dépendances
tsclang run              # build et exécution
```

## Types de projets

| Type | Description | `"type"` | Point d'entrée |
|------|-------------|----------|-------------|
| **Exécutable** | Application | non spécifié (défaut) | `"main"` (requis) |
| **Bibliothèque TSClang** | Bibliothèque TSClang | `"library"` | `index.tsc` (convention) |
| **Wrapper C** | Wrapper sur une bibliothèque C | `"library"` | `index.d.tsc` |
| **Profil de plateforme** | Profil de plateforme | `"platform"` | `index.d.tsc` |

## Commandes CLI

| Commande | Alias | Description |
|---------|-------|-------------|
| `tsclang init` | — | Créer un nouveau projet |
| `tsclang build` | `b` | Build du projet |
| `tsclang run` | — | Build et exécution |
| `tsclang dev` | — | Mode watch |
| `tsclang install` | `i` | Installer les dépendances |
| `tsclang update` | `u` | Mettre à jour les dépendances |
| `tsclang remove` | `r` | Supprimer une dépendance |
| `tsclang clean` | `c` | Supprimer les artefacts de build |
| `tsclang lint` | `l` | Vérifier le formatage |
| `tsclang migrate` | — | Migration TypeScript → TSClang *(feuille de route)* |
| `tsclang lsp` | — | Language Server Protocol *(feuille de route)* |

## Sous-pages

| Page | Description |
|------|-------------|
| [Types de projets](./projects.md) | Exécutable, bibliothèque, wrapper C, profil de plateforme |
| [Configuration](./config.md) | Champs de `tsc.package.json`, builds, platformSettings |
| [CLI](./cli.md) | Commandes build, run, init, lint, migrate, lsp |
| [Gestionnaire de packages](./packages.md) | install, publish, search, workspaces, fichier de verrouillage |
| [Build embarqué](./embedded.md) | AVR, ARM, plates-formes rétro, binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt, profils debug/release, optimisation |

## C généré

```c
// build/desktop/c/main.c — généré depuis src/main.tsc
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## Erreurs

| Erreur | Cause |
|-------|-------|
| `cannot determine entry point` | Champ `"main"` non spécifié pour un exécutable |
| `unknown target arch '6502'` | Architecture inconnue sans profil de plateforme |
| `toolchain 'avr-gcc' not found in PATH` | Compilateur non installé |
| `dependency conflict` | Contraintes semver incompatibles |

## Voir aussi

- [Modules : Import/Export](../08-modules/import-export.md) — point d'entrée et initialisation
- [Mémoire : Propriété](../05-memory/ownership-types.md) — owned/borrow pendant l'FFI
- [Concurrence](../07-concurrency/index.md) — runtime async : libuv, coopératif, none
