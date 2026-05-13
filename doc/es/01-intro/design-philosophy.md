# Filosofía de diseño

[← Arriba](./index.md) | [Siguiente →](./quick-start.md) | [Anterior ←](./what-is-tsclang.md)

---

En cada decisión de diseño TSClang sigue una jerarquía estricta de prioridades:

## Tres prioridades

1. **Seguridad de memoria** — propiedad, verificador de préstamo, sin GC
2. **Rendimiento y tipado** — abstracciones de coste cero, tipos estrictos
3. **Sintaxis de TS** — conservar tanto como sea posible, pero no a costa de #1 y #2

El objetivo no es "el código TS existente compila sin cambios", sino "el desarrollador de TS reconoce la sintaxis y se siente como en casa".

## La sintaxis de TS tiene prioridad

Pedir prestada sintaxis de Rust, C, Go — solo si TS no tiene un constructo adecuado.

Los nuevos conceptos se integran a través de sintaxis compatible con TS:

| Concepto | Rust | TSClang |
|----------|------|---------|
| Préstamo inmutable | `&T` | `Ref<T>` |
| Préstamo mutable | `&mut T` | `Mut<T>` |
| Variable mutable | `let mut` | `let mut` |
| Solo lectura | `let` (por defecto) | `const` / `readonly` |

Las clases se conservan, a pesar de su ausencia en Rust — existen en TS y son familiares para los desarrolladores.

## Pregunta para cada decisión

> *¿Se puede expresar esto a través de la sintaxis existente de TS o su extensión natural?*

Si sí — usar sintaxis de TS. Si no — encontrar la extensión mínima que no entre en conflicto con TS.

## Compatibilidad hacia atrás

El código nativo simple de TS sin bibliotecas externas debería compilar o requerir correcciones triviales que sigan siendo TS válido:

```typescript
let a = 10          // puede requerir anotación explícita
let a: number = 10  // válido tanto en TS como en TSClang
```

El código con clases, objetos, arrays, bucles, literales de plantilla — funciona tal cual o con cambios mínimos.

## Ver también

- [Qué es TSClang](./what-is-tsclang.md) — visión general del lenguaje
- [Modelo de memoria](../05-memory/index.md) — cómo funcionan la propiedad y el verificador de préstamo
- [Guía de migración](../12-migration/index.md) — portar código TS a TSClang
