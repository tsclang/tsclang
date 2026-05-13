# Introducción a TSClang

[← Arriba](../index.md) | [Siguiente →](./what-is-tsclang.md)

---

TSClang es un lenguaje con sintaxis de TypeScript que compila a C.

- **TypeScript como sintaxis** — `let`/`const` familiares, clases, funciones flecha, `async`/`await`
- **C como destino de compilación** — se genera código C legible + `CMakeLists.txt`
- **Rust como modelo de seguridad** — propiedad, verificador de préstamo, `Ref<T>`, `Mut<T>`
- **npm como experiencia de ecosistema** — `tsc.package.json`, `tsclang install`, registro de paquetes

## Secciones

- [Qué es TSClang](./what-is-tsclang.md) — por qué, para quién, casos de uso
- [Filosofía de diseño](./design-philosophy.md) — tres prioridades: seguridad, rendimiento, sintaxis TS
- [Inicio rápido](./quick-start.md) — instalación, hola mundo, compilar y ejecutar
- [CLI](./cli.md) — vista general de comandos: `build`, `init`, `lint`, `migrate`, `lsp`

## Ver también

- [Sintaxis](../02-syntax/index.md) — construcciones del lenguaje
- [Modelo de memoria](../05-memory/index.md) — propiedad y verificador de préstamo
