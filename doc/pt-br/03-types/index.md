# Sistema de Tipos

[Acima](../index.md) | [Próximo →](./numbers.md)

---

O sistema de tipos do TSClang é estático, com inferência de tipos e três níveis de segurança: verificações em tempo de compilação, verificador de empréstimo/propriedade e ARC opcional.

## Dois Níveis de Tipagem

O TSClang separa os tipos em **estrutural** e **nominal**:

| Construção | Tipagem | Literais de Objeto | C-output |
|-----------|---------|-------------------|----------|
| `type Foo = { ... }` | Estrutural | ✅ | `typedef struct`, métodos proibidos |
| `interface Foo { ... }` | Estrutural | ✅ (se não tiver métodos) | `typedef struct` ou fat pointer + vtable |
| `class Foo { ... }` | **Nominal** | ❌ | struct + métodos |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // ok — compatibilidade estrutural
const v: Vector = p                     // ok — mesmos campos

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // error — classe é nominal
```

Diferença-chave `type` vs `interface`:
- `type Point = { x: f64; y: f64 }` — **garantido** estrutura de dados sem vtable. Métodos são proibidos por erro de compilação. Use para MMIO embarcado, structs binários, código crítico de ABI.
- `interface Point { x: f64; y: f64 }` — estrutura de dados por enquanto, mas pode ser estendida com métodos no futuro (então a ABI mudará para vtable).

## Inferência de tipos

O tipo é inferido se não for especificado explicitamente:

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — struct anônima
const s = "hello"            // → string
const n = 42                 // → number (= f64 no desktop)
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[] (= f64[])
```

Anotação explícita sobrescreve: `const i: i32 = 1` → `i32`.

## Conversão automática de tipos numéricos

Três mecanismos, aplicados sequencialmente. O primeiro aplicável vence.

### Mecanismo 1 — ampliação em nível de tipo (let e const)

Funciona apenas em tipos, não olha para valores. Incondicionalmente seguro.

| De | Para | Comentário |
|----|------|-----------|
| `i8`/`i16`/`i32` | `i64` | mesmo sinal, sem perda |
| `u8`/`u16`/`u32` | `u64` | mesmo sinal, sem perda |
| `u8` | `i16` | todos os 256 valores cabem |
| `u16` | `i32` | todos os 65.536 cabem |
| `u32` | `i64` | todos os 4.3G cabem |
| `i32`, `u32` | `f64` | sem perda (mantissa de 53 bits) |
| `f32` | `f64` | sem perda |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 sempre cabe em i64
```

### Mecanismo 2 — análise de valor em tempo de compilação (const apenas)

Quando ambos os operandos são `const` com valores literais conhecidos e o mecanismo 1 não se aplica. Algoritmo passo a passo — veja [Tipos Numéricos → Autocast](./numbers.md).

### Mecanismo 3 — `as` explícito (para let)

Se o mecanismo 1 não se aplica a variáveis `let` — é necessário cast explícito:

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // error — sem ampliação em nível de tipo
let c: f64 = (a + (b as i64)) as f64  // ok
```

Detalhes para cada mecanismo — na página [Tipos Numéricos](./numbers.md).

## Subpáginas

| Página | Descrição |
|--------|-----------|
| [Tipos Numéricos](./numbers.md) | i8..i64, u8..u64, f32, f64, usize, number, autocast, `as` |
| [Strings](./strings.md) | Strings UTF-8, literais, métodos, std/string |
| [Tipos Especiais](./special-types.md) | any, never, void, unknown |
| [Null](./null.md) | Tipos anuláveis, encadeamento opcional, `??` |
| [Arrays](./arrays.md) | Dinâmico, fixo, Slice<T> |
| [Map e Set](./map-set.md) | Tabelas hash e conjuntos |
| [Tuples](./tuples.md) | Tuplas, rotuladas, readonly, opcional, rest |
| [Clone](./clone.md) | Clonagem explícita de valores próprios |
| [Aliases de Tipo](./type-aliases.md) | `type`, aliases opacos, String Literal Union |
| [Tipos Utilitários](./utility-types.md) | Partial, Required, Readonly, Pick, Omit, Record, etc. |
| [Date](./date.md) | Tipo legado de data/hora compatível com JS |

## Erros

| Erro | Causa |
|------|-------|
| `expected f64, got i32` | Tipos numéricos incompatíveis sem autocast |
| `empty object literal is forbidden` | `{}` vazio — use `Map<K,V>` ou declare o tipo |
| `cannot use "void" as variable type` | `void` apenas para tipo de retorno de função |
| `non-nullable runtime union: string \| i32` | União não anulável proibida, use interface ou união discriminada |

## Veja também

- [Variáveis: let / const](../02-syntax/variables/index.md) — impacto de `let`/`const` em tipos e autocast
- [Modelo de Memória](../05-memory/index.md) — propriedade, `Ref<T>`, `Mut<T>`
- [Classes e Interfaces](../04-classes/index.md) — tipagem nominal, genéricos
- [Tratamento de Erros](../06-errors/index.md) — `throws`, `T | null` vs `T throws E`
