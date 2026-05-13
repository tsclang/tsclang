# Sistema de Módulos

[Acima](../index.md) | [Próximo](./import-export.md)

---

O TSClang usa um **sistema de módulos** compatível com TypeScript em sintaxe: `export` nomeado / `import { } from ""`. Um arquivo = um módulo. O compilador gera automaticamente `#include`, declarações antecipadas e funções de inicialização na saída C.

## Princípios

- **Um arquivo — um módulo** — sem `namespace`, sem `module`
- **Apenas exportações nomeadas** — `export default` proibido (C requer um nome explícito para cada símbolo)
- **Importações circulares permitidas** — o compilador gera declarações antecipadas em `.h`
- **Arquivos `.d.tsc`** — declarações para interoperabilidade com C (análogo ao `.d.ts` em TypeScript)
- **Aliases de caminho** — nomes curtos `#/`, `~/` em vez de `../../../`

## Importação e Exportação

```typescript
// math.tsc — módulo com exportações
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — importação
import { PI, add } from "./math"
console.log(add(1, 2))
```

## Ponto de Entrada

O ponto de entrada é definido pelo campo `"main"` em `tsc.package.json`. O código de nível superior do arquivo de entrada torna-se o corpo de `main()` em C:

```typescript
const a: i32 = 1
console.log(a)
```

```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

## Inicialização de Módulos

O compilador constrói um grafo de dependências e realiza **ordenação topológica**. Cada módulo com variáveis de nível de módulo recebe uma função `_init()`. O resultado é uma única `tsc_init_all()` com a ordem de chamada correta.

## Interoperabilidade com C

Para interação com bibliotecas C, o TSClang fornece vários mecanismos:

| Mecanismo | Propósito |
|----------|------------|
| `.d.tsc` | Declarações de tipos, funções e constantes C |
| `native` | Código C inline (verbatim) |
| `unsafe {}` | Desativação do verificador de empréstimo/tipos |
| `FnPtr<T>` | Ponteiros de função para callbacks C |
| `@platform` | Compilação condicional por plataforma |

## Subpáginas

| Página | Descrição |
|----------|----------|
| [Importação / Exportação](./import-export.md) | Exportação/importação nomeada, importação de namespace, `import type`, inicialização, importações circulares, aliases de caminho |
| [Arquivos .d.tsc](./d-tsc.md) | Declarações para interop com C: struct, tipo opaco, funções, constantes, MMIO |
| [native — C Inline](./native.md) | Sintaxe, interpolação, limitações, inserções de assembly |
| [unsafe {} — Desativando Verificações](./unsafe.md) | Quando usar, o que desativa, diferença do `native` |
| [Callbacks e FnPtr\<T\>](./callbacks.md) | Ponteiros de função, macros TSC_CLOSURE_*, ponte de closure |
| [@platform — Compilação Condicional](./platform.md) | Implementações dependentes de plataforma, estrutura de pacotes |

## Saída C

```c
// resultado da compilação de múltiplos módulos
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... código de nível superior de main.tsc ...
    return 0;
}
```

## Erros

| Erro | Causa |
|--------|---------|
| `cannot determine entry point` | Campo `"main"` ausente em `tsc.package.json` |
| `main file not found: src/main.tsc` | Arquivo de `"main"` não existe |
| `circular initialization dependency detected` | Ciclo através de variáveis de nível de módulo |
| `export default is not allowed` | Tentativa de usar exportação padrão |
| `native block — C code inserted verbatim` | Aviso em todo bloco `native` |

## Veja Também

- [Sintaxe: Variáveis](../02-syntax/variables/index.md) — variáveis de nível de módulo
- [Memória: Propriedade](../05-memory/ownership-types.md) — owned/borrow ao passar entre módulos
- [Concorrência](../07-concurrency/index.md) — segurança de threads para variáveis de nível de módulo
