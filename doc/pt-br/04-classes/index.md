# Classes e Sistema de Objetos

[Acima](../index.md) | [Próximo →](./classes.md)

---

O sistema de objetos do TSClang é construído sobre composição em vez de herança, tipagem nominal para classes e tipagem estrutural para interfaces. Genéricos são monomorfizados — código C separado para cada tipo concreto.

## Princípios-chave

- **Sem herança** — apenas `extends Error` para hierarquias de erros. Polimorfismo via `interface` + `implements`.
- **Composição** — em vez de `class Dog extends Animal` use `class Dog { animal: Animal }`.
- **Propriedade é integrada** — modificadores `mut`, `move` controlam a semântica de `this`.
- **Genéricos são monomorfizados** — `Stack<i32>` e `Stack<User>` geram funções C separadas.
- **Decoradores são em tempo de compilação** — transformam AST antes da verificação de tipos, zero overhead em tempo de execução.

## Subpáginas

| Página | Descrição |
|--------|-----------|
| [Classes](./classes.md) | Definição, modificadores, semântica de `this`, `readonly`, construtores, objeto de valor, builder |
| [Interfaces](./interfaces.md) | Interfaces de dados vs contrato, fat pointer vtable, `instanceof`, compatibilidade estrutural |
| [Enum](./enum.md) | Numérico, string, `const enum`, utilitários, exaustividade em `match` |
| [Genéricos](./generics.md) | Sintaxe, limites (`implements`/`extends`), monomorfização, propriedade com genéricos |
| [Decoradores](./decorators.md) | `decorator function`, Descriptor API, `@packed`, `@align`, `@static`, `@embedded.*`, `@signal`, `@platform` |

## Métodos de Extensão

O TSClang suporta métodos de extensão — adicionar métodos a tipos existentes sem modificar a definição. Importados explicitamente, não poluem o escopo global.

```typescript
export extension function charCount(this: string): i32 {
    // count codepoints
}

import { charCount } from "std/string"
"привет".charCount()   // ok
```

C-output — chamada estática, zero overhead:

```c
int32_t n = tsc_std_string_charCount(s);
```

Uma extensão conflitando com um método existente — erro de compilação. Duas extensões com o mesmo nome de módulos diferentes — resolvidas via `import { format as fmtA } from "./module-a"`.

## Erros

| Erro | Causa |
|------|-------|
| `extends is only allowed for Error` | Tentativa de herdar de uma classe arbitrária |
| `extension 'format' conflicts with existing method` | Extensão com o nome de um método existente |
| `ambiguous extension 'format' for type 'string'` | Duas extensões importadas com o mesmo nome |

## Veja também

- [Modelo de Memória](../05-memory/index.md) — propriedade, `Ref<T>`, `Mut<T>`, semântica de move
- [Sistema de Tipos](../03-types/index.md) — tipagem estrutural vs nominal
- [Tratamento de Erros](../06-errors/index.md) — `extends Error`, `throws`, `try/catch`
- [Especificação: Classes](../../spec/04-classes.md) — descrição completa do sistema de objetos
