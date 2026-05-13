# Démarrage rapide

[← Haut](./index.md) | [Suivant →](./cli.md) | [Précédent ←](./design-philosophy.md)

---

## Prérequis

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16 (pour la compilation binaire)
- **Compilateur C** — gcc, clang, ou avr-gcc (pour AVR)

## Installation

```bash
npm install -g tsclang

tsclang --version
```

Exécution sans installation :

```bash
npx tsclang build
```

## Création d'un projet

```bash
tsclang init myapp
cd myapp
```

Crée la structure :

```
myapp/
  tsc.package.json
  src/
    main.tsc
```

`tsc.package.json` :

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc"
}
```

## Hello world

`src/main.tsc` :

```typescript
console.log("Hello world")
```

## Build et exécution

```bash
tsclang build                  # génère C + compile en binaire
tsclang build --emit c         # génération C uniquement (pas de compilation)
tsclang run                    # build et exécute
```

Résultat du build :

```
dist/
  main.c              # code C généré
  CMakeLists.txt      # pour un build manuel
  myapp               # binaire (si --emit binary)
```

## Build d'un fichier unique

Sans `tsc.package.json` — passez simplement le fichier :

```bash
tsclang build hello.tsc
```

## Prochaines étapes

- [Syntaxe](../02-syntax/index.md) — constructions du langage
- [Modèle de mémoire](../05-memory/index.md) — propriété, emprunt, `Ref<T>`
- [CLI](./cli.md) — toutes les commandes

## Voir aussi

- [CLI](./cli.md) — description complète des commandes
- [Système de build](../09-build/index.md) — configuration, plateformes, profils
