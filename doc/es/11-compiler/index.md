# Arquitectura del compilador

[← Arriba](../index.md) | [Siguiente →](./phases.md)

---

Arquitectura del compilador TSClang para colaboradores. El compilador traduce los `.tsc` a C99, delegando las optimizaciones de máquina al compilador C (gcc/clang/avr-gcc).

## Pipeline

```
.tsc source
    ↓
Parse (lexer + parser)      →  AST
    ↓
Decorator pass              →  AST modificado
    ↓
Typecheck                   →  AST tipado
    ↓
Lower to IR                 →  IR tipo SSA (bloques básicos)
    ↓
Ownership Analysis          →  borrow checker + inyección ARC
    ↓
Codegen                     →  C99 + #line + CMakeLists.txt
    ↓
Compilador C                →  binario / .hex
```

## Código fuente

| Ruta | Propósito |
|------|---------|
| `src/compiler/lexer.js` | Lexer |
| `src/compiler/parser.js` | Parser → AST |
| `src/compiler/types.js` | Tipos auxiliares y mangling |
| `src/compiler/codegen.js` | Punto de entrada del codegen, clase Context |
| `src/compiler/codegen/top-level/` | Clases, funciones, interfaces, enum, alias de tipos |
| `src/compiler/codegen/stmt/` | Declaraciones de variables, flujo de control, desestructuración, match |
| `src/compiler/codegen/expr/` | Distribuidor de expresiones, operadores, asignación, literales |
| `src/compiler/codegen/calls/` | Llamadas: métodos, console, stdlib, builtin, conversiones, concurrencia |
| `src/compiler/codegen/types/` | Resolución de tipos, inferencia, auxiliares |
| `src/compiler/codegen/misc/` | Auxiliares, new-expr, closures, arrays |
| `src/compiler/codegen/async/` | Async: statements, emisión, generadores, auxiliares, escaneo |
| `src/compiler/codegen/generics.js` | Monomorfización de genéricos |
| `src/runtime/runtime.h` | Archivo de encabezado del runtime C |

## Metodología de pruebas

Cada componente se implementa en un ciclo:

```
1. Tests     — corpus (input.tsc → expected.c / expected.error)
2. Implementación — hasta que todos los tests pasen
3. Log       — log/<componente>.md: decisiones, problemas, cambios
```

Corpus de tests: `test/cases/phase0–phase19`, 1028 tests en total. El formato se describe en `test/CORPUS.md`.

## Subpáginas

| Página | Descripción |
|------|-------------|
| [Fases de compilación](./phases.md) | Parse → AST → Decorator → Typecheck → IR → Ownership → Codegen |
| [Name mangling](./name-mangling.md) | Esquema formal, codificación de tipos, slug de módulo, colisiones |
| [Debug info](./debug.md) | Directivas `#line`, servidor DAP, depuración embebida |
| [Optimización](./optimization.md) | Niveles O0–O3/Os, monomorfización del lado del consumidor, incremental *(hoja de ruta)* |

## Errores

| Error | Causa |
|-------|-------|
| `type name must start with uppercase letter` | Nombre de clase/interfaz no en PascalCase |
| `type name uses reserved mangling prefix` | Uso de `ref_`, `mut_`, `arc_`, `opt_`, `arr_` en un nombre de tipo |
| `error[TSC-EXXX]` | Código de error estable — buscable en la documentación |

## Ver también

- [Decoradores](../04-classes/decorators.md) — paso decorador: algoritmo y limitaciones
- [Modelo de memoria](../05-memory/index.md) — propiedad, borrow checker, instrucciones IR
- [Sistema de build](../09-build/index.md) — CMake, perfiles, targets embebidos
