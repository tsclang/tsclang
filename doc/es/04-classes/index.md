# Clases y sistema de objetos

[← Arriba](../index.md) | [Siguiente →](./classes.md)

---

El sistema de objetos de TSClang se basa en la composición en lugar de la herencia, el tipado nominal para las clases y el tipado estructural para las interfaces. Los genéricos se monomorfizan — código C separado para cada tipo concreto.

## Principios clave

- **Sin herencia** — solo `extends Error` para jerarquías de errores. Polimorfismo mediante `interface` + `implements`.
- **Composición** — en lugar de `class Dog extends Animal` usar `class Dog { animal: Animal }`.
- **Propiedad integrada** — los modificadores `mut`, `move` controlan la semántica de `this`.
- **Genéricos monomorfizados** — `Stack<i32>` y `Stack<User>` generan funciones C separadas.
- **Decoradores en tiempo de compilación** — transforman el AST antes de la verificación de tipos, cero sobrecarga en tiempo de ejecución.

## Subpáginas

| Página | Descripción |
|------|-------------|
| [Clases](./classes.md) | Definición, modificadores, semántica de `this`, `readonly`, constructores, objeto valor, builder |
| [Interfaces](./interfaces.md) | Interfaces de datos vs contrato, fat pointer vtable, `instanceof`, compatibilidad estructural |
| [Enum](./enum.md) | Numéricos, cadenas, `const enum`, utilidades, exhaustividad en `match` |
| [Genéricos](./generics.md) | Sintaxis, límites (`implements`/`extends`), monomorfización, propiedad con genéricos |
| [Decoradores](./decorators.md) | `decorator function`, Descriptor API, `@packed`, `@align`, `@static`, `@embedded.*`, `@signal`, `@platform` |

## Métodos de extensión

TSClang admite métodos de extensión — agregar métodos a tipos existentes sin modificar la definición. Importados explícitamente, no contaminan el ámbito global.

```typescript
export extension function charCount(this: string): i32 {
    // cuenta puntos de código
}

import { charCount } from "std/string"
"привет".charCount()   // ok
```

Salida C — llamada estática, cero sobrecarga:

```c
int32_t n = tsc_std_string_charCount(s);
```

Una extensión en conflicto con un método existente — error de compilación. Dos extensiones con el mismo nombre de módulos diferentes — resueltas mediante `import { format as fmtA } from "./module-a"`.

## Errores

| Error | Causa |
|-------|-------|
| `extends is only allowed for Error` | Intento de heredar de una clase arbitraria |
| `extension 'format' conflicts with existing method` | Extensión con el nombre de un método existente |
| `ambiguous extension 'format' for type 'string'` | Dos extensiones importadas con el mismo nombre |

## Ver también

- [Modelo de memoria](../05-memory/index.md) — propiedad, `Ref<T>`, `Mut<T>`, semántica de movimiento
- [Sistema de tipos](../03-types/index.md) — tipado estructural vs nominal
- [Manejo de errores](../06-errors/index.md) — `extends Error`, `throws`, `try/catch`
- [Especificación: Clases](../../spec/04-classes.md) — descripción completa del sistema de objetos
