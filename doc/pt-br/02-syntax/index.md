# Sintaxe

[Acima](../index.md) | [Próximo](./formatting.md)

---

Descrição completa da sintaxe do TSClang. A linguagem segue as convenções do TypeScript/JavaScript com extensões para gerenciamento seguro de memória.

## Seções

### Noções Básicas
- [Formatting](./formatting.md) — ponto e vírgula, indentação, aspas, linter
- [Truthy / Falsy](./truthy-falsy.md) — quais valores são considerados verdadeiros/falsos

### Variáveis
- [let / const](./variables/index.md) — mutabilidade, diferenças de propriedade

### Funções
- [Declaration](./functions/declaration.md) — `function`, parâmetros, tipo de retorno
- [Arrow](./functions/arrow.md) — sintaxe `=>`
- [Overloading](./functions/overload.md) — por tipo e contagem de parâmetros
- [Default Parameters](./functions/default-params.md) — valores padrão

### Operadores
- [Arithmetic](./operators/arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Assignment](./operators/assignment.md) — `=`, `+=`, `-=`, etc.
- [Comparison](./operators/comparison.md) — `==`, `!=`, `===`, `!==`
- [Logical](./operators/logical.md) — `&&`, `||`, `!`, `??`
- [Bitwise](./operators/bitwise.md) — `&`, `|`, `^`, `~`, `<<`, `>>`
- [Optional](./operators/optional.md) — `?.`, `??`, spread `...`
- [Operator Precedence](./operators/precedence.md) — tabela de precedência

### Laços
- [for](./loops/for.md) — laço clássico
- [for-of](./loops/for-of.md) — iteração de coleções
- [while / do-while](./loops/while.md) — laços condicionais
- [break / continue](./loops/break-continue.md) — controle de iteração

### Controle de Fluxo
- [switch](./match/switch.md) — seleção de valor
- [match](./match/index.md) — pattern matching

### Slices
- [Indexing and Slices](./slices.md) — `[]`, `[a..b]`, índices negativos

## Veja também

- [Tipos](../03-types/index.md) — sistema de tipos
- [Memória](../05-memory/index.md) — propriedade e verificador de empréstimo
