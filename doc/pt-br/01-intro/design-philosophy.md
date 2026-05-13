# Filosofia de Design

[Acima](./index.md) | [Próximo →](./quick-start.md) | [Anterior ←](./what-is-tsclang.md)

---

Em cada decisão de design, o TSClang segue uma hierarquia estrita de prioridades:

## Três Prioridades

1. **Segurança de memória** — propriedade, verificador de empréstimo, sem GC
2. **Performance e tipagem** — abstrações de custo zero, tipos estritos
3. **Sintaxe TS** — preservar o máximo possível, mas não ao custo de #1 e #2

O objetivo não é "código TS existente compila sem alterações", mas "desenvolvedor TS reconhece a sintaxe e se sente em casa".

## A Sintaxe TS Tem Prioridade

Emprestar sintaxe do Rust, C, Go — somente se o TS não tiver um construto adequado.

Novos conceitos são embutidos através de sintaxe compatível com TS:

| Conceito | Rust | TSClang |
|----------|------|---------|
| Empréstimo imutável | `&T` | `Ref<T>` |
| Empréstimo mutável | `&mut T` | `Mut<T>` |
| Variável mutável | `let mut` | `let mut` |
| Somente leitura | `let` (padrão) | `const` / `readonly` |

Classes são preservadas, apesar da ausência no Rust — elas existem no TS e são familiares aos desenvolvedores.

## Pergunta para Cada Decisão

> *Isso pode ser expresso através da sintaxe TS existente ou de sua extensão natural?*

Se sim — use a sintaxe TS. Se não — encontre a extensão mínima que não conflita com o TS.

## Compatibilidade Retroativa

Código TS nativo simples sem bibliotecas externas deve compilar ou exigir correções triviais que permanecem válidas em TS:

```typescript
let a = 10          // pode exigir anotação explícita
let a: number = 10  // válido tanto em TS quanto em TSClang
```

Código com classes, objetos, arrays, laços, template literals — funciona como está ou com alterações mínimas.

## Veja também

- [O que é o TSClang](./what-is-tsclang.md) — visão geral da linguagem
- [Modelo de Memória](../05-memory/index.md) — como funcionam propriedade e verificador de empréstimo
- [Guia de Migração](../12-migration/index.md) — portando código TS para TSClang
