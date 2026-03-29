# TSClang — Обработка ошибок

## Принцип

Синтаксис как в TypeScript (`throw`, `try`/`catch`/`finally`), но под капотом компилируется в **Result-структуры в C** — без `setjmp`/`longjmp`. Это даёт:

- **Zero-cost**: нет сохранения регистров на каждом `try`-блоке
- **Безопасный C interop**: нет `longjmp` через сторонний C-код
- **Корректный ownership**: обычный control flow, компилятор знает все owned переменные

## Объявление функции с ошибками

Функция объявляет `throws` в сигнатуре. Компилятор может вывести `throws` автоматически, если внутри есть `throw`, но явное объявление является документацией:

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Без `throws` — функция не может содержать `throw` (ошибка компилятора).

## throw

Бросается экземпляр класса-наследника `Error`:

```typescript
class IOError extends Error { }

function readFile(path: string): string throws IOError {
    if (!exists(path)) {
        throw new IOError(`file not found: ${path}`);
    }
    return read(path);
}
```

## try / catch / finally

```typescript
try {
    const content = readFile("data.txt");
    console.log(content);
} catch (e: IOError) {
    console.log(e.message);
} finally {
    cleanup();  // выполняется всегда
}
```

Несколько `catch`-блоков — диспатч по типу:

```typescript
try {
    const r = fetch("https://...");
    process(r);
} catch (e: IOError) {
    console.log("IO:", e.message);
} catch (e: NetworkError) {
    console.log("Network:", e.message);
} finally {
    closeConnection();
}
```

Union catch — обработка нескольких типов в одном блоке:

```typescript
try {
    fetch("https://...");
} catch (e: IOError | NetworkError) {
    console.log("error:", e.message);  // тип e = IOError | NetworkError
}
```

**Exhaustive handling внутри union catch** — через `match` или `instanceof`:

```typescript
// match — exhaustive, _ не нужен (компилятор знает все типы из union)
try {
    fetch("https://...")
} catch (e: IOError | NetworkError) {
    match (e) {
        IOError { message }   => console.log("io:", message),
        NetworkError { code } => console.log("net:", code),
        // _ запрещён — компилятор предупреждает: unreachable pattern
    }
}

// instanceof — narrowing с else
try {
    fetch("https://...")
} catch (e: IOError | NetworkError) {
    if (e instanceof IOError) {
        console.log("io:", e.message)   // e: IOError
    } else {
        console.log("net:", e.code)     // e: NetworkError
    }
}
```

Диспатч в обоих случаях компилируется через `_kind` из Result-struct — без `type_id` в Error, без vtable.

## Union errors

Функция может бросать несколько типов ошибок:

```typescript
function process(path: string): Response throws IOError | NetworkError {
    const content = readFile(path);  // throws IOError
    return fetch(content);           // throws NetworkError
}
```

Компилятор объединяет `throws`-типы автоматически при вызове функций внутри тела.

## Оператор `?` — propagate

`expr?` — если функция вернула ошибку, немедленно вернуть её из текущей функции. Текущая функция обязана иметь совместимый `throws`:

```typescript
function process(path: string): string throws IOError | NetworkError {
    const content = readFile(path)?;   // propagate IOError
    const r = fetch(content)?;         // propagate NetworkError
    return r.body;
}
```

Несовместимый `throws` — ошибка компилятора:

```typescript
function main(): void {
    const data = readFile("x")?;
    // ошибка: main не объявляет throws, нельзя использовать ?
}
```

## Оператор `!` — unwrap или panic

`expr!` — если функция вернула ошибку, вызвать `abort()` (runtime panic). Не требует `throws` у текущей функции:

```typescript
function main(): void {
    const content = readFile("config.txt")!;  // panic если ошибка
    console.log(content);
}
```

## C-output

`throws` меняет C-сигнатуру функции: возвращаемый тип оборачивается в Result-структуру. Для `throws IOError | NetworkError`:

```c
// Генерируется компилятором
typedef enum { _ERR_IO, _ERR_NETWORK } _fetch_err_kind;

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

_Result_Response_IOError_NetworkError fetch(String url) { ... }
```

`try/catch` компилируется в `if/else` по полю `ok` и `_kind`:

```c
_Result_Response_IOError_NetworkError _r = fetch(str("https://..."));
if (_r.ok) {
    Response r = _r.value;
    process(r);
    Response_free(r);
} else if (_r._kind == _ERR_IO) {
    IOError e = _r._err.io;
    printf("IO: %s\n", e.message.data);
    IOError_free(e);
} else if (_r._kind == _ERR_NETWORK) {
    NetworkError e = _r._err.net;
    printf("Network: %s\n", e.message.data);
    NetworkError_free(e);
}
// finally
closeConnection();
```

Оператор `?`:
```c
_Result_String_IOError _r = readFile(str("x"));
if (!_r.ok) return (_Result_String_NetworkError){ .ok = false, ._err = ... };
String content = _r.value;
```

Оператор `!`:
```c
_Result_String_IOError _r = readFile(str("config.txt"));
if (!_r.ok) { fprintf(stderr, "panic\n"); abort(); }
String content = _r.value;
```

## Ownership при ошибках

Компилятор отслеживает все owned переменные в `try`-блоке. Если выбрасывается ошибка, все уже инициализированные owned переменные корректно освобождаются через обычный control flow — никаких специальных механизмов не нужно, так как это просто `if/else` в C:

```typescript
function process(): void throws IOError {
    const a = new Foo();     // owned
    const b = new Bar();     // owned
    riskyOp()?;              // если ошибка → a и b освобождаются в else-ветке
    use(a, b);
}
```

Генерируется:
```c
// try-ветка
Foo* a = Foo_new();
Bar* b = Bar_new();
_Result_void_IOError _r = riskyOp();
if (!_r.ok) {
    Foo_free(a);   // компилятор генерирует cleanup
    Bar_free(b);
    return (_Result_void_IOError){ .ok = false, ._err = _r._err };
}
use(a, b);
Foo_free(a);
Bar_free(b);
```

## Ограничения

- `throw` запрещён в функциях без `throws` — ошибка компилятора
- `?` запрещён в функции без `throws` — ошибка компилятора
- Исключения нельзя бросать через C interop границы — функции, объявленные как `extern "C"`, не могут содержать `throws`
- `finally` не может содержать `throw` или `return` — ошибка компилятора (неопределённое поведение)

### Result-структуры и стек на embedded

`throws` оборачивает возвращаемый тип в Result-struct в C. Для малых типов это незначительно (8–16 байт). Для крупных value-типов на памяти-ограниченных платформах (AVR: стек 256–2048 байт) Result-struct может быть заметным:

```typescript
// Matrix4x4 = 64 байта на AVR → _Result_Matrix4x4_Error ≈ 65 байт на стеке
function getMatrix(): Matrix4x4 throws Error { ... }
```

Компилятор учитывает Result-структуры в анализе worst-case стека (см. `stack_size` в Platform Profile) и предупреждает при превышении. Для крупных типов на embedded — предпочитать выходной параметр:

```typescript
// ✅ альтернатива: out-параметр вместо крупного возвращаемого типа
function getMatrix(out: Mut<Matrix4x4>): void throws Error { ... }
```
