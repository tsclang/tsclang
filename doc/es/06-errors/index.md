# Manejo de errores

[← Arriba](../index.md) | [Siguiente →](./throw-try.md)

---

TSClang utiliza la sintaxis `throw`/`try`/`catch`/`finally` como TypeScript, pero compila los errores en **estructuras Result en C** — sin `setjmp`/`longjmp`. Esto proporciona:

- **Cero costo**: sin guardar registros en cada bloque `try`
- **Interoperabilidad C segura**: sin `longjmp` a través de código C de terceros
- **Propiedad correcta**: flujo de control ordinario, el compilador conoce todas las variables poseídas

## Principio

Cada función que puede fallar declara `throws` en su firma. En la salida C, el tipo de retorno se envuelve en una estructura Result con un campo `ok` y una unión para el valor o el error. Los manejadores `try`/`catch` se compilan en `if/else` ordinarios sobre el campo `ok` y `_kind`.

## Conceptos clave

### Declaración throws

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Sin `throws` — una función no puede contener `throw` (error de compilación).

### Error — clase base

Todos los errores heredan de `Error`:

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // solo desktop — puntos de throw "__FILE__:__LINE__"
}
```

### Operadores ? y !

| Operador | Semántica | Requiere `throws`? |
|----------|-----------|-------------------|
| `expr?`  | Propagar — retornar el error desde la función actual | Sí |
| `expr!`  | Desenvolver — pánico (`abort()`) en caso de error | No |

### Estructura Result en C

```c
typedef struct {
    bool ok;
    union {
        Response value;
        struct {
            _fetch_err_kind _kind;
            union {
                IOError io;
                NetworkError net;
            } _err;
        };
    };
} _Result_Response_IOError_NetworkError;
```

### Propiedad con errores

El compilador rastrea todas las variables poseídas en un bloque `try`. En caso de error, todas las variables poseídas ya inicializadas se liberan mediante un flujo de control ordinario (`goto cleanup`).

## Subpáginas

| Página | Descripción |
|----------|----------|
| [throw / try / catch / finally](./throw-try.md) | Sintaxis de manejo de errores, catch por tipo, finally |
| [Estructuras Result](./result.md) | Result<T, E>, unión discriminada, representación C |
| [Operadores ? y !](./operators.md) | Propagar, desenvolver/pánico, salida C |

## Errores

| Error | Causa |
|--------|---------|
| `throw in non-throws function` | `throw` en una función sin `throws` |
| `? operator in non-throws function` | Operador `?` sin `throws` en la función actual |
| `extern "C" cannot throw` | `throws` en una función `extern "C"` |
| `throw/return in finally` | `throw` o `return` dentro de un bloque `finally` |
| `error.stack on embedded` | Acceso a `stack` en una plataforma embebida |

## Restricciones

- `throw` está prohibido en funciones sin `throws`
- `?` está prohibido en una función sin `throws`
- Las excepciones no pueden propagarse a través de límites de interoperabilidad C — `extern "C"` no puede contener `throws`
- `finally` no puede contener `throw` o `return`
- `error.stack` no está disponible en plataformas embebidas

## Ver también

- [Modelo de memoria: Liberación automática](../05-memory/auto-drop.md) — `goto cleanup` con múltiples puntos de salida
- [Modelo de memoria: Propietario](../05-memory/owner.md) — movimiento y propiedad con errores
- [Clases](../04-classes/index.md) — Herencia de Error y tipos de error personalizados
