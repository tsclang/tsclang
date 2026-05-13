# Sistema de build

[← Arriba](../index.md) | [Siguiente →](./projects.md)

---

El sistema de build de TSClang compila los archivos `.tsc` a C99 y construye un binario mediante CMake. Soporta aplicaciones desktop, bibliotecas, wrappers C para bibliotecas C nativas, y targets embebidos (AVR, ARM, plataformas retro).

## Pipeline

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (o .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

Estructura de `outDir`:

```
build/desktop/
  c/              ← .c y .h generados
  CMakeLists.txt
  myapp           ← binario (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## Inicio rápido

```bash
npm install -g tsclang   # instalar el compilador
tsclang init myapp       # crear proyecto
cd myapp
tsclang install          # instalar dependencias
tsclang run              # build y ejecución
```

## Tipos de proyectos

| Tipo | Descripción | `"type"` | Punto de entrada |
|------|-------------|----------|-------------|
| **Ejecutable** | Aplicación | no especificado (defecto) | `"main"` (requerido) |
| **Biblioteca TSClang** | Biblioteca TSClang | `"library"` | `index.tsc` (convención) |
| **Wrapper C** | Wrapper sobre biblioteca C | `"library"` | `index.d.tsc` |
| **Perfil de plataforma** | Perfil de plataforma | `"platform"` | `index.d.tsc` |

## Comandos CLI

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `tsclang init` | — | Crear nuevo proyecto |
| `tsclang build` | `b` | Build del proyecto |
| `tsclang run` | — | Build y ejecución |
| `tsclang dev` | — | Modo watch |
| `tsclang install` | `i` | Instalar dependencias |
| `tsclang update` | `u` | Actualizar dependencias |
| `tsclang remove` | `r` | Eliminar dependencia |
| `tsclang clean` | `c` | Eliminar artefactos de build |
| `tsclang lint` | `l` | Verificar formato |
| `tsclang migrate` | — | Migración TypeScript → TSClang *(hoja de ruta)* |
| `tsclang lsp` | — | Language Server Protocol *(hoja de ruta)* |

## Subpáginas

| Página | Descripción |
|------|-------------|
| [Tipos de proyectos](./projects.md) | Ejecutable, biblioteca, wrapper C, perfil de plataforma |
| [Configuración](./config.md) | Campos de `tsc.package.json`, builds, platformSettings |
| [CLI](./cli.md) | Comandos build, run, init, lint, migrate, lsp |
| [Gestor de paquetes](./packages.md) | install, publish, search, workspaces, archivo de bloqueo |
| [Build embebido](./embedded.md) | AVR, ARM, plataformas retro, binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt, perfiles debug/release, optimización |

## C generado

```c
// build/desktop/c/main.c — generado desde src/main.tsc
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## Errores

| Error | Causa |
|-------|-------|
| `cannot determine entry point` | Campo `"main"` no especificado para un ejecutable |
| `unknown target arch '6502'` | Arquitectura desconocida sin perfil de plataforma |
| `toolchain 'avr-gcc' not found in PATH` | Compilador no instalado |
| `dependency conflict` | Restricciones semver incompatibles |

## Ver también

- [Módulos: Import/Export](../08-modules/import-export.md) — punto de entrada e inicialización
- [Memoria: Propiedad](../05-memory/ownership-types.md) — owned/borrow durante FFI
- [Concurrencia](../07-concurrency/index.md) — runtime async: libuv, cooperativo, none
