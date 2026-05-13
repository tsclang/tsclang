# Arquitetura do Compilador

[Acima](../index.md) | [Próximo](./phases.md)

---

Arquitetura do compilador TSClang para contribuidores. O compilador traduz `.tsc` para C99, delegando otimizações de máquina ao compilador C (gcc/clang/avr-gcc).

## Pipeline

```
fonte .tsc
    ↓
Parse (lexer + parser)      →  AST
    ↓
Passagem de decoradores     →  AST modificado
    ↓
Typecheck                   →  AST tipado
    ↓
Lower to IR                 →  IR tipo SSA (blocos básicos)
    ↓
Análise de propriedade      →  borrow checker + injeção de ARC
    ↓
Codegen                     →  C99 + #line + CMakeLists.txt
    ↓
Compilador C                →  binary / .hex
```

## Código-fonte

| Caminho | Propósito |
|------|---------|
| `src/compiler/lexer.js` | Lexer |
| `src/compiler/parser.js` | Parser → AST |
| `src/compiler/types.js` | Tipos auxiliares e mangling |
| `src/compiler/codegen.js` | Ponto de entrada do codegen, classe Context |
| `src/compiler/codegen/top-level/` | Classes, funções, interfaces, enum, aliases de tipo |
| `src/compiler/codegen/stmt/` | Declarações de variáveis, fluxo de controle, desestruturação, match |
| `src/compiler/codegen/expr/` | Despachante de expressões, operadores, atribuição, literais |
| `src/compiler/codegen/calls/` | Chamadas: métodos, console, stdlib, builtin, conversões, concorrência |
| `src/compiler/codegen/types/` | Resolução de tipos, inferência, auxiliares |
| `src/compiler/codegen/misc/` | Auxiliares, new-expr, closures, arrays |
| `src/compiler/codegen/async/` | Async: statements, emit, geradores, auxiliares, scanning |
| `src/compiler/codegen/generics.js` | Monomorfização de genéricos |
| `src/runtime/runtime.h` | Arquivo de cabeçalho do runtime C |

## Metodologia de Testes

Cada componente é implementado em um ciclo:

```
1. Tests     — corpus (input.tsc → expected.c / expected.error)
2. Implementation — até todos os testes passarem
3. Log       — log/<component>.md: decisões, problemas, mudanças
```

Corpus de testes: `test/cases/phase0–phase19`, total de 1028 testes. Formato descrito em `test/CORPUS.md`.

## Subpáginas

| Página | Descrição |
|------|-------------|
| [Fases de Compilação](./phases.md) | Parse → AST → Decorator → Typecheck → IR → Ownership → Codegen |
| [Name mangling](./name-mangling.md) | Esquema formal, codificação de tipos, slug de módulo, colisões |
| [Informações de debug](./debug.md) | Diretivas `#line`, servidor DAP, debug embarcado |
| [Otimização](./optimization.md) | Níveis O0–O3/Os, monomorfização do lado do consumidor, incremental *(roadmap)* |

## Erros

| Erro | Causa |
|-------|-------|
| `type name must start with uppercase letter` | Nome de classe/interface não está em PascalCase |
| `type name uses reserved mangling prefix` | Uso de `ref_`, `mut_`, `arc_`, `opt_`, `arr_` no nome do tipo |
| `error[TSC-EXXX]` | Código de erro estável — pesquisável na documentação |

## Veja também

- [Decoradores](../04-classes/decorators.md) — passagem de decoradores: algoritmo e limitações
- [Modelo de Memória](../05-memory/index.md) — propriedade, borrow checker, instruções IR
- [Sistema de Build](../09-build/index.md) — CMake, perfis, targets embarcados
