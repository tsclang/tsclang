# CLI — Visión general de comandos

[← Arriba](./index.md) | [Anterior ←](./quick-start.md)

---

## Lista de comandos

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `tsclang init` | — | Crear nuevo proyecto |
| `tsclang build` | `b` | Compilar proyecto |
| `tsclang run` | `r` | Compilar y ejecutar |
| `tsclang lint` | `l` | Verificar formato |
| `tsclang migrate` | — | Migración TypeScript → TSClang *(roadmap)* |
| `tsclang lsp` | — | Language Server Protocol para IDE *(roadmap)* |

Alias:

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

Crea un proyecto a partir de una plantilla.

```bash
tsclang init myapp                    # ejecutable (por defecto)
tsclang init mylib --library          # biblioteca TSClang
tsclang init sqlite3 --declaration    # C-wrapper (wrapper sobre biblioteca C)
tsclang init                          # en el directorio actual
```

Banderas cortas: `-l` (biblioteca), `-d` (declaración).

## tsclang build

Compila `.tsc` → `.c` → binario (por defecto).

```bash
tsclang build                  # compilar build por defecto
tsclang build <name>           # compilar build específico de la configuración
tsclang build hello.tsc        # archivo único
tsclang build --emit c         # solo generación de C
tsclang build --emit binary    # C + compilar a binario (por defecto)
tsclang build --emit hex       # C + avr-gcc → .hex (para AVR)
tsclang build --outDir ./dist  # sobrescribir outDir
tsclang build --target desktop # especificar objetivo explícitamente
tsclang build --clean          # reconstrucción completa (sin caché)
```

## tsclang run

Compila el binario y lo ejecuta. Equivalente a `tsclang build` + ejecución.

```bash
tsclang run
tsclang run -- args...         # pasar argumentos al programa
```

Solo para `emit: "binary"`.

## tsclang lint

Verifica el estilo de código. Para CI — `tsclang lint` (sin `-fix`) devuelve código de salida 1 en caso de violaciones.

```bash
tsclang lint          # verificar sin cambios
tsclang lint --fix    # formatear código en el lugar (como prettier / gofmt)
```

Diferencia con `tsclang build`:

| Comando | Qué verifica |
|---------|--------------|
| `tsclang build` | Errores semánticos, formato ignorado |
| `tsclang lint` | Semántica + advertencias de estilo, exit 1 en violaciones |
| `tsclang lint --fix` | Formatea código automáticamente |

## tsclang migrate *(roadmap)*

Migración de código TypeScript a TSClang.

```bash
tsclang migrate ./src            # mostrar qué cambiará (dry-run)
tsclang migrate ./src --fix      # aplicar cambios
tsclang migrate ./src --check    # modo CI: exit 1 si existen incompatibilidades
```

## tsclang lsp *(roadmap)*

Language Server Protocol para IDE (VS Code, Neovim, etc.).

```bash
tsclang lsp               # transporte stdio
tsclang lsp --port 7777   # transporte TCP
```

## Ver también

- [Inicio rápido](./quick-start.md) — instalación y primer proyecto
- [Sistema de compilación](../09-build/index.md) — configuración, perfiles, plataformas
- [Guía de migración](../12-migration/index.md) — portar código TS
