# Qué es TSClang

[← Arriba](./index.md) | [Siguiente →](./design-philosophy.md)

---

TSClang es un lenguaje compilado con sintaxis de TypeScript que traduce archivos `.tsc` a código C legible y genera automáticamente `CMakeLists.txt`.

## Por qué

Muchos desarrolladores migran de TypeScript a C — y duele. C carece de un ecosistema decente: no tiene gestor de paquetes, no tiene compilación cruzada conveniente, no tiene comprobaciones de seguridad de memoria integradas.

TSClang resuelve esto:

- **Sintaxis familiar** — un desarrollador de TS reconoce los constructos y es inmediatamente productivo
- **Memoria segura** — propiedad y verificador de préstamo en tiempo de compilación, sin GC
- **Ecosistema unificado** — dependencias, compilación cruzada, builds listos para usar
- **Salida en C legible** — se puede inspeccionar, depurar y combinar con C escrito a mano

## Para qué

**Ahora:**

- Código de servidor — HTTP, sockets, backends
- Escritorio — CLI/TUI, gestores de archivos, aplicaciones de oficina

**Importante:**

- Nivel de sistema — controladores, sistemas operativos
- Embebido — Arduino, ESP, Raspberry Pi
- Juegos — vía OpenGL, DirectX

**Sueño:**

- Multiplataforma — Windows, Linux, Mac, Android, iOS
- Plataformas retro — ZX Spectrum, NES, Sega, MS-DOS

## Extensión de archivo

`.tsc` — archivo fuente de TSClang.

```typescript
// hello.tsc
console.log("Hello world")
```

Compila a:

```c
// hello.c
#include "runtime.h"
int main(void) {
    tsc_console_log(tsc_string_from_cstr("Hello world"));
    return 0;
}
```

## Ver también

- [Filosofía de diseño](./design-philosophy.md) — tres prioridades del lenguaje
- [Inicio rápido](./quick-start.md) — instalación y primer proyecto
- [Modelo de memoria](../05-memory/index.md) — propiedad y verificador de préstamo
