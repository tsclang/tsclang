# Modelo de Memória

[Acima](../index.md) | [Próximo →](./ownership-types.md)

---

O TSClang usa um **modelo híbrido de gerenciamento de memória**: verificador estático de propriedade/empréstimo + ARC opcional. Sem GC, sem `free` manual.

## Princípio

O compilador rastreia estaticamente o proprietário de cada valor. A desalocação de memória é determinística, ao final do escopo do proprietário. Para casos onde a análise estática é insuficiente (grafos, ciclos) — `Shared<T>` com refcount atômico (ARC).

## Tipos de Propriedade

| Tipo | Semântica | Descrição |
|------|-----------|-----------|
| `T` | **Proprietário** | Propriedade total, move na transferência |
| `Ref<T>` | **Empréstimo imutável** | Apenas leitura, sem modificação ou deleção |
| `Mut<T>` | **Empréstimo mutável** | Leitura e escrita, apenas um `Mut` por vez |
| `Shared<T>` | **ARC** | Referência forte, incrementa refcount, apenas desktop |
| `Weak<T>` | **Referência fraca** | Não incrementa refcount, quebra ciclos |
| `Slice<T>` | **Visualização de array emprestada** | Sub-intervalo zero-copy, ponteiro + tamanho |

## Regras Básicas

- **Primitivos** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — sempre **copiados**, o verificador de empréstimo não se aplica
- **Tipos complexos** (arrays, objetos, strings, classes) — gerenciados pelo sistema de propriedade
- `string` — Proprietário alocado no heap, passado como `Ref<string>`, copiado via `clone()`

## Verificador de Empréstimo

Regra **Apelidação XOR Mutabilidade**: dois `Mut` simultaneamente não são permitidos, `Mut` + `Ref` não é permitido, mas múltiplos `Ref` simultâneos são permitidos.

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // ok — múltiplos Ref permitidos
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // error: Mut ativo já existe
```

## Liberação Automática

O compilador insere `free()` ao final do escopo do proprietário. Com múltiplos `return` e `throw` — ponto único de limpeza via `goto cleanup`:

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... trabalho ...
cleanup:
    if (u) User_free(u);
}
```

## Subpáginas

| Página | Descrição |
|--------|-----------|
| [Tipos de Propriedade](./ownership-types.md) | Visão geral de todos os tipos de propriedade e suas representações C |
| [Proprietário (T)](./owner.md) | Propriedade total, move na atribuição e transferência |
| [Ref<T>](./ref.md) | Empréstimo imutável, padrões de visualização |
| [Mut<T>](./mut.md) | Empréstimo mutável, regras de exclusividade |
| [Shared<T> e Weak<T>](./shared.md) | ARC e referências fracas para grafos e ciclos |
| [Slice<T>](./slice.md) | Visualização zero-copy de parte de array ou string |
| [Verificador de Empréstimo](./borrow-checker.md) | Regras de apelidação, ciclo de vida, restrições de escopo |
| [Drop e limpeza](./drop.md) | Desalocação automática, `goto cleanup` |
| [Desestruturação](./destructuring.md) | Empréstimo vs move ao desestruturar campos |
| [Closures](./closures.md) | Regras de captura: copy, Ref, Mut, move |
| [Iteradores](./iterators.md) | `Iterable<T>`, iteradores pull-based na pilha |

## C-output

```typescript
let user = new User();
user.name = "Alice";
// fim do escopo — User_free chamado automaticamente
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... uso ...
User_free(&user);   // inserido pelo compilador
```

## Erros

| Erro | Causa |
|------|-------|
| `use of moved value: "x"` | Acessando variável após move |
| `already borrowed as Mut` | Segundo `Mut` ou `Ref` enquanto `Mut` está ativo |
| `already borrowed as Ref` | `Mut` enquanto `Ref` está ativo |
| `Ref<T> not allowed in class field` | Tentando armazenar empréstimo em campo de classe |
| `cannot move out of array by index` | `arr[i]` para tipo próprio sem `.remove()` |

## Veja também

- [Variáveis: let / const](../02-syntax/variables/index.md) — impacto de `let`/`const` em `Mut<T>` / `Ref<T>`
- [Funções](../02-syntax/functions/declaration.md) — regras de passagem de argumentos
- [Classes](../04-classes/index.md) — métodos `mut` e campos `readonly`
- [Erros](../06-errors/index.md) — `goto cleanup` em `throw` / `?`
