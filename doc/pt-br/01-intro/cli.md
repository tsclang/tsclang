# CLI — Visão geral dos comandos

[← Acima](./index.md) | [Anterior ←](./quick-start.md)

---

## Lista de comandos

| Comando | Alias | Descrição |
|---------|-------|-----------|
| `tsclang init` | — | Criar novo projeto |
| `tsclang build` | `b` | Compilar projeto |
| `tsclang run` | `r` | Compilar e executar |
| `tsclang lint` | `l` | Verificar formatação |
| `tsclang migrate` | — | Migração TypeScript → TSClang *(roadmap)* |
| `tsclang lsp` | — | Language Server Protocol para IDE *(roadmap)* |

Aliases:

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

Cria um projeto a partir de um template.

```bash
tsclang init myapp                    # executável (padrão)
tsclang init mylib --library          # biblioteca TSClang
tsclang init sqlite3 --declaration    # C-wrapper (wrapper sobre biblioteca C)
tsclang init                          # no diretório atual
```

Flags curtas: `-l` (biblioteca), `-d` (declaração).

## tsclang build

Compila `.tsc` → `.c` → binário (padrão).

```bash
tsclang build                  # compilar build padrão
tsclang build <name>           # compilar build específico da configuração
tsclang build hello.tsc        # arquivo único
tsclang build --emit c         # apenas geração de C
tsclang build --emit binary    # C + compilar para binário (padrão)
tsclang build --emit hex       # C + avr-gcc → .hex (para AVR)
tsclang build --outDir ./dist  # sobrescrever outDir
tsclang build --target desktop # especificar alvo explicitamente
tsclang build --clean          # rebuild completo (sem cache)
```

## tsclang run

Compila e executa o binário. Equivalente a `tsclang build` + execução.

```bash
tsclang run
tsclang run -- args...         # passar argumentos para o programa
```

Apenas para `emit: "binary"`.

## tsclang lint

Verifica o estilo de código. Para CI — `tsclang lint` (sem `-fix`) retorna código de saída 1 em caso de violações.

```bash
tsclang lint          # verificar sem alterações
tsclang lint --fix    # formatar código no local (como prettier / gofmt)
```

Diferença do `tsclang build`:

| Comando | O que verifica |
|---------|----------------|
| `tsclang build` | Erros semânticos, formatação ignorada |
| `tsclang lint` | Semântica + avisos de estilo, exit 1 em violações |
| `tsclang lint --fix` | Formata código automaticamente |

## tsclang migrate *(roadmap)*

Migração de código TypeScript para TSClang.

```bash
tsclang migrate ./src            # mostrar o que vai mudar (dry-run)
tsclang migrate ./src --fix      # aplicar mudanças
tsclang migrate ./src --check    # modo CI: exit 1 se houver incompatibilidades
```

## tsclang lsp *(roadmap)*

Language Server Protocol para IDE (VS Code, Neovim, etc.).

```bash
tsclang lsp               # transporte stdio
tsclang lsp --port 7777   # transporte TCP
```

## Veja também

- [Início rápido](./quick-start.md) — instalação e primeiro projeto
- [Sistema de build](../09-build/index.md) — configuração, perfis, plataformas
- [Guia de migração](../12-migration/index.md) — portar código TS
