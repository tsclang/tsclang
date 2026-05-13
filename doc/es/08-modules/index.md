# Sistema de módulos

[← Arriba](../index.md) | [Siguiente →](./import-export.md)

---

TSClang utiliza un **sistema de módulos** compatible con TypeScript en sintaxis: `export` / `import { } from ""` nombrados. Un archivo = un módulo. El compilador genera automáticamente los `#include`, las declaraciones anticipadas y las funciones de inicialización en el C generado.

## Principios

- **Un archivo — un módulo** — sin `namespace`, sin `module`
- **Solo exports nombrados** — `export default` prohibido (C requiere un nombre explícito para cada símbolo)
- **Imports circulares permitidos** — el compilador genera declaraciones anticipadas en `.h`
- **Archivos `.d.tsc`** — declaraciones para interoperabilidad C (análogo de `.d.ts` en TypeScript)
- **Alias de rutas** — nombres cortos `#/`, `~/` en lugar de `../../../`

## Import y Export

```typescript
// math.tsc — módulo con exports
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — import
import { PI, add } from "./math"
console.log(add(1, 2))
```

## Punto de entrada

El punto de entrada se define mediante el campo `"main"` en `tsc.package.json`. El código de nivel superior del archivo de entrada se convierte en el cuerpo de `main()` en C:

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

## Inicialización de módulos

El compilador construye un grafo de dependencias y realiza un **ordenamiento topológico**. Cada módulo con variables a nivel de módulo recibe una función `_init()`. El resultado es un único `tsc_init_all()` con el orden de llamada correcto.

## Interoperabilidad C

Para interactuar con bibliotecas C, TSClang proporciona varios mecanismos:

| Mecanismo | Propósito |
|----------|------------|
| `.d.tsc` | Declaraciones de tipos, funciones y constantes C |
| `native` | Código C en línea (verbatim) |
| `unsafe {}` | Desactivación del verificador de préstamo/tipos |
| `FnPtr<T>` | Punteros a función para callbacks C |
| `@platform` | Compilación condicional por plataforma |

## Subpáginas

| Página | Descripción |
|----------|----------|
| [Import / Export](./import-export.md) | Export/import nombrados, import de espacio de nombres, `import type`, inicialización, imports circulares, alias de rutas |
| [Archivos .d.tsc](./d-tsc.md) | Declaraciones para interoperabilidad C: struct, tipo opaco, funciones, constantes, MMIO |
| [native — C en línea](./native.md) | Sintaxis, interpolación, limitaciones, inserts de ensamblador |
| [unsafe {} — Desactivar verificaciones](./unsafe.md) | Cuándo usarlo, qué desactiva, diferencia con `native` |
| [Callbacks y FnPtr\<T\>](./callbacks.md) | Punteros a función, macros TSC_CLOSURE_*, puenteo de closures |
| [@platform — Compilación condicional](./platform.md) | Implementaciones dependientes de la plataforma, estructura del package |

## C generado

```c
// resultado de compilar varios módulos
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... código de nivel superior de main.tsc ...
    return 0;
}
```

## Errores

| Error | Causa |
|--------|---------|
| `cannot determine entry point` | No hay campo `"main"` en `tsc.package.json` |
| `main file not found: src/main.tsc` | El archivo del `"main"` no existe |
| `circular initialization dependency detected` | Ciclo a través de variables a nivel de módulo |
| `export default is not allowed` | Intento de usar export por defecto |
| `native block — C code inserted verbatim` | Advertencia en cada bloque `native` |

## Ver también

- [Sintaxis: Variables](../02-syntax/variables/index.md) — variables a nivel de módulo
- [Memoria: Propiedad](../05-memory/ownership-types.md) — owned/borrow al pasar entre módulos
- [Concurrencia](../07-concurrency/index.md) — thread-safety para variables a nivel de módulo
