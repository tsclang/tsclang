# Modelo de memoria

[← Arriba](../index.md) | [Siguiente →](./ownership-types.md)

---

TSClang utiliza un **modelo de gestión de memoria híbrido**: verificador estático de propiedad/préstamo + ARC opcional. Sin GC, sin `free` manual.

## Principio

El compilador rastrea estáticamente al propietario de cada valor. La desasignación de memoria es determinista, al final del ámbito del propietario. Para los casos donde el análisis estático es insuficiente (grafos, ciclos) — `Shared<T>` con conteo de referencias atómico (ARC).

## Tipos de propiedad

| Tipo | Semántica | Descripción |
|------|-----------|-------------|
| `T` | **Propietario** | Propiedad total, movimiento al transferir |
| `Ref<T>` | **Préstamo inmutable** | Solo lectura, sin modificación ni eliminación |
| `Mut<T>` | **Préstamo mutable** | Lectura y escritura, solo un `Mut` a la vez |
| `Shared<T>` | **ARC** | Ref fuerte, incrementa el contador, solo desktop |
| `Weak<T>` | **Ref débil** | No incrementa el contador, rompe ciclos |
| `Slice<T>` | **Vista prestada de arreglo** | Subrango sin copia, puntero + longitud |

## Reglas básicas

- **Primitivos** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — siempre **copiados**, el verificador de préstamo no aplica
- **Tipos complejos** (arreglos, objetos, cadenas, clases) — gestionados por el sistema de propiedad
- `string` — Propietario asignado en el heap, pasado como `Ref<string>`, copiado mediante `clone()`

## Verificador de préstamo

Regla **Aliasing XOR mutabilidad**: dos `Mut` simultáneamente no están permitidos, `Mut` + `Ref` no está permitido, pero varios `Ref` simultáneamente sí lo están.

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // ok — múltiples Ref permitidos
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // error: ya existe un Mut activo
```

## Liberación automática

El compilador inserta `free()` al final del ámbito del propietario. Con múltiples `return` y `throw` — punto de limpieza único mediante `goto cleanup`:

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... trabajo ...
cleanup:
    if (u) User_free(u);
}
```

## Subpáginas

| Página | Descripción |
|------|-------------|
| [Tipos de propiedad](./ownership-types.md) | Vista general de todos los tipos de propiedad y sus representaciones C |
| [Propietario (T)](./owner.md) | Propiedad total, movimiento en asignación y transferencia |
| [Ref<T>](./ref.md) | Préstamo inmutable, patrones de vista |
| [Mut<T>](./mut.md) | Préstamo mutable, reglas de exclusividad |
| [Shared<T> y Weak<T>](./shared.md) | ARC y referencias débiles para grafos y ciclos |
| [Slice<T>](./slice.md) | Vista sin copia sobre parte de un arreglo o cadena |
| [Verificador de préstamo](./borrow-checker.md) | Reglas de aliasing, duración, restricciones de ámbito |
| [Drop y limpieza](./drop.md) | Desasignación automática, `goto cleanup` |
| [Desestructuración](./destructuring.md) | Préstamo vs movimiento al desestructurar campos |
| [Clausuras](./closures.md) | Reglas de captura: copia, Ref, Mut, movimiento |
| [Iteradores](./iterators.md) | `Iterable<T>`, iteradores pull-based en pila |

## Salida C

```typescript
let user = new User();
user.name = "Alice";
// fin de ámbito — User_free llamado automáticamente
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... uso ...
User_free(&user);   // insertado por el compilador
```

## Errores

| Error | Causa |
|-------|-------|
| `use of moved value: "x"` | Acceso a una variable después de moverla |
| `already borrowed as Mut` | Segundo `Mut` o `Ref` mientras un `Mut` está activo |
| `already borrowed as Ref` | `Mut` mientras un `Ref` está activo |
| `Ref<T> not allowed in class field` | Intento de almacenar un préstamo en un campo de clase |
| `cannot move out of array by index` | `arr[i]` para un tipo poseído sin `.remove()` |

## Ver también

- [Variables: let / const](../02-syntax/variables/index.md) — impacto de `let`/`const` en `Mut<T>` / `Ref<T>`
- [Funciones](../02-syntax/functions/declaration.md) — reglas de paso de argumentos
- [Clases](../04-classes/index.md) — métodos `mut` y campos `readonly`
- [Errores](../06-errors/index.md) — `goto cleanup` en `throw` / `?`
