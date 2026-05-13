# Plano de documentação do TSClang

## Objetivo

Criar documentação completa para desenvolvedores em inglês baseada na especificação.
A documentação deve ser prática, orientada ao usuário (focada no desenvolvedor), não focada no autor do compilador.

## Audiência-alvo

1. Um desenvolvedor que vem do TypeScript e quer começar a escrever em TSClang
2. Um desenvolvedor avaliando a linguagem para desenvolvimento embarcado
3. Um desenvolvedor buscando uma API específica (método de string, tipo de propriedade, servidor HTTP)

## Princípios de redação

- Idioma: inglês
- Exemplos de código: funcionais, mínimos, com comentários em inglês
- Estrutura: do simples ao complexo
- Cada seção é autocontida — pode ser lida de forma independente
- Referências cruzadas entre seções para estudo aprofundado

## Estrutura de arquivos

**Estrutura aninhada:** cada método, função, tipo e construção tem seu próprio arquivo.
Sem páginas monolíticas de 50 KB. Se um método tem 3 variantes de chamada — são 3 arquivos
dentro do diretório do método.

Exemplo de estrutura:

```
doc/
  02-syntax/
    index.md                        # visão geral da seção + links
    variables/
      let.md
      const.md
    functions/
      declaration.md
      arrow.md
      anonymous.md
      iife.md
      default-params.md
      overload.md
        by-type.md
        by-count.md
        priority.md
    loops/
      for.md
      for-of.md
      while.md
      do-while.md
      break-continue.md
    match/
      syntax.md
      patterns/
        literal.md
        range.md
        destructuring.md
        wildcard.md
        union.md
      exhaustiveness.md
      vs-switch.md
    operators/
      arithmetic.md
      assignment.md
      comparison.md
      logical.md
      bitwise.md
      ternary.md
      optional-chaining.md
      nullish-coalescing.md
      spread.md
    truthy-falsy.md
    slices.md
```

## Regras de conteúdo dos arquivos

Cada arquivo descreve **um** método / função / construção / tipo e deve conter:

### 1. Descrição completa

O que é, por que é necessário, como funciona. Sem enchimento — concreto e direto.
Mencione casos extremos e comportamentos não óbvios.

### 2. Assinatura / Sintaxe

Assinatura exata com tipos de parâmetros e tipo de retorno.
Se um método tem várias variantes (sobrecargas) — descreva cada uma separadamente.

### 3. Exemplos de uso ou implementação

Pelo menos um exemplo funcional por variante.
Os exemplos devem ser mínimos — sem contexto desnecessário.
Cada exemplo com o resultado indicado (comentário `// →`).

### 4. Saída em C

Para cada exemplo — como compila para C.
Mostre o código C gerado para que o desenvolvedor entenda o que acontece sob o capô.
Especialmente importante para construções de propriedade (move, borrow, drop, cleanup).

### 5. Erros e correções

Erros típicos do compilador quando usado incorretamente.
Formato: `código errôneo → texto de erro → código corrigido`.
Deve incluir a sugestão do compilador.

### 6. Navegação e links

Cada arquivo deve conter links de navegação:

**Barra de navegação** — no topo do arquivo, após o título:

```markdown
[← Acima](./index.md) | [Próximo →](./filter.md) | [Anterior ←](./sort.md)
```

Três links:
- **Acima** (`←`) — salta para o `index.md` do diretório pai (visão geral da seção)
- **Próximo** (`→`) — salta para o próximo arquivo neste nível (em ordem lógica, não alfabética)
- **Anterior** (`←`) — salta para o arquivo anterior neste nível

O primeiro arquivo de uma seção não tem "Anterior", o último não tem "Próximo".

**Referências cruzadas** — no final do arquivo, seção "Veja também":

```markdown
## See Also

- [filter](./filter.md) — filtering elements
- [reduce](./reduce.md) — accumulation
- [forEach](./for-each.md) — iteration without result
```

Links para construções relacionadas em outras seções — com caminho completo:

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) — borrow of an element
```

**index.md em cada diretório** — visão geral da seção com links para todos os arquivos filhos.
Serve como ponto de entrada para navegação de cima para baixo.

Template de arquivo de exemplo:

```markdown
# map

Creates a new array by applying a function to each element of the source array.

## Signature

\`\`\`typescript
arr.map<U>(f: (Ref<T>) => U): U[]
\`\`\`

The callback receives `Ref<T>` — a borrow of the element, not ownership.

## Examples

### Basic Usage

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
const doubled = nums.map(x => x * 2)
// → [2, 4, 6]
\`\`\`

### C Output

\`\`\`c
int32_t* doubled = malloc(3 * sizeof(int32_t));
for (size_t i = 0; i < 3; i++) {
    doubled[i] = nums[i] * 2;
}
\`\`\`

### Type Conversion

\`\`\`typescript
const names: string[] = users.map(u => u.name)
// → ["Alice", "Bob"]
\`\`\`

## Errors

### Callback Mutates Element

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => { x++ })  // error: cannot assign to Ref<i32>
\`\`\`

Fix:

\`\`\`typescript
const nums: i32[] = [1, 2, 3]
nums.map(x => x * 2)  // return a new value
\`\`\`

## See Also

- [filter](./filter.md)
- [reduce](./reduce.md)
- [flatMap](./flat-map.md)
```

---

## Estrutura da documentação

### 01-intro.md — Introdução ao TSClang

**Objetivo:** explicar o que é, por que existe e fornecer um primeiro exemplo funcional.

- O que é TSClang (sintaxe de TS → C, segurança do Rust, ecossistema npm)
- Filosofia de design (3 prioridades: segurança, desempenho, sintaxe TS)
- Casos de uso (desktop, embarcado, servidores, plataformas retro)
- Início rápido: instalação, `hello world`, compilar e executar
- Requisitos (Node.js, CMake, gcc/clang)
- Visão geral da CLI: `tsclang build`, `tsclang lint`, `tsclang lsp`

**Fonte:** `spec/01-intro.md`

---

### 02-syntax.md — Sintaxe

**Objetivo:** descrição completa da sintaxe da linguagem.

- Formatação (ASI, K&R, indentação, aspas, vírgula final)
- Variáveis: `let` / `const` — diferença no contexto da propriedade
- Funções: `function`, arrow, anônima, IIFE
- Parâmetros: padrão, rest
- Sobrecarga de funções (por tipo e quantidade, prioridade de resolução)
- Operadores: aritméticos, atribuição, comparação, lógicos, bit a bit
- Truthy / Falsy (tabela por tipo)
- Laços: `for`, `for-of`, `while`, `do-while`, `break`/`continue`, etiquetados
- `switch` / `match` — comparação, exaustividade
- Operador spread (arrays, objetos, regras de propriedade)
- Indexação e slices (arrays e strings, índices negativos)

**Fonte:** `spec/02-syntax.md`

---

### 03-types.md — Sistema de tipos

**Objetivo:** descrição da tipagem, todos os tipos e conversões.

- Tipagem estrutural vs nominal (`type`, `interface`, `class`)
- Inferência de tipos
- Tipos numéricos (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`)
  - Literais (hex, binário, octal, separadores `_`)
  - Conversão automática (3 mecanismos: widening, tempo de compilação, `as`)
  - `usize` — tipo de plataforma
  - `number` = `f64` (sobrescrevível)
  - Advertências de desempenho em AVR
- `string` — bytes UTF-8, layout de C, indexação, iteração, métodos integrados
- Tipos especiais: `void`, `never`, `any`
- Null: `T | null`, opcional `?`, encadeamento opcional `?.`, coalescência nula `??`
  - Representação em C de `T | null` (struct com flag)
  - Padrões embarcados: valor sentinela, flag separada
- Conversão de tipos: número ↔ string, funções compatíveis com JS (`parseInt`, `parseFloat`)
- `Date` — criação, métodos, formatação
- Arrays: `T[]` (dinâmico), `T[N]` (fixo), métodos, métodos funcionais
- `Slice<T>` / `MutSlice<T>` — visão sem cópia
- `Map<K,V>`, `Set<T>` — API, propriedade, padrões embarcados
- `Object` — métodos estáticos
- Tuplas: fixas, etiquetadas, readonly, opcionais, rest, spread
- `Clone` — interface, `clone()`, `structuredClone()`
- Apelidos de tipos (`type`)
- União de literais de string
- Tipos utilitários: `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`
- `Buffer`, `DataView`

**Fonte:** `spec/03-types.md`

---

### 04-classes.md — Classes, interfaces, enumeração, genéricos

**Objetivo:** o sistema de objetos da linguagem.

- Genéricos: sintaxe, limites (`implements`/`extends`), monomorfização, propriedade com genéricos
- Métodos de extensão: declaração, importação, conflitos
- Enumeração: numérica, de string, `const enum`, utilidades, em switch/match
- Interfaces: dados vs contrato com métodos, ponteiro gordo, vtable
- `instanceof` — estreitamento de tipo via vtable
- Classes:
  - Sem herança (exceto `extends Error`), composição
  - Modificadores: `public`, `private`, `static`, `mut`, `move`
  - Semântica de `this` e acesso a campos
  - Campos `readonly`
  - Construtor: autogeração, explícito, `private`
  - Padrão de objeto de valor
  - Padrão builder com `move`
- Alinhamento: `@packed`, `@align(N)`, diagnósticos de preenchimento
- Decoradores: visão geral, referência à seção completa

**Fonte:** `spec/04-classes.md`, `spec/13-decorators.md`

---

### 05-memory.md — Modelo de memória e propriedade

**Objetivo:** a característica principal da linguagem — gerenciamento seguro de memória.

- Tipos de propriedade: `T` (Proprietário), `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>`, `Slice<T>`
- Regras básicas: primitivos são copiados, tipos complexos — propriedade
- Proprietário (T): move em atribuição e passagem
- `Ref<T>`: empréstimo imutável, regras, proibido em campos, padrões de solução
- `Mut<T>`: empréstimo mutável, um por vez
- `Shared<T>`: ARC, `Weak<T>` para quebrar ciclos
- Regras do verificador de empréstimo (4 regras)
- Matriz de passagem de argumentos (let/const/Ref/Mut/Shared → Ref/Mut/T/Shared)
- Interior Mutability — por que não está presente
- `@static let` — estado global mutável
- Restrição de escopo (sem anotações de ciclo de vida): 4 regras
- Drop automático e `goto cleanup`
- `Iterable<T>` — tipos iteráveis definidos pelo usuário
- Acesso a campos e desestruturação (empréstimo vs move)
- Slices (empréstimo vs próprio)
- Move a partir de array, mutação durante empréstimo
- Retornar empréstimo de método
- Closures: regras de captura, lista de captura explícita, closure Mut via await

**Fonte:** `spec/05-memory.md`

---

### 06-errors.md — Tratamento de erros

**Objetivo:** sistema de erros — baseado em Result sem setjmp/longjmp.

- Princípio: `throw`/`try`/`catch` em TS → estruturas Result em C
- Declarar `throws` na assinatura
- `Error` — classe base, `error.stack`
- `throw`, `try`/`catch`/`finally`
- Catch de união, tratamento exaustivo
- Operador `?` (propaga)
- Operador `!` (unwrap/panic)
- Saída em C: estruturas Result, `if/else` sobre `ok` e `_kind`
- Propriedade durante erros (limpeza via `goto`)
- Limitações

**Fonte:** `spec/06-errors.md`

---

### 07-concurrency.md — Concorrência

**Objetivo:** três níveis de concorrência e como usá-los.

- Visão geral de três mecanismos (async/await, threads, ISR)
- **Async/Await:**
  - Arquitetura do runtime async (máquinas de estado)
  - Tamanho da máquina de estado, segurança de pilha em embarcado
  - `Promise<T>`: criação, `.then`/`.catch`/`.finally`
  - `Promise.all`, `Promise.any`, `Promise.race`, `Promise.allSettled`
  - Regras de `await`, `async main`
  - Funções async recursivas
  - `@embedded.stack` — pilha explícita
  - Cancelamento de tarefas: `AbortController`, `AbortSignal`
  - `AsyncMutex`
- **Threads (std/threads):**
  - Isolates sem memória compartilhada
  - `Atomic<T>`, `AtomicArray<T>`
  - `channel<T>`: MPMC limitado, operações seguras para ISR
  - `select`: espera em múltiplos canais
  - `Readonly<T>`: compartilhamento sem cópia
  - `Thread<T>`: resultado tipado
  - Regras de Thread.spawn, verificação Send
- **@embedded.isr:**
  - `Volatile<T>` — registradores MMIO
  - ISR: assinatura, regras, padrões
  - `std/sync` — seções críticas
  - `EmbeddedSignal` — ponte ISR → async
- Anotações embarcadas: `@embedded.inline`, `@embedded.noHeap`
- `@signal` — sinais POSIX (desktop)
- Geradores async: `async function*`, `for await`, `close()`
- Multitarefa cooperativa via geradores

**Fonte:** `spec/07-concurrency.md`

---

### 08-modules.md — Módulos e interoperabilidade com C

**Objetivo:** como o sistema de módulos funciona e a interoperabilidade com C.

- Export: nomeado, `export default` é proibido
- Import: nomeado, namespace, `import type`
- Ordem de inicialização de módulos, imports cíclicos
- Variáveis a nível de módulo
- Aliases de caminho (`#`, `~`)
- Ponto de entrada: `"main"`, `"builds"`, geração de C main
- Bibliotecas: `"type": "library"`
- Arquivos `.d.tsc`: 5 tipos de declarações
  - Struct de C, tipo opaco, funções de C, constantes, registradores MMIO
  - Configuração de link (system, bundled, fetch)
- `native` — C inline (sintaxe, interpolação, limitações)
- Callbacks: `FnPtr<T>`, macros `TSC_CLOSURE_*`
- `unsafe {}` — desativação de verificações
- `@platform` — compilação condicional
- Merge de declarações
- Funções C variádicas: tipo `Scalar`

**Fonte:** `spec/08-modules.md`

---

### 09-build.md — Sistema de build

**Objetivo:** como um projeto, build e pacotes são estruturados.

- Tipos de projeto: executável, biblioteca, wrapper de C, pacote de plataforma
- `tsc.package.json`: todos os campos
- Wrapper de C: estrutura, publicação, configuração de link (system/bundled/fetch)
- Pacote de plataforma: `declare platform {}`, campos de plataforma
- CLI: `tsclang build`, flags (`--outDir`, `--target`, `--profile`, `--optimize`)
- Gerenciador de pacotes: `tsclang install`, `tsclang publish`, `tsclang search`
- Monorepo: `"workspaces"`
- Builds embarcados: AVR, ARM, plataformas retro
- CMakeLists.txt: geração, personalização
- Perfis: debug/release, otimização

**Fonte:** `spec/09-build.md`

---

### 10-stdlib.md — Biblioteca padrão

**Objetivo:** referência de todos os módulos da biblioteca padrão.

- Princípios: API unificada via `std/`, carregamento preguiçoso, tree-shaking
- Objetos globais: `console`, `Math`, `process`, temporizadores, `performance`
- `Error` — classe base
- `Map<K,V>`, `Set<T>` — API, propriedade
- `Buffer`, `DataView`
- `std/io` — Reader/Writer
- `std/fs` — operações com arquivos
- `std/net` — fetch, servidor HTTP, TCP/UDP
- `std/ws` — WebSocket
- `std/math` — constantes e métodos (tabela completa)
- `std/string` — Unicode, codificação, formatação
- `std/json` — análise e serialização
- `std/url` — URL e URLSearchParams
- `std/blob` — Blob e File
- `std/formdata` — multipart/form-data
- `std/regex` — regex NFA, sintaxe, API
- `std/random` — Random, HardwareRandom
- `std/temporal` — PlainDateTime, Instant, Duration
- `std/reactive` — ReactiveVar, computed, effect
- `std/hal` — GPIO, UART, SPI, I2C
- `std/embedded` — Volatile, ponteiro, HashMap, StaticMap
- Compatibilidade de plataformas (tabela)

**Fonte:** `spec/10-stdlib.md`, `spec/19-stdlib-*.md`

---

### 11-compiler.md — Arquitetura do compilador

**Objetivo:** para contribuidores e quem quer entender os internals.

- Fases de compilação (Parse → AST → Decorator → Typecheck → IR → Codegen)
- IR: blocos básicos, instruções, nós phi
- Name mangling (esquema formal)
- Debug info: diretivas `#line`, servidor DAP
- Monomorfização do lado do consumidor
- Compilação incremental (roadmap)
- Níveis de otimização (O0–O3, Os)
- Mensagens de erro: formato, categorias, códigos de erro

**Fonte:** `spec/11-compiler.md`

---

### 12-migration.md — Guia de migração: TypeScript → TSClang

**Objetivo:** ajudar um desenvolvedor de TS a migrar código.

- Correções automáticas (`tsclang migrate`)
- O que funciona como está (exemplos)
- O que requer correções manuais (padrões específicos)
- Padrões incompatíveis (tabela de alternativas)
- O que TSClang adiciona (o que não está em TS)

**Fonte:** `spec/12-migration.md`

---

## Tabela resumida de seções

| # | Arquivo | Conteúdo | Fonte | Tamanho |
|---|---------|----------|-------|---------|
| 01 | intro | O que é TSClang, início rápido, CLI | `spec/01-intro.md` | ~30 KB |
| 02 | syntax | Sintaxe, operadores, laços, match/switch | `spec/02-syntax.md` | ~50 KB |
| 03 | types | Tipos, números, strings, arrays, Map/Set, tuplas, tipos utilitários | `spec/03-types.md` | ~80 KB |
| 04 | classes | Classes, interfaces, enumeração, genéricos, métodos de extensão | `spec/04-classes.md`, `spec/13-decorators.md` | ~40 KB |
| 05 | memory | Propriedade, verificador de empréstimo, Ref/Mut/Shared, closures | `spec/05-memory.md` | ~50 KB |
| 06 | errors | throw/try/catch, Result, operadores `?`/`!` | `spec/06-errors.md` | ~15 KB |
| 07 | concurrency | async/await, threads, ISR, atômico, canais, geradores | `spec/07-concurrency.md` | ~70 KB |
| 08 | modules | Import/export, .d.tsc, nativo, unsafe, @platform | `spec/08-modules.md` | ~50 KB |
| 09 | build | Build, pacotes, wrapper de C, plataformas | `spec/09-build.md` | ~50 KB |
| 10 | stdlib | Referência de todos os módulos std | `spec/10-stdlib.md`, `spec/19-stdlib-*.md` | ~60 KB |
| 11 | compiler | Arquitetura do compilador (para contribuidores) | `spec/11-compiler.md` | ~30 KB |
| 12 | migration | Guia de migração de TypeScript → TSClang | `spec/12-migration.md` | ~15 KB |
| | | | **Total** | **~540 KB** |

## Ordem recomendada de redação

Ordem recomendada (do mais importante e comum ao avançado):

1. `01-intro.md` — ponto de entrada para todos
2. `02-syntax.md` — construções básicas
3. `05-memory.md` — característica principal, necessária para todos
4. `03-types.md` — sistema de tipos
5. `04-classes.md` — sistema de objetos
6. `06-errors.md` — tratamento de erros
7. `08-modules.md` — módulos e interoperabilidade com C
8. `07-concurrency.md` — concorrência
9. `10-stdlib.md` — referência de API
10. `09-build.md` — sistema de build
11. `12-migration.md` — migrando de TS
12. `11-compiler.md` — internals (para contribuidores)

## Estimativa de tamanho

| Documento | Tamanho estimado |
|-----------|------------------|
| 01-intro | ~30 KB |
| 02-syntax | ~50 KB |
| 03-types | ~80 KB |
| 04-classes | ~40 KB |
| 05-memory | ~50 KB |
| 06-errors | ~15 KB |
| 07-concurrency | ~70 KB |
| 08-modules | ~50 KB |
| 09-build | ~50 KB |
| 10-stdlib | ~60 KB |
| 11-compiler | ~30 KB |
| 12-migration | ~15 KB |
| **Total** | **~540 KB** |

## Formato

- Markdown (.md)
- Cada arquivo é uma seção autocontida
- Títulos H1 para títulos de seção, H2/H3 para subseções
- Tabelas para informações de referência
- Blocos de código com especificador de linguagem (```typescript, ```c, ```bash)
- `> **Nota:**` para observações importantes
- `> **Aviso:**` para limitações críticas
