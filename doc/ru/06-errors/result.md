# Result-структуры

[← Вверх](./index.md) | [Следующий →](./operators.md) | [Предыдущий ←](./throw-try.md)

---

`throws` в сигнатуре функции оборачивает возвращаемый тип в **Result-структуру** в C-output. Это discriminated union с полем `ok` для отделения нормального значения от ошибки.

## Структура Result

Для функции `fetch(url: string): Response throws IOError | NetworkError` генерируется:

```c
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

### Поля

| Поле | Тип | Описание |
|------|-----|----------|
| `ok` | `bool` | `true` — значение, `false` — ошибка |
| `value` | `Response` | Нормальное возвращаемое значение (при `ok == true`) |
| `_kind` | `_fetch_err_kind` | Дискриминатор типа ошибки (при `ok == false`) |
| `_err` | anonymous union | Данные конкретной ошибки (при `ok == false`) |

## Именование

- Result-тип: `_Result_<ReturnType>_<Err1>_<Err2>_...`
- Error kind enum: `<func>_err_kind` с значениями `_ERR_<TYPE>`
- Для одного типа ошибки `_kind` не генерируется — ошибка хранится напрямую в `_err`

### Пример: один тип ошибки

```typescript
function readFile(path: string): string throws IOError { ... }
```

```c
typedef struct {
    bool ok;
    union {
        String value;
        IOError _err;
    };
} _Result_String_IOError;

_Result_String_IOError readFile(String path) { ... }
```

### Пример: void с ошибкой

```typescript
function process(): void throws IOError { ... }
```

```c
typedef struct {
    bool ok;
    IOError _err;
} _Result_void_IOError;

_Result_void_IOError process(void) { ... }
```

При `ok == true` и `void`-возвращаемом типе — `value` отсутствует.

## Диспатч по _kind

`try`/`catch` компилируется в `if/else` по полям `ok` и `_kind`:

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

Диспатч через `_kind` — без `type_id` в Error, без vtable. Компилятор знает все варианты из `throws`-объявления.

## _free и ownership

Каждая ветка `catch` получает ownership над объектом ошибки. Компилятор генерирует `<Type>_free()` в конце catch-блока:

```c
if (_r.ok) {
    Response r = _r.value;
    process(r);
    Response_free(r);       // cleanup при успехе
} else if (_r._kind == _ERR_IO) {
    IOError e = _r._err.io;
    printf("IO: %s\n", e.message.data);
    IOError_free(e);        // cleanup ошибки
} else if (_r._kind == _ERR_NETWORK) {
    NetworkError e = _r._err.net;
    printf("Network: %s\n", e.message.data);
    NetworkError_free(e);   // cleanup ошибки
}
```

Owned-переменные из `try`-блока также освобождаются при ошибке — компилятор вставляет `_free()` в `else`-ветку.

## Propagate через Result

Оператор `?` возвращает ошибку через Result-структуру вызывающей функции:

```typescript
function process(path: string): string throws IOError | NetworkError {
    const content = readFile(path)?;   // propagate IOError
    const r = fetch(content)?;         // propagate NetworkError
    return r.body;
}
```

```c
_Result_String_IOError _r1 = readFile(str(path));
if (!_r1.ok) {
    return (_Result_String_NetworkError){ .ok = false, ._err = _r1._err };
}
String content = _r1.value;

_Result_Response_NetworkError _r2 = fetch(content);
if (!_r2.ok) {
    String_free(content);
    return (_Result_String_NetworkError){ .ok = false, ._err = _r2._err };
}
```

Ошибка «оборачивается» в Result-тип текущей функции и возвращается немедленно.

## Result на embedded

Result-структура размещается на стеке. Для крупных value-типов на памяти-ограниченных платформах (AVR: стек 256–2048 байт) это может быть заметно:

```typescript
// Matrix4x4 = 64 байта → _Result_Matrix4x4_Error ≈ 65 байт на стеке
function getMatrix(): Matrix4x4 throws Error { ... }
```

Компилятор учитывает Result-структуры в анализе worst-case стека и предупреждает при превышении. Альтернатива — out-параметр:

```typescript
function getMatrix(out: Mut<Matrix4x4>): void throws Error { ... }
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `throw in non-throws function` | Функция без `throws` содержит `throw` |
| `extern "C" cannot throw` | `throws` в `extern "C"` функции — Result-структура нарушает ABI |
| `stack size exceeded on embedded` | Result-структура слишком велика для стека embedded-платформы |

## См. также

- [Обработка ошибок — обзор](./index.md) — общие принципы
- [throw / try / catch / finally](./throw-try.md) — синтаксис обработки ошибок
- [Операторы ? и !](./operators.md) — propagate и unwrap через Result
- [Модель памяти: Auto Drop](../05-memory/auto-drop.md) — `_free()` при cleanup
