# Обработка ошибок

[← Вверх](../index.md) | [Следующий →](./throw-try.md)

---

TSClang использует синтаксис `throw`/`try`/`catch`/`finally` как в TypeScript, но компилирует ошибки в **Result-структуры в C** — без `setjmp`/`longjmp`. Это обеспечивает:

- **Zero-cost**: нет сохранения регистров на каждом `try`-блоке
- **Безопасный C interop**: нет `longjmp` через сторонний C-код
- **Корректный ownership**: обычный control flow, компилятор знает все owned-переменные

## Принцип

Каждая функция, способная завершиться ошибкой, объявляет `throws` в сигнатуре. В C-output возвращаемый тип оборачивается в Result-структуру с полем `ok` и union для значения или ошибки. Обработчики `try`/`catch` компилируются в обычные `if/else` по полю `ok` и `_kind`.

## Ключевые концепции

### throws-объявление

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Без `throws` — функция не может содержать `throw` (ошибка компиляции).

### Error — базовый класс

Все ошибки наследуют от `Error`:

```typescript
class Error {
    readonly message: string
    readonly stack:   string   // только desktop — "__FILE__:__LINE__" точки throw
}
```

### Операторы ? и !

| Оператор | Семантика | Требует `throws`? |
|----------|-----------|-------------------|
| `expr?`  | Propagate — вернуть ошибку из текущей функции | Да |
| `expr!`  | Unwrap — panic (`abort()`) при ошибке | Нет |

### Result-структура в C

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

### Ownership при ошибках

Компилятор отслеживает все owned-переменные в `try`-блоке. При ошибке все уже инициализированные owned-переменные освобождаются через обычный control flow (`goto cleanup`).

## Подстраницы

| Страница | Описание |
|----------|----------|
| [throw / try / catch / finally](./throw-try.md) | Синтаксис обработки ошибок, catch по типу, finally |
| [Result-структуры](./result.md) | Result<T, E>, discriminated union, C-представление |
| [Операторы ? и !](./operators.md) | Propagate, unwrap/panic, C-output |

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `throw in non-throws function` | `throw` в функции без `throws` |
| `? operator in non-throws function` | Оператор `?` без `throws` у текущей функции |
| `extern "C" cannot throw` | `throws` в `extern "C"` функции |
| `throw/return in finally` | `throw` или `return` внутри `finally`-блока |
| `error.stack on embedded` | Обращение к `stack` на embedded-платформе |

## Ограничения

- `throw` запрещён в функциях без `throws`
- `?` запрещён в функции без `throws`
- Исключения нельзя бросать через C interop границы — `extern "C"` не может содержать `throws`
- `finally` не может содержать `throw` или `return`
- `error.stack` недоступен на embedded-платформах

## См. также

- [Модель памяти: Auto Drop](../05-memory/auto-drop.md) — `goto cleanup` при множественных exit-точках
- [Модель памяти: Owner](../05-memory/owner.md) — move и ownership при ошибках
- [Классы](../04-classes/index.md) — наследование Error и пользовательские типы ошибок
