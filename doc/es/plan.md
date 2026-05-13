# Plan de documentación de TSClang

## Objetivo

Crear documentación completa para desarrolladores en inglés basada en la especificación.
La documentación debe ser práctica, orientada al usuario (enfocada en el desarrollador), no enfocada en el autor del compilador.

## Audiencia objetivo

1. Un desarrollador que viene de TypeScript y quiere empezar a escribir en TSClang
2. Un desarrollador evaluando el lenguaje para desarrollo embebido
3. Un desarrollador buscando una API específica (método de cadena, tipo de propiedad, servidor HTTP)

## Principios de redacción

- Idioma: inglés
- Ejemplos de código: funcionales, mínimos, con comentarios en inglés
- Estructura: de simple a complejo
- Cada sección es autocontenida — puede leerse de forma independiente
- Referencias cruzadas entre secciones para un estudio más profundo

## Estructura de archivos

**Estructura anidada:** cada método, función, tipo y construcción tiene su propio archivo.
Sin páginas monolíticas de 50 KB. Si un método tiene 3 variantes de llamada — esos son 3 archivos
dentro del directorio del método.

Ejemplo de estructura:

```
doc/
  02-syntax/
    index.md                        # section overview + links
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

## Reglas de contenido de archivos

Cada archivo describe **un** método / función / construcción / tipo y debe contener:

### 1. Descripción completa

Qué es, por qué se necesita, cómo funciona. Sin relleno — concreto y al grano.
Menciona casos extremos y comportamientos no obvios.

### 2. Firma / Sintaxis

Firma exacta con tipos de parámetros y tipo de retorno.
Si un método tiene varias variantes (sobrecargas) — describe cada una por separado.

### 3. Ejemplos de uso o implementación

Al menos un ejemplo funcional por variante.
Los ejemplos deben ser mínimos — sin contexto innecesario.
Cada ejemplo con el resultado indicado (comentario `// →`).

### 4. Salida en C

Para cada ejemplo — cómo compila a C.
Muestra el código C generado para que el desarrollador entienda qué pasa bajo el capó.
Especialmente importante para las construcciones de propiedad (move, borrow, drop, cleanup).

### 5. Errores y soluciones

Errores típicos del compilador cuando se usa incorrectamente.
Formato: `código erróneo → texto de error → código corregido`.
Debe incluir la sugerencia del compilador.

### 6. Navegación y enlaces

Cada archivo debe contener enlaces de navegación:

**Barra de navegación** — en la parte superior del archivo, después del encabezado:

```markdown
[← Up](./index.md) | [Next →](./filter.md) | [Previous ←](./sort.md)
```

Tres enlaces:
- **Up** (`←`) — salta al `index.md` del directorio padre (vista general de la sección)
- **Next** (`→`) — salta al siguiente archivo en este nivel (en orden lógico, no alfabético)
- **Previous** (`←`) — salta al archivo anterior en este nivel

El primer archivo de una sección no tiene "Previous", el último no tiene "Next".

**Referencias cruzadas** — al final del archivo, sección "Ver también":

```markdown
## See Also

- [filter](./filter.md) — filtering elements
- [reduce](./reduce.md) — accumulation
- [forEach](./for-each.md) — iteration without result
```

Enlaces a construcciones relacionadas en otras secciones — con ruta completa:

```markdown
- [Ref&lt;T&gt;](../../05-memory/ref.md) — borrow of an element
```

**index.md en cada directorio** — vista general de la sección con enlaces a todos los archivos hijos.
Sirve como punto de entrada para la navegación de arriba hacia abajo.

Plantilla de archivo de ejemplo:

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

## Estructura de la documentación

### 01-intro.md — Introducción a TSClang

**Objetivo:** explicar qué es, por qué existe y proporcionar un primer ejemplo funcional.

- Qué es TSClang (sintaxis de TS → C, seguridad de Rust, ecosistema npm)
- Filosofía de diseño (3 prioridades: seguridad, rendimiento, sintaxis TS)
- Casos de uso (escritorio, embebido, servidores, plataformas retro)
- Inicio rápido: instalación, `hello world`, compilar y ejecutar
- Requisitos (Node.js, CMake, gcc/clang)
- Vista general de CLI: `tsclang build`, `tsclang lint`, `tsclang lsp`

**Fuente:** `spec/01-intro.md`

---

### 02-syntax.md — Sintaxis

**Objetivo:** descripción completa de la sintaxis del lenguaje.

- Formato (ASI, K&R, indentación, comillas, coma final)
- Variables: `let` / `const` — diferencia en el contexto de la propiedad
- Funciones: `function`, flecha, anónima, IIFE
- Parámetros: predeterminado, rest
- Sobrecarga de funciones (por tipo y cantidad, prioridad de resolución)
- Operadores: aritméticos, asignación, comparación, lógicos, bit a bit
- Truthy / Falsy (tabla por tipo)
- Ciclos: `for`, `for-of`, `while`, `do-while`, `break`/`continue`, etiquetados
- `switch` / `match` — comparación, exhaustividad
- Operador spread (arreglos, objetos, reglas de propiedad)
- Indexado y slices (arreglos y cadenas, índices negativos)

**Fuente:** `spec/02-syntax.md`

---

### 03-types.md — Sistema de tipos

**Objetivo:** descripción del tipado, todos los tipos y conversiones.

- Tipado estructural vs nominal (`type`, `interface`, `class`)
- Inferencia de tipos
- Tipos numéricos (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`)
  - Literales (hex, binario, octal, separadores `_`)
  - Conversión automática (3 mecanismos: widening, tiempo de compilación, `as`)
  - `usize` — tipo de plataforma
  - `number` = `f64` (sobrescribible)
  - Advertencias de rendimiento en AVR
- `string` — bytes UTF-8, layout de C, indexado, iteración, métodos integrados
- Tipos especiales: `void`, `never`, `any`
- Null: `T | null`, opcional `?`, encadenamiento opcional `?.`, coalescencia nula `??`
  - Representación en C de `T | null` (estructura con bandera)
  - Patrones embebidos: valor centinela, bandera separada
- Conversión de tipos: número ↔ cadena, funciones compatibles con JS (`parseInt`, `parseFloat`)
- `Date` — creación, métodos, formato
- Arreglos: `T[]` (dinámico), `T[N]` (fijo), métodos, métodos funcionales
- `Slice<T>` / `MutSlice<T>` — vista sin copia
- `Map<K,V>`, `Set<T>` — API, propiedad, patrones embebidos
- `Object` — métodos estáticos
- Tuplas: fijas, etiquetadas, readonly, opcionales, rest, spread
- `Clone` — interfaz, `clone()`, `structuredClone()`
- Alias de tipos (`type`)
- Unión de literales de cadena
- Tipos utilitarios: `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`
- `Buffer`, `DataView`

**Fuente:** `spec/03-types.md`

---

### 04-classes.md — Clases, interfaces, enumeración, genéricos

**Objetivo:** el sistema de objetos del lenguaje.

- Genéricos: sintaxis, límites (`implements`/`extends`), monomorfización, propiedad con genéricos
- Métodos de extensión: declaración, importación, conflictos
- Enumeración: numérica, de cadena, `const enum`, utilidades, en switch/match
- Interfaces: datos vs contrato con métodos, puntero grueso, vtable
- `instanceof` — estrechamiento de tipo vía vtable
- Clases:
  - Sin herencia (excepto `extends Error`), composición
  - Modificadores: `public`, `private`, `static`, `mut`, `move`
  - Semántica de `this` y acceso a campos
  - Campos `readonly`
  - Constructor: autogeneración, explícito, `private`
  - Patrón de objeto de valor
  - Patrón builder con `move`
- Alineación: `@packed`, `@align(N)`, diagnósticos de relleno
- Decoradores: vista general, referencia a la sección completa

**Fuente:** `spec/04-classes.md`, `spec/13-decorators.md`

---

### 05-memory.md — Modelo de memoria y propiedad

**Objetivo:** la característica clave del lenguaje — gestión segura de memoria.

- Tipos de propiedad: `T` (Propietario), `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>`, `Slice<T>`
- Reglas básicas: primitivas se copian, tipos complejos — propiedad
- Propietario (T): move en asignación y paso
- `Ref<T>`: préstamo inmutable, reglas, prohibido en campos, patrones de solución
- `Mut<T>`: préstamo mutable, uno a la vez
- `Shared<T>`: ARC, `Weak<T>` para romper ciclos
- Reglas del verificador de préstamo (4 reglas)
- Matriz de paso de argumentos (let/const/Ref/Mut/Shared → Ref/Mut/T/Shared)
- Interior Mutability — por qué no está presente
- `@static let` — estado global mutable
- Restricción de alcance (sin anotaciones de ciclo de vida): 4 reglas
- Drop automático y `goto cleanup`
- `Iterable<T>` — tipos iterables definidos por el usuario
- Acceso a campos y destructuración (préstamo vs move)
- Slices (préstamo vs propio)
- Move desde arreglo, mutación durante préstamo
- Devolver préstamo desde método
- Closures: reglas de captura, lista de captura explícita, closure Mut vía await

**Fuente:** `spec/05-memory.md`

---

### 06-errors.md — Manejo de errores

**Objetivo:** sistema de errores — basado en Result sin setjmp/longjmp.

- Principio: `throw`/`try`/`catch` en TS → estructuras Result en C
- Declarar `throws` en la firma
- `Error` — clase base, `error.stack`
- `throw`, `try`/`catch`/`finally`
- Catch de unión, manejo exhaustivo
- Operador `?` (propaga)
- Operador `!` (unwrap/panic)
- Salida en C: estructuras Result, `if/else` sobre `ok` y `_kind`
- Propiedad durante errores (limpieza vía `goto`)
- Limitaciones

**Fuente:** `spec/06-errors.md`

---

### 07-concurrency.md — Concurrencia

**Objetivo:** tres niveles de concurrencia y cómo usarlos.

- Vista general de tres mecanismos (async/await, hilos, ISR)
- **Async/Await:**
  - Arquitectura del runtime async (máquinas de estado)
  - Tamaño de máquina de estado, seguridad de pila en embebido
  - `Promise<T>`: creación, `.then`/`.catch`/`.finally`
  - `Promise.all`, `Promise.any`, `Promise.race`, `Promise.allSettled`
  - Reglas de `await`, `async main`
  - Funciones async recursivas
  - `@embedded.stack` — pila explícita
  - Cancelación de tareas: `AbortController`, `AbortSignal`
  - `AsyncMutex`
- **Hilos (std/threads):**
  - Isolates sin memoria compartida
  - `Atomic<T>`, `AtomicArray<T>`
  - `channel<T>`: MPMC acotado, operaciones seguras para ISR
  - `select`: espera en múltiples canales
  - `Readonly<T>`: compartición sin copia
  - `Thread<T>`: resultado tipado
  - Reglas de Thread.spawn, verificación Send
- **@embedded.isr:**
  - `Volatile<T>` — registros MMIO
  - ISR: firma, reglas, patrones
  - `std/sync` — secciones críticas
  - `EmbeddedSignal` — puente ISR → async
- Anotaciones embebidas: `@embedded.inline`, `@embedded.noHeap`
- `@signal` — señales POSIX (escritorio)
- Generadores async: `async function*`, `for await`, `close()`
- Multitarea cooperativa vía generadores

**Fuente:** `spec/07-concurrency.md`

---

### 08-modules.md — Módulos e interoperabilidad con C

**Objetivo:** cómo funciona el sistema de módulos y la interoperabilidad con C.

- Export: nombrado, `export default` está prohibido
- Import: nombrado, espacio de nombres, `import type`
- Orden de inicialización de módulos, imports cíclicos
- Variables a nivel de módulo
- Alias de rutas (`#`, `~`)
- Punto de entrada: `"main"`, `"builds"`, generación de C main
- Bibliotecas: `"type": "library"`
- Archivos `.d.tsc`: 5 tipos de declaraciones
  - Estructura de C, tipo opaco, funciones de C, constantes, registros MMIO
  - Configuración de enlace (system, bundled, fetch)
- `native` — C en línea (sintaxis, interpolación, limitaciones)
- Callbacks: `FnPtr<T>`, macros `TSC_CLOSURE_*`
- `unsafe {}` — desactivación de verificaciones
- `@platform` — compilación condicional
- Merge de declaraciones
- Funciones C variádicas: tipo `Scalar`

**Fuente:** `spec/08-modules.md`

---

### 09-build.md — Sistema de compilación

**Objetivo:** cómo se estructura un proyecto, una compilación y los paquetes.

- Tipos de proyecto: ejecutable, biblioteca, wrapper de C, paquete de plataforma
- `tsc.package.json`: todos los campos
- Wrapper de C: estructura, publicación, configuración de enlace (system/bundled/fetch)
- Paquete de plataforma: `declare platform {}`, campos de plataforma
- CLI: `tsclang build`, banderas (`--outDir`, `--target`, `--profile`, `--optimize`)
- Gestor de paquetes: `tsclang install`, `tsclang publish`, `tsclang search`
- Monorepo: `"workspaces"`
- Compilaciones embebidas: AVR, ARM, plataformas retro
- CMakeLists.txt: generación, personalización
- Perfiles: debug/release, optimización

**Fuente:** `spec/09-build.md`

---

### 10-stdlib.md — Biblioteca estándar

**Objetivo:** referencia de todos los módulos de la biblioteca estándar.

- Principios: API unificada vía `std/`, carga diferida, tree-shaking
- Objetos globales: `console`, `Math`, `process`, temporizadores, `performance`
- `Error` — clase base
- `Map<K,V>`, `Set<T>` — API, propiedad
- `Buffer`, `DataView`
- `std/io` — Reader/Writer
- `std/fs` — operaciones con archivos
- `std/net` — fetch, servidor HTTP, TCP/UDP
- `std/ws` — WebSocket
- `std/math` — constantes y métodos (tabla completa)
- `std/string` — Unicode, codificación, formato
- `std/json` — análisis y serialización
- `std/url` — URL y URLSearchParams
- `std/blob` — Blob y File
- `std/formdata` — multipart/form-data
- `std/regex` — regex NFA, sintaxis, API
- `std/random` — Random, HardwareRandom
- `std/temporal` — PlainDateTime, Instant, Duration
- `std/reactive` — ReactiveVar, computed, effect
- `std/hal` — GPIO, UART, SPI, I2C
- `std/embedded` — Volatile, puntero, HashMap, StaticMap
- Compatibilidad de plataformas (tabla)

**Fuente:** `spec/10-stdlib.md`, `spec/19-stdlib-*.md`

---

### 11-compiler.md — Arquitectura del compilador

**Objetivo:** para contribuidores y quienes quieran entender los internals.

- Fases de compilación (Parse → AST → Decorator → Typecheck → IR → Codegen)
- IR: bloques básicos, instrucciones, nodos phi
- Name mangling (esquema formal)
- Debug info: directivas `#line`, servidor DAP
- Monomorfización del lado del consumidor
- Compilación incremental (roadmap)
- Niveles de optimización (O0–O3, Os)
- Mensajes de error: formato, categorías, códigos de error

**Fuente:** `spec/11-compiler.md`

---

### 12-migration.md — Guía de migración: TypeScript → TSClang

**Objetivo:** ayudar a un desarrollador de TS a migrar código.

- Arreglos automáticos (`tsclang migrate`)
- Qué funciona tal cual (ejemplos)
- Qué requiere arreglos manuales (patrones específicos)
- Patrones incompatibles (tabla de alternativas)
- Qué agrega TSClang (lo que no está en TS)

**Fuente:** `spec/12-migration.md`

---

## Tabla resumen de secciones

| # | Archivo | Contenido | Fuente | Tamaño |
|---|---------|-----------|--------|--------|
| 01 | intro | Qué es TSClang, inicio rápido, CLI | `spec/01-intro.md` | ~30 KB |
| 02 | syntax | Sintaxis, operadores, ciclos, match/switch | `spec/02-syntax.md` | ~50 KB |
| 03 | types | Tipos, números, cadenas, arreglos, Map/Set, tuplas, tipos utilitarios | `spec/03-types.md` | ~80 KB |
| 04 | classes | Clases, interfaces, enumeración, genéricos, métodos de extensión | `spec/04-classes.md`, `spec/13-decorators.md` | ~40 KB |
| 05 | memory | Propiedad, verificador de préstamo, Ref/Mut/Shared, closures | `spec/05-memory.md` | ~50 KB |
| 06 | errors | throw/try/catch, Result, operadores `?`/`!` | `spec/06-errors.md` | ~15 KB |
| 07 | concurrency | async/await, hilos, ISR, atómico, canales, generadores | `spec/07-concurrency.md` | ~70 KB |
| 08 | modules | Import/export, .d.tsc, nativo, unsafe, @platform | `spec/08-modules.md` | ~50 KB |
| 09 | build | Compilación, paquetes, wrapper de C, plataformas | `spec/09-build.md` | ~50 KB |
| 10 | stdlib | Referencia de todos los módulos std | `spec/10-stdlib.md`, `spec/19-stdlib-*.md` | ~60 KB |
| 11 | compiler | Arquitectura del compilador (para contribuidores) | `spec/11-compiler.md` | ~30 KB |
| 12 | migration | Guía de migración de TypeScript → TSClang | `spec/12-migration.md` | ~15 KB |
| | | | **Total** | **~540 KB** |

## Orden recomendado de redacción

Orden recomendado (de lo más importante y común a lo avanzado):

1. `01-intro.md` — punto de entrada para todos
2. `02-syntax.md` — construcciones básicas
3. `05-memory.md` — característica clave, necesaria para todos
4. `03-types.md` — sistema de tipos
5. `04-classes.md` — sistema de objetos
6. `06-errors.md` — manejo de errores
7. `08-modules.md` — módulos e interoperabilidad con C
8. `07-concurrency.md` — concurrencia
9. `10-stdlib.md` — referencia de API
10. `09-build.md` — sistema de compilación
11. `12-migration.md` — migrando desde TS
12. `11-compiler.md` — internals (para contribuidores)

## Estimación de tamaño

| Documento | Tamaño estimado |
|-----------|-----------------|
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
- Cada archivo es una sección autocontenida
- Encabezados H1 para títulos de sección, H2/H3 para subsecciones
- Tablas para información de referencia
- Bloques de código con especificador de lenguaje (```typescript, ```c, ```bash)
- `> **Nota:**` para observaciones importantes
- `> **Advertencia:**` para limitaciones críticas
