# Sistema de tipos

[← Arriba](../index.md) | [Siguiente →](./numbers.md)

---

El sistema de tipos de TSClang es estático, con inferencia de tipos y tres niveles de seguridad: comprobaciones en tiempo de compilación, verificador de propiedad/préstamo y ARC opcional.

## Dos niveles de tipado

TSClang separa los tipos en **estructurales** y **nominales**:

| Constructo | Tipado | Literales de objeto | Salida C |
|-----------|--------|-------------------|----------|
| `type Foo = { ... }` | Estructural | ✅ | `typedef struct`, métodos prohibidos |
| `interface Foo { ... }` | Estructural | ✅ (si no hay métodos) | `typedef struct` o fat pointer + vtable |
| `class Foo { ... }` | **Nominal** | ❌ | struct + métodos |

```typescript
type Point  = { x: f64; y: f64 }
type Vector = { x: f64; y: f64 }

const p: Point = { x: 1.0, y: 2.0 }   // ok — compatibilidad estructural
const v: Vector = p                     // ok — mismos campos

class Circle { x: f64; y: f64 }
const c: Circle = { x: 1.0, y: 2.0 }  // error — la clase es nominal
```

Diferencia clave `type` vs `interface`:
- `type Point = { x: f64; y: f64 }` — estructura de datos **garantizada** sin vtable. Los métodos están prohibidos por error de compilación. Úsala para MMIO embebido, structs binarias, código crítico para la ABI.
- `interface Point { x: f64; y: f64 }` — estructura de datos por ahora, pero puede extenderse con métodos en el futuro (entonces la ABI cambiará a vtable).

## Inferencia de tipos

El tipo se infiere si no se especifica explícitamente:

```typescript
const p = { x: 1, y: 0 }   // → { x: f64, y: f64 } — struct anónima
const s = "hello"            // → string
const n = 42                 // → number (= f64 en desktop)
const b = true               // → boolean
const arr = [1, 2, 3]       // → number[] (= f64[])
```

La anotación explícita tiene prioridad: `const i: i32 = 1` → `i32`.

## Conversión automática de tipos numéricos

Tres mecanismos, aplicados secuencialmente. El primero aplicable gana.

### Mecanismo 1 — ampliación a nivel de tipo (let y const)

Funciona solo sobre tipos, no mira los valores. Incondicionalmente seguro.

| De | A | Comentario |
|------|-----|---------|
| `i8`/`i16`/`i32` | `i64` | mismo signo, sin pérdida |
| `u8`/`u16`/`u32` | `u64` | mismo signo, sin pérdida |
| `u8` | `i16` | los 256 valores caben |
| `u16` | `i32` | los 65 536 caben |
| `u32` | `i64` | los 4,3 G caben |
| `i32`, `u32` | `f64` | sin pérdida (mantisa de 53 bits) |
| `f32` | `f64` | sin pérdida |

```typescript
let a: u32 = getValue()
let b: i64 = a + 1   // ok — u32 siempre cabe en i64
```

### Mecanismo 2 — análisis de valor en tiempo de compilación (solo const)

Cuando ambos operandos son `const` con valores literales conocidos y el mecanismo 1 no aplica. Algoritmo paso a paso — ver [Tipos numéricos → Conversión automática](./numbers.md).

### Mecanismo 3 — `as` explícito (para let)

Si el mecanismo 1 no aplica a variables `let` — se requiere una conversión explícita:

```typescript
let a: i64 = 1
let b: u32 = 2
let c: f64 = a + b              // error — no hay ampliación a nivel de tipo
let c: f64 = (a + (b as i64)) as f64  // ok
```

Los detalles de cada mecanismo — en la página [Tipos numéricos](./numbers.md).

## Subpáginas

| Página | Descripción |
|------|-------------|
| [Tipos numéricos](./numbers.md) | i8..i64, u8..u64, f32, f64, usize, number, conversión automática, `as` |
| [Cadenas de texto](./strings.md) | Cadenas UTF-8, literales, métodos, std/string |
| [Tipos especiales](./special-types.md) | any, never, void, unknown |
| [Null](./null.md) | Tipos anulables, encadenamiento opcional, `??` |
| [Arreglos](./arrays.md) | Dinámicos, fijos, Slice<T> |
| [Map y Set](./map-set.md) | Tablas hash y conjuntos |
| [Tuplas](./tuples.md) | Tuplas, etiquetadas, readonly, opcionales, rest |
| [Clone](./clone.md) | Clonación explícita de valores poseídos |
| [Alias de tipo](./type-aliases.md) | `type`, alias opacos, String Literal Union |
| [Tipos utilitarios](./utility-types.md) | Partial, Required, Readonly, Pick, Omit, Record, etc. |
| [Date](./date.md) | Tipo fecha/hora compatible con JS heredado |

## Errores

| Error | Causa |
|-------|-------|
| `expected f64, got i32` | Tipos numéricos incompatibles sin conversión automática |
| `empty object literal is forbidden` | `{}` vacío — usar `Map<K,V>` o declarar un tipo |
| `cannot use "void" as variable type` | `void` solo para tipo de retorno de función |
| `non-nullable runtime union: string \| i32` | Unión no anulable prohibida, usar interfaz o unión discriminada |

## Ver también

- [Variables: let / const](../02-syntax/variables/index.md) — impacto de `let`/`const` en tipos y conversión automática
- [Modelo de memoria](../05-memory/index.md) — propiedad, `Ref<T>`, `Mut<T>`
- [Clases e interfaces](../04-classes/index.md) — tipado nominal, genéricos
- [Manejo de errores](../06-errors/index.md) — `throws`, `T | null` vs `T throws E`
