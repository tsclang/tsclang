# throw / try / catch / finally

[← Вверх](./index.md) | [Следующий →](./result.md) | [Предыдущий ←](./index.md)

---

TSClang использует знакомый TypeScript-синтаксис `throw`/`try`/`catch`/`finally` для обработки ошибок. Под капотом это компилируется в Result-структуры и `if/else` — без `setjmp`/`longjmp`.

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

`throw` разрешён только в функциях с `throws`-объявлением. Без `throws` — ошибка компиляции.

## throws-объявление

Функция объявляет типы ошибок в сигнатуре:

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Компилятор может вывести `throws` автоматически, если внутри есть `throw`, но явное объявление является документацией.

### Union errors

Функция может бросать несколько типов ошибок:

```typescript
function process(path: string): Response throws IOError | NetworkError {
    const content = readFile(path);   // throws IOError
    return fetch(content);            // throws NetworkError
}
```

Компилятор объединяет `throws`-типы автоматически при вызове функций внутри тела.

## try / catch

### Базовый try/catch

```typescript
try {
    const content = readFile("data.txt");
    console.log(content);
} catch (e: IOError) {
    console.log(e.message);
}
```

### C-output

```c
_Result_String_IOError _r = readFile(str("data.txt"));
if (_r.ok) {
    String content = _r.value;
    printf("%s\n", content.data);
    String_free(content);
} else {
    IOError e = _r._err;
    printf("%s\n", e.message.data);
    IOError_free(e);
}
```

### Несколько catch-блоков

Диспатч по типу ошибки — компилируется через `_kind`:

```typescript
try {
    const r = fetch("https://...");
    process(r);
} catch (e: IOError) {
    console.log("IO:", e.message);
} catch (e: NetworkError) {
    console.log("Network:", e.message);
}
```

### C-output: несколько catch

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
```

### Union catch — несколько типов в одном блоке

```typescript
try {
    fetch("https://...");
} catch (e: IOError | NetworkError) {
    console.log("error:", e.message);   // тип e = IOError | NetworkError
}
```

### Exhaustive handling внутри union catch

Диспатч внутри `catch` — через `match` или `instanceof`:

```typescript
// match — exhaustive, _ не нужен
try {
    fetch("https://...")
} catch (e: IOError | NetworkError) {
    match (e) {
        IOError { message }   => console.log("io:", message),
        NetworkError { code } => console.log("net:", code),
    }
}
```

```typescript
// instanceof — narrowing с else
try {
    fetch("https://...")
} catch (e: IOError | NetworkError) {
    if (e instanceof IOError) {
        console.log("io:", e.message);      // e: IOError
    } else {
        console.log("net:", e.code);        // e: NetworkError
    }
}
```

Диспатч компилируется через `_kind` из Result-struct — без `type_id` в Error, без vtable.

## finally

`finally` выполняется **всегда** — как при успехе, так и при ошибке:

```typescript
try {
    const content = readFile("data.txt");
    console.log(content);
} catch (e: IOError) {
    console.log(e.message);
} finally {
    cleanup();   // выполняется всегда
}
```

### C-output: finally

```c
_Result_String_IOError _r = readFile(str("data.txt"));
if (_r.ok) {
    String content = _r.value;
    printf("%s\n", content.data);
    String_free(content);
} else {
    IOError e = _r._err;
    printf("%s\n", e.message.data);
    IOError_free(e);
}
cleanup();   // вызывается в любом случае
```

### Ограничения finally

- `finally` не может содержать `throw` — ошибка компиляции
- `finally` не может содержать `return` — ошибка компиляции (неопределённое поведение)

## Error.stack

`error.stack` доступен только на **desktop/server**. Содержит `__FILE__:__LINE__` точки `throw`:

```typescript
try {
    throw new IOError("not found");
} catch (e: IOError) {
    console.log(e.stack);   // "IOError at src/main.tsc:42"
}
```

На **embedded**-платформах обращение к `stack` — ошибка компиляции.

## Ownership при ошибках

Компилятор отслеживает все owned-переменные в `try`-блоке. При ошибке все уже инициализированные освобождаются через обычный control flow:

```typescript
function process(): void throws IOError {
    const a = new Foo();     // owned
    const b = new Bar();     // owned
    riskyOp()?;              // если ошибка → a и b освобождаются
    use(a, b);
}
```

### C-output: cleanup при ошибке

```c
void process(void) {
    Foo* a = Foo_new();
    Bar* b = Bar_new();
    _Result_void_IOError _r = riskyOp();
    if (!_r.ok) {
        Foo_free(a);    // компилятор генерирует cleanup
        Bar_free(b);
        return (_Result_void_IOError){ .ok = false, ._err = _r._err };
    }
    use(a, b);
    Foo_free(a);
    Bar_free(b);
}
```

Никаких специальных механизмов — просто `if/else` в C, компилятор знает все owned-переменные на каждом пути выполнения.

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `throw in non-throws function` | `throw` в функции без `throws`-объявления |
| `throw/return in finally` | `throw` или `return` внутри `finally`-блока |
| `error.stack on embedded` | Обращение к `.stack` на embedded-платформе |
| `unreachable pattern in catch match` | `_` в exhaustive match внутри union catch |

## См. также

- [Обработка ошибок — обзор](./index.md) — общие принципы и Result-структуры
- [Result-структуры](./result.md) — устройство Result<T, E> в C-output
- [Операторы ? и !](./operators.md) — propagate и unwrap
- [Модель памяти: Auto Drop](../05-memory/auto-drop.md) — `goto cleanup` и освобождение при ошибках
