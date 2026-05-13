# Inicio rápido

[← Arriba](./index.md) | [Siguiente →](./cli.md) | [Anterior ←](./design-philosophy.md)

---

## Requisitos

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16 (para compilación a binario)
- **Compilador de C** — gcc, clang o avr-gcc (para AVR)

## Instalación

```bash
npm install -g tsclang

tsclang --version
```

Ejecución sin instalación:

```bash
npx tsclang build
```

## Crear un proyecto

```bash
tsclang init myapp
cd myapp
```

Crea la estructura:

```
myapp/
  tsc.package.json
  src/
    main.tsc
```

`tsc.package.json`:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc"
}
```

## Hello world

`src/main.tsc`:

```typescript
console.log("Hello world")
```

## Compilar y ejecutar

```bash
tsclang build                  # generar C + compilar a binario
tsclang build --emit c         # solo generación de C (sin compilación)
tsclang run                    # compilar y ejecutar
```

Resultado de la compilación:

```
dist/
  main.c              # código C generado
  CMakeLists.txt      # para compilación manual
  myapp               # binario (si --emit binary)
```

## Compilación de archivo único

Sin `tsc.package.json` — simplemente pasa el archivo:

```bash
tsclang build hello.tsc
```

## Qué sigue

- [Sintaxis](../02-syntax/index.md) — constructos del lenguaje
- [Modelo de memoria](../05-memory/index.md) — propiedad, préstamo, `Ref<T>`
- [CLI](./cli.md) — todos los comandos

## Ver también

- [CLI](./cli.md) — descripción completa de comandos
- [Sistema de compilación](../09-build/index.md) — configuración, plataformas, perfiles
