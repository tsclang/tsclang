# Qu'est-ce que TSClang

[← Haut](./index.md) | [Suivant →](./design-philosophy.md)

---

TSClang est un langage compilé avec une syntaxe TypeScript qui traduit les fichiers `.tsc` en code C lisible et génère automatiquement un `CMakeLists.txt`.

## Pourquoi

De nombreux développeurs passent de TypeScript à C — et c'est douloureux. C manque d'un écosystème décent : pas de gestionnaire de packages, pas de cross-compilation pratique, pas de vérifications de sécurité mémoire intégrées.

TSClang résout cela :

- **Syntaxe familière** — un développeur TS reconnaît les constructions et est immédiatement productif
- **Mémoire sûre** — propriété et vérificateur d'emprunt à la compilation, pas de GC
- **Écosystème unifié** — dépendances, cross-compilation, builds prêts à l'emploi
- **Sortie C lisible** — peut être inspectée, déboguée et combinée avec du C écrit à la main

## Pour quoi

**Maintenant :**

- Code serveur — HTTP, sockets, backends
- Bureau — CLI/TUI, gestionnaires de fichiers, applications bureautiques

**Important :**

- Niveau système — pilotes, OS
- Embarqué — Arduino, ESP, Raspberry Pi
- Jeux — via OpenGL, DirectX

**Rêve :**

- Multiplateforme — Windows, Linux, Mac, Android, iOS
- Plateformes rétro — ZX Spectrum, NES, Sega, MS-DOS

## Extension de fichier

`.tsc` — fichier source TSClang.

```typescript
// hello.tsc
console.log("Hello world")
```

Compile en :

```c
// hello.c
#include "runtime.h"
int main(void) {
    tsc_console_log(tsc_string_from_cstr("Hello world"));
    return 0;
}
```

## Voir aussi

- [Philosophie de conception](./design-philosophy.md) — trois priorités du langage
- [Démarrage rapide](./quick-start.md) — installation et premier projet
- [Modèle de mémoire](../05-memory/index.md) — propriété et vérificateur d'emprunt
