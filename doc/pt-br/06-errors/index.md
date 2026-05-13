# Tratamento de Erros

[Acima](../index.md) | [Próximo →](./throw-try.md)

---

O TSClang usa sintaxe `throw`/`try`/`catch`/`finally` como TypeScript, mas compila os erros em **structs Result em C** — sem `setjmp`/`longjmp`. Isso fornece:

- **Custo zero**: sem salvamento de registradores em todo bloco `try`
- **Interoperação segura com C**: sem `longjmp` através de código C de terceiros
- **Propriedade correta**: fluxo de controle ordinário, o compilador conhece todas as variáveis próprias

## Princípio

Toda função que pode falhar declara `throws` em sua assinatura. No C-output o tipo de retorno é envolvido em um struct Result com um campo `ok` e uma union para o valor ou erro. Manipuladores `try`/`catch` compilam para `if/else` ordinários no campo `ok` e `_kind`.

## Conceitos-chave

### Declaração throws

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Sem `throws` — uma função não pode conter `throw` (erro de compilação).

### Error — classe base

Todos os erros herdam de `Error`:

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // apenas desktop — pontos de throw "__FILE__:__LINE__"
}
```

### Operadores ? e !

| Operador | Semântica | Requer `throws`? |
|----------|-----------|-----------------|
| `expr?`  | Propaga — retorna o erro da função atual | Sim |
| `expr!`  | Desempacota — panic (`abort()`) em erro | Não |

### Struct Result em C

```c
typedef struct {
    bool ok;
    union {
        Response value;
        struct {
            _fetch_err_kind _kind;
            union {
                IOError io;
                NetworkError net;
            } _err;
        };
    };
} _Result_Response_IOError_NetworkError;
```

### Propriedade com erros

O compilador rastreia todas as variáveis próprias em um bloco `try`. Em erro todas as variáveis próprias já inicializadas são liberadas através de fluxo de controle ordinário (`goto cleanup`).

## Subpáginas

| Página | Descrição |
|--------|-----------|
| [throw / try / catch / finally](./throw-try.md) | Sintaxe de tratamento de erros, catch por tipo, finally |
| [Structs Result](./result.md) | Result<T, E>, união discriminada, representação C |
| [Operadores ? e !](./operators.md) | Propagação, desempacote/panic, C-output |

## Erros

| Erro | Causa |
|------|-------|
| `throw in non-throws function` | `throw` em função sem `throws` |
| `? operator in non-throws function` | operador `?` sem `throws` na função atual |
| `extern "C" cannot throw` | `throws` em função `extern "C"` |
| `throw/return in finally` | `throw` ou `return` dentro de bloco `finally` |
| `error.stack on embedded` | Acessando `stack` em plataforma embarcada |

## Restrições

- `throw` é proibido em funções sem `throws`
- `?` é proibido em função sem `throws`
- Exceções não podem ser lançadas através de fronteiras de interoperação com C — `extern "C"` não pode conter `throws`
- `finally` não pode conter `throw` ou `return`
- `error.stack` não está disponível em plataformas embarcadas

## Veja também

- [Modelo de Memória: Liberação Automática](../05-memory/auto-drop.md) — `goto cleanup` com múltiplos pontos de saída
- [Modelo de Memória: Proprietário](../05-memory/owner.md) — move e propriedade com erros
- [Classes](../04-classes/index.md) — Herança de Error e tipos de erro customizados
