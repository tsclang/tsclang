# Операторы ? и !

[← Вверх](./index.md) | [Предыдущий ←](./result.md)

---

TSClang предоставляет два постфиксных оператора для работы с ошибками: `?` (propagate) и `!` (unwrap/panic).

## Оператор ? — propagate

`expr?` — если выражение вернуло ошибку, немедленно вернуть её из текущей функции. Текущая функция обязана иметь совместимый `throws`-тип.

### Базовое использование

```typescript
function process(path: string): string throws IOError | NetworkError {
    const content = readFile(path)?;    // propagate IOError
    const r = fetch(content)?;          // propagate NetworkError
    return r.body;
}
```

Если `readFile` или `fetch` вернут ошибку — она будет немедленно возвращена из `process`.

### C-output

```c
_Result_String_IOError _r = readFile(str(path));
if (!_r.ok) {
    return (_Result_String_NetworkError){ .ok = false, ._err = _r._err };
}
String content = _r.value;

_Result_Response_NetworkError _r2 = fetch(content);
if (!_r2.ok) {
    String_free(content);
    return (_Result_String_NetworkError){ .ok = false, ._err = _r2._err };
}
```

Ошибка оборачивается в Result-тип текущей функции. Owned-переменные, уже инициализированные к моменту ошибки, освобождаются компилятором (`String_free(content)`).

### Совместимость throws

Тип ошибки propagate-выражения должен быть подмножеством `throws` текущей функции:

```typescript
function process(): void throws IOError | NetworkError {
    readFile("x")?;    // ok: IOError ∈ throws
    fetch("y")?;       // ok: NetworkError ∈ throws
}

function onlyIO(): void throws IOError {
    readFile("x")?;    // ok: IOError ∈ throws
    fetch("y")?;       // error: NetworkError ∉ throws
}
```

### ? без throws — ошибка компиляции

```typescript
function main(): void {
    const data = readFile("x")?;
    // error: main не объявляет throws, нельзя использовать ?
}
```

### ? в цепочке вызовов

```typescript
function process(): string throws IOError {
    return readFile("data.txt")?.trim();
}
```

Если `readFile` вернёт ошибку — `trim()` не вызывается, ошибка propagate'ится.

## Оператор ! — unwrap / panic

`expr!` — если выражение вернуло ошибку, вызвать `abort()` (runtime panic). Не требует `throws` у текущей функции.

### Базовое использование

```typescript
function main(): void {
    const content = readFile("config.txt")!;   // panic если ошибка
    console.log(content);
}
```

### C-output

```c
_Result_String_IOError _r = readFile(str("config.txt"));
if (!_r.ok) {
    fprintf(stderr, "panic\n");
    abort();
}
String content = _r.value;
```

При ошибке — немедленный `abort()` без cleanup. Используйте `!` только когда ошибка «невозможна» или когда падение — приемлемое поведение.

### Когда использовать !

- Конфигурационные файлы, которые обязаны существовать
- invariant-проверки в development-режиме
- Точки, где продолжение после ошибки бессмысленно

### Когда НЕ использовать !

- В library-коде — используйте `?` или `try/catch`
- При работе с пользовательским вводом
- В network/IO операциях, где ошибки ожидаемы

## Сравнение операторов

| Свойство | `?` | `!` |
|----------|-----|-----|
| Поведение при ошибке | Propagate в вызывающую функцию | `abort()` (panic) |
| Требует `throws` | Да | Нет |
| Cleanup owned-переменных | Да — компилятор генерирует `_free()` | Нет — `abort()` без cleanup |
| Использование | Library-код, обычные функции | `main()`, invariant-проверки |

## Propagate с cleanup

Компилятор отслеживает owned-переменные при `?`:

```typescript
function process(): string throws IOError {
    const buf = new Buffer();
    const content = readFile("data.txt")?;   // если ошибка → buf освобождается
    buf.write(content);
    return buf.toString();
}
```

### C-output: cleanup при propagate

```c
_Result_String_IOError process(void) {
    Buffer buf = Buffer_new();
    _Result_String_IOError _r = readFile(str("data.txt"));
    if (!_r.ok) {
        Buffer_free(buf);    // cleanup перед propagate
        return (_Result_String_IOError){ .ok = false, ._err = _r._err };
    }
    String content = _r.value;
    Buffer_write(&buf, content);
    String result = Buffer_toString(&buf);
    Buffer_free(buf);
    return (_Result_String_IOError){ .ok = true, .value = result };
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `? operator in non-throws function` | `?` в функции без `throws`-объявления |
| `incompatible throws type` | Тип ошибки не входит в `throws` текущей функции |
| `unwrap of non-Result expression` | `?` или `!` на выражении, не возвращающем Result |

## См. также

- [Обработка ошибок — обзор](./index.md) — общие принципы и Result-структуры
- [throw / try / catch / finally](./throw-try.md) — полная обработка ошибок
- [Result-структуры](./result.md) — устройство Result<T, E> в C-output
- [Модель памяти: Owner](../05-memory/owner.md) — ownership и cleanup при propagate
