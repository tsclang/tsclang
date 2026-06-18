# TSClang — Обработка ошибок

## Принцип

Синтаксис как в TypeScript (`throw`, `try`/`catch`/`finally`), но под капотом компилируется в **Result-структуры в C** — без `setjmp`/`longjmp`. Это даёт:

- **Zero-cost**: нет сохранения регистров на каждом `try`-блоке
- **Безопасный C interop**: нет `longjmp` через сторонний C-код
- **Корректный ownership**: обычный control flow, компилятор знает все owned переменные

## Объявление функции с ошибками

Функция объявляет `throws` в сигнатуре. Без `throws` — функция не может содержать `throw` (ошибка компилятора). Явное объявление является документацией:

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Без `throws` — функция не может содержать `throw` (ошибка компилятора).

## Error — базовый класс

Все ошибки наследуют от `Error`:

```typescript
class Error {
    readonly message: string   // человекочитаемое описание
}
```

**`error.stack`** — опциональное поле, добавляется пользователем в subclass при необходимости (desktop-only). Полный call stack недоступен (нет рантайм-стека в C-output). На embedded обращение к `stack` — ошибка компилятора.

Пример использования `stack` на desktop:
```typescript
class AppError extends Error {
    readonly stack: string   // desktop-only трейс
}
try {
    throw new AppError("not found")
} catch (e: AppError) {
    console.log(e.stack)   // "AppError at src/main.tsc:42"
}
```

На embedded `error.stack` — ошибка компилятора при обращении.

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

> **Тип в `catch` обязателен.** `catch (e)` без аннотации типа — ошибка компилятора. Компилятор должен знать, какой Result-структуре соответствует обработчик.

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

> **Union catch без привязки `e`.** `catch (e: IOError | NetworkError)` компилируется, но переменная `e` не создаётся — компилятор не знает конкретный тип. Используйте несколько `catch`-блоков, если нужен доступ к полям ошибки.
>
> **instanceof в catch.** `instanceof` требует interface type справа; с классами ошибок (`extends Error`) используйте несколько `catch`-блоков вместо `instanceof`.

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

> **Происхождение:** Rust `?` (не существует в TS). В TS `?` — только тернарный оператор и optional chaining (`?.`).
> В TSClang `?` — postfix-оператор error propagation: вызывает функцию, и при ошибке немедленно возвращает её из текущей функции.

> **Disambiguation `?` (propagate) vs `? :` (ternary):**
> TSClang — единственный язык с одновременно postfix `?` (propagate) и `? :` (ternary).
> Правило разрешения неоднозначности — **whitespace-based**, O(1):
>
> | Условие | Значение |
> |---------|----------|
> | **tight** — нет пробела между предыдущим токеном и `?` (`risky()?`) | propagate |
> | **closed** — следующий токен `)`, `]`, `,`, `;`, EOF (`foo(risky()?)`) | propagate |
> | иначе | ternary (`cond ? a : b`) |
>
> Это соответствует конвенциям Rust (tight `?`) и TS (spaced `? :`).
> `?.` (optional chaining) — отдельный токен лексера (QUESTDOT), не конфликтует.

> **В expression context:** Оба оператора (`?`, `!`) работают внутри более крупных выражений. Result type unwrappится, и значение flows в surrounding expression:
> ```typescript
> const len = readFile(path)?.length;     // propagate, then .length on String
> const msg = "size=" + readFile(path)!.length;  // unwrap, concat
> arr[getIndex()?]                          // propagate from index expression
> foo(risky()?)                             // propagate from argument
> ```
> См. также: [Bare throws detection](#bare-throws-detection) — вызов throws-функции без `?`/`!` в expression = error.

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

> **Происхождение:** синтаксис заимствован из TS non-null assertion (`x!`), но **семантика изменена** (П3 — лучше чем аналоги).
> В TS `x!` — compile-time no-op: убирает `null`/`undefined` из типа, в runtime ничего не происходит.
> В TSClang `x!` — runtime unwrap-or-panic: если Result содержит ошибку, вызывает `tsc_panic()`.
> Это ближе к Rust `.unwrap()`, чем к TS `!`.
>
> **Почему не как в TS:** TSClang throws-функции возвращают `Result<T, E>`, а не `T | null`.
> TS non-null assertion неприменима к Result — нужен именно unwrap.
> Синтаксис `!` переиспользован для эргономики (привычный glyph) и краткости.

`expr!` — если функция вернула ошибку, вызвать `abort()` (runtime panic). Не требует `throws` у текущей функции:

```typescript
function main(): void {
    const content = readFile("config.txt")!;  // panic если ошибка
    console.log(content);
}
```

## Bare throws detection

Вызов throws-функции **без `?`, `!` или assignment** в expression context — ошибка компилятора. Result-struct не может быть молча проигнорирован:

```typescript
function risky(): i32 throws IOError { ... }

// ❌ error: Call to throws function 'risky()' requires error handling: use '?', '!', or assign to a variable first
const x = risky() + 1;           // bare call in binary expression
arr[risky()];                    // bare call in index
foo(risky());                    // bare call in argument
const s = `${risky()}`;          // bare call in template
const obj = { v: risky() };      // bare call in object literal
const arr = [risky()];           // bare call in array literal
new Foo(risky());                // bare call in constructor args

// ✅ assign first — manual Result handling (allowed)
const result = risky();          // no error — programmer handles Result explicitly
if (result.ok) { ... }

// ✅ use ? or !
const x = risky()! + 1;         // unwrap
const x = risky()? + 1;         // propagate (if enclosing function throws)
```

> **Почему assignment allowed:** `let x = risky()` без `!`/`?` намеренно разрешено — программист может хотеть manual Result handling (проверить `.ok`, извлечь `.error` и т.д.). Проверка срабатывает только когда Result используется в expression (где Result-struct дал бы некорректный C).

> **Coverage:** Проверка рекурсивно обходит все nested expressions: binary, member, index, array/object literals, template, call args, ternary, unary, cast, range, new. См. `_checkNoBareThrows` в `codegen.js`.

## C-output

`throws` меняет C-сигнатуру функции: возвращаемый тип оборачивается в Result-структуру. Для `throws FileError | NetworkError`:

```c
// Error classes get TscError _base wrapper
typedef struct { TscError _base; } FileError;
typedef struct { TscError _base; } NetworkError;

// Error tag enum — one value per error type
typedef enum { _Err_FileError = 0, _Err_NetworkError = 1 } _ErrTag_FileError_NetworkError;

// Error union — separate typedef
typedef struct {
    _ErrTag_FileError_NetworkError tag;
    union { FileError _0; NetworkError _1; };
} _ErrUnion_FileError_NetworkError;

// Result struct — bool ok + anonymous union of value/error
typedef struct {
    bool ok;
    union { String value; _ErrUnion_FileError_NetworkError error; };
} Result_string_FileError_NetworkError;

// Function name includes parameter type suffix
Result_string_FileError_NetworkError fetch_string(String url) { ... }
```

`try/catch` компилируется в `if/else` по полю `ok` и `error.tag`:

```c
Result_string_FileError_NetworkError _r = fetch_string(STR_LIT("https://..."));
if (_r.ok) {
    String r = _r.value;
    process(r);
    tsc_string_release(r);
} else if (_r.error.tag == _Err_FileError) {
    FileError e = _r.error._0;
    printf("IO: %s\n", e._base.message.data);
} else if (_r.error.tag == _Err_NetworkError) {
    NetworkError e = _r.error._1;
    printf("Network: %s\n", e._base.message.data);
}
closeConnection();
```

Оператор `?`:
```c
Result_string_FileError _res = readFile_string(STR_LIT("x"));
if (!_res.ok) { return (Result_string_FileError){.ok = false, .error = _res.error}; }
String content = _res.value;
```

Оператор `!`:
```c
Result_string_FileError _res = readFile_string(STR_LIT("config.txt"));
if (!_res.ok) { tsc_panic(_res.error._base.message); }
String content = _res.value;
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
Foo a = Foo_new();
Bar b = Bar_new();
Result_void_IOError _r = riskyOp();
if (!_r.ok) {
    Foo_free(&a);   // компилятор генерирует cleanup для каждого owned
    Bar_free(&b);
    return (Result_void_IOError){.ok = false, .error = _r.error};
}
use(&a, &b);
Foo_free(&a);
Bar_free(&b);
```

## Ограничения

- `throw` запрещён в функциях без `throws` — ошибка компилятора
- `?` запрещён в функции без `throws` — ошибка компилятора
- Исключения нельзя бросать через C interop границы — функции, объявленные как `extern "C"`, не могут содержать `throws`
- `finally` не может содержать `throw` или `return` — ошибка компилятора (неопределённое поведение)

### `?` и `!` в async функциях

Async функции используют другую модель обработки ошибок (try/catch на `await`). Операторы `?` и `!` имеют ограничения:

| Оператор | Условие | Поведение |
|----------|---------|-----------|
| `?` (propagate) | всегда в async | **Ошибка компилятора** — используйте `try/catch` на `await` |
| `!` (unwrap) на throws-func | в async | **Ошибка компилятора** — используйте `try/catch` на `await` |
| `!` (non-null assertion) на non-throws | в async | ✅ Разрешён — не связан с error handling |

```typescript
async function loadConfig(path: string): Promise<Config> throws IOError {
    // ❌ error: '?' error propagation is not supported in async functions; use try/catch on await
    const data = readFile(path)?;

    // ❌ error: '!' error handling is not supported in async functions; use try/catch on await
    const data = readFile(path)!;

    // ✅ try/catch
    try {
        const data = readFile(path);
        return parseConfig(data);
    } catch (e: IOError) {
        return defaultConfig;
    }
}
```

> **Почему `?`/`!` запрещены в async:** Async state machine не может напрямую propagate через `goto cleanup` — ошибки пробрасываются через event loop. `try/catch` компилируется в ветки state machine, что корректно работает с async model.

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
