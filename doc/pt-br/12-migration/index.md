# Migração: TypeScript → TSClang

[Acima](../index.md) | [Próximo](./automatic.md)

---

Guia para desenvolvedores migrando de TypeScript para TSClang. Descreve conversões automáticas e manuais, padrões incompatíveis e novas capacidades.

## Visão Geral do Processo

O TSClang busca máxima compatibilidade com a sintaxe TypeScript. A maioria do código TypeScript é portada sem mudanças ou com edições mínimas. O processo de migração é dividido em três estágios:

1. **Correções automáticas** — `tsclang migrate` aplica transformações mecânicas
2. **Correções manuais** — padrões que não podem ser automatizados com segurança
3. **Padrões incompatíveis** — construtos sem análogo direto, exigindo redesign

## Verificação Rápida

```bash
tsclang migrate ./src            # dry-run: mostrar o que mudará
tsclang migrate ./src --fix      # aplicar correções automáticas
tsclang migrate ./src --check    # CI: exit 1 se incompatibilidades existirem
```

## O que Migra Inalterado

Interfaces, funções com tipos, arrow functions, classes (sem `extends`), genéricos, `try/catch`, template strings, desestruturação — tudo isso funciona como em TypeScript. Detalhes em [Migração Manual](./manual.md).

## Subpáginas

| Página | Descrição |
|------|-------------|
| [Migração Automática](./automatic.md) | `tsclang migrate`: dry-run, --fix, --check, lista de auto-transformações |
| [Migração Manual](./manual.md) | O que funciona como está e o que requer correções manuais |
| [Padrões Incompatíveis](./incompatible.md) | Construtos sem análogo e alternativas |
| [Novos Recursos](./new-features.md) | Propriedade, Ref/Mut/Shared, match, throws e mais |

## Erros

| Erro | Causa |
|-------|-------|
| `undefined is not defined` | Usando `undefined` — substitua por `null` |
| `throw requires Error instance` | Lançando string ou número — envolva em `new Error()` |
| `export default is not supported` | Substitua por exportação nomeada |
| `extends is not supported` | Herança de classe — substitua por composição |

## Veja também

- [Introdução: O que é TSClang](../01-intro/what-is-tsclang.md) — visão geral da linguagem e filosofia
- [Build: CLI](../09-build/cli.md) — comandos `tsclang build`, `tsclang migrate`
- [Modelo de Memória](../05-memory/index.md) — propriedade, borrow checker, Ref/Mut/Shared
