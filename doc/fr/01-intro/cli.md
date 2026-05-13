# CLI — Aperçu des commandes

[← Haut](./index.md) | [Précédent ←](./quick-start.md)

---

## Liste des commandes

| Commande | Alias | Description |
|---------|-------|-------------|
| `tsclang init` | — | Créer un nouveau projet |
| `tsclang build` | `b` | Build du projet |
| `tsclang run` | `r` | Build et exécute |
| `tsclang lint` | `l` | Vérifier le formatage |
| `tsclang migrate` | — | Migration TypeScript → TSClang *(feuille de route)* |
| `tsclang lsp` | — | Language Server Protocol pour IDE *(feuille de route)* |

Alias :

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

Crée un projet à partir d'un modèle.

```bash
tsclang init myapp                    # exécutable (par défaut)
tsclang init mylib --library          # bibliothèque TSClang
tsclang init sqlite3 --declaration    # C-wrapper (wrapper sur une bibliothèque C)
tsclang init                          # dans le répertoire courant
```

Raccourcis : `-l` (library), `-d` (declaration).

## tsclang build

Compile `.tsc` → `.c` → binaire (par défaut).

```bash
tsclang build                  # build le build par défaut
tsclang build <name>           # build un build spécifique depuis la configuration
tsclang build hello.tsc        # fichier unique
tsclang build --emit c         # génération C uniquement
tsclang build --emit binary    # C + compilation en binaire (par défaut)
tsclang build --emit hex       # C + avr-gcc → .hex (pour AVR)
tsclang build --outDir ./dist  # remplacer outDir
tsclang build --target desktop # spécifier explicitement la cible
tsclang build --clean          # rebuild complet (sans cache)
```

## tsclang run

Build et exécute le binaire. Équivalent à `tsclang build` + exécution.

```bash
tsclang run
tsclang run -- args...         # passer des arguments au programme
```

Uniquement pour `emit: "binary"`.

## tsclang lint

Vérifie le style de code. Pour la CI — `tsclang lint` (sans `-fix`) retourne le code de sortie 1 en cas de violations.

```bash
tsclang lint          # vérifier sans modifications
tsclang lint --fix    # formater le code en place (comme prettier / gofmt)
```

Différence avec `tsclang build` :

| Commande | Ce qu'il vérifie |
|---------|---------------|
| `tsclang build` | Erreurs sémantiques, formatage ignoré |
| `tsclang lint` | Sémantique + avertissements de style, code de sortie 1 en cas de violations |
| `tsclang lint --fix` | Formate le code automatiquement |

## tsclang migrate *(feuille de route)*

Migration de code TypeScript vers TSClang.

```bash
tsclang migrate ./src            # montrer ce qui va changer (dry-run)
tsclang migrate ./src --fix      # appliquer les changements
tsclang migrate ./src --check    # mode CI : code de sortie 1 si des incompatibilités existent
```

## tsclang lsp *(feuille de route)*

Language Server Protocol pour IDE (VS Code, Neovim, etc.).

```bash
tsclang lsp               # transport stdio
tsclang lsp --port 7777   # transport TCP
```

## Voir aussi

- [Démarrage rapide](./quick-start.md) — installation et premier projet
- [Système de build](../09-build/index.md) — configuration, profils, plateformes
- [Guide de migration](../12-migration/index.md) — portage de code TS
