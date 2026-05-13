# Migración: TypeScript → TSClang

[← Arriba](../index.md) | [Siguiente →](./automatic.md)

---

Guía para desarrolladores que migran de TypeScript a TSClang. Describe las conversiones automáticas y manuales, los patrones incompatibles y las nuevas capacidades.

## Visión general del proceso

TSClang busca la máxima compatibilidad con la sintaxis de TypeScript. La mayor parte del código TypeScript se porta sin cambios o con ediciones mínimas. El proceso de migración se divide en tres etapas:

1. **Correcciones automáticas** — `tsclang migrate` aplica transformaciones mecánicas
2. **Correcciones manuales** — patrones que no pueden automatizarse de forma segura
3. **Patrones incompatibles** — constructos sin análogo directo, que requieren rediseño

## Verificación rápida

```bash
tsclang migrate ./src            # dry-run: mostrar qué va a cambiar
tsclang migrate ./src --fix      # aplicar correcciones automáticas
tsclang migrate ./src --check    # CI: exit 1 si existen incompatibilidades
```

## Qué migra sin cambios

Las interfaces, las funciones con tipos, las funciones flecha, las clases (sin `extends`), los genéricos, `try/catch`, las template strings, la desestructuración — todo esto funciona como en TypeScript. Detalles — en [Migración manual](./manual.md).

## Subpáginas

| Página | Descripción |
|------|-------------|
| [Migración automática](./automatic.md) | `tsclang migrate`: dry-run, --fix, --check, lista de auto-transformaciones |
| [Migración manual](./manual.md) | Qué funciona tal cual y qué requiere correcciones manuales |
| [Patrones incompatibles](./incompatible.md) | Constructos sin análogo y alternativas |
| [Nuevas características](./new-features.md) | Propiedad, Ref/Mut/Shared, match, throws y más |

## Errores

| Error | Causa |
|-------|-------|
| `undefined is not defined` | Uso de `undefined` — reemplazar por `null` |
| `throw requires Error instance` | Lanzar string o número — envolver en `new Error()` |
| `export default is not supported` | Reemplazar por export nombrado |
| `extends is not supported` | Herencia de clases — reemplazar por composición |

## Ver también

- [Introducción: Qué es TSClang](../01-intro/what-is-tsclang.md) — visión general del lenguaje y filosofía
- [Build: CLI](../09-build/cli.md) — comandos `tsclang build`, `tsclang migrate`
- [Modelo de memoria](../05-memory/index.md) — propiedad, borrow checker, Ref/Mut/Shared
