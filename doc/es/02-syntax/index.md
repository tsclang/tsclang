# Sintaxis

[← Arriba](../index.md) | [Siguiente →](./formatting.md)

---

Descripción completa de la sintaxis de TSClang. El lenguaje sigue las convenciones de TypeScript/JavaScript con extensiones para la gestión segura de la memoria.

## Secciones

### Conceptos básicos
- [Formato](./formatting.md) — punto y coma, indentación, comillas, linter
- [Truthy / Falsy](./truthy-falsy.md) — qué valores se consideran verdaderos/falsos

### Variables
- [let / const](./variables/index.md) — mutabilidad, diferencias de propiedad

### Funciones
- [Declaración](./functions/declaration.md) — `function`, parámetros, tipo de retorno
- [Flecha](./functions/arrow.md) — sintaxis `=>`
- [Sobrecarga](./functions/overload.md) — por tipo y cantidad de parámetros
- [Parámetros por defecto](./functions/default-params.md) — valores por defecto

### Operadores
- [Aritméticos](./operators/arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Asignación](./operators/assignment.md) — `=`, `+=`, `-=`, etc.
- [Comparación](./operators/comparison.md) — `==`, `!=`, `===`, `!==`
- [Lógicos](./operators/logical.md) — `&&`, `||`, `!`, `??`
- [A nivel de bits](./operators/bitwise.md) — `&`, `|`, `^`, `~`, `<<`, `>>`
- [Opcionales](./operators/optional.md) — `?.`, `??`, spread `...`
- [Precedencia de operadores](./operators/precedence.md) — tabla de precedencia

### Bucles
- [for](./loops/for.md) — bucle clásico
- [for-of](./loops/for-of.md) — iteración sobre colecciones
- [while / do-while](./loops/while.md) — bucles condicionales
- [break / continue](./loops/break-continue.md) — control de iteración

### Control de flujo
- [switch](./match/switch.md) — selección por valor
- [match](./match/index.md) — coincidencia de patrones

### Segmentos
- [Indexación y segmentos](./slices.md) — `[]`, `[a..b]`, índices negativos

## Ver también

- [Tipos](../03-types/index.md) — sistema de tipos
- [Modelo de memoria](../05-memory/index.md) — propiedad y verificador de préstamos
