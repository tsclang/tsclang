# Cleanup: Auto-Drop, Result+ARC, goto cleanup

## Автоматический Drop

> Подробности по ClassName_free для классов — см. [07-classes-ownership.md](../07-classes/07-classes-ownership.md) (раздел «Классы с string-полями»). Async cleanup — см. [10-async-ownership.md](../10-async/10-async-ownership.md).

Компилятор вставляет `_free()` в конце scope владельца. При множественных `return` — единая точка очистки:

```c
void process(User u) {
    if (error) goto cleanup;
    // ... работа ...
cleanup:
    if (u_is_owned) User_free(&u);
}
```

**Result + ARC — `_free` всегда проверяет дискриминант:**

`Result<T, E>` — discriminated union. Когда `?` пропагирует ошибку, T никогда не был создан → утечки нет. Но когда `Result<T, E>` dropped без потребления (например, возвращён из функции и проигнорирован), компилятор генерирует `_free_Result_T_E` который проверяет дискриминант и вызывает нужный деструктор:

```c
// генерируемый _free для Result<Shared<User>, Error>
void _free_Result_SharedUser_Error(Result_SharedUser_Error* r) {
    if (r->is_ok) {
        // успех — освобождаем Shared<User>
        SharedUser_release(r->value.ok);
    } else {
        // ошибка — освобождаем Error
        Error_free(&r->value.err);
    }
}
```

Это гарантирует отсутствие утечек при любом пути выполнения: `goto cleanup` всегда вызывает `_free_Result_*` для всех Result на стеке функции.

## Стратегия cleanup при `throw` / `?` — `goto cleanup`

Компилятор генерирует единую точку очистки через `goto cleanup` вместо дублирования free-вызовов на каждой `?`-точке. Это даёт O(N+M) строк вместо O(N×M) где N — owned переменные, M — точки propagation.

**Базовый паттерн:**

```c
// TSClang:
// let items = [1, 2, 3]
// doSomething()?
// doOther()?

// C-output:
Array_f64 items = {0};                // ← value type, zero-init
items = tsc_array_create_f64(4);

_r = doSomething();
if (!_r.ok) goto cleanup;            // один goto — не дублируем free

_r2 = doOther();
if (!_r2.ok) goto cleanup;

use(&items);

cleanup:
    tsc_array_free_f64(&items);      // direct free, no NULL-check
    return ...;
```

Все типы на стеке получают **zero-init**: примитивы — натуральный ноль (`0`, `0.0`, `false`), `string` — пустая строка (`STR_LIT("")`), все struct-типы (классы, интерфейсы, массивы, tuple) — `{0}`. Enum без инициализатора — compile error. Cleanup вызывает `_free(&var)` напрямую — `if (!self) return;` внутри `_free` гарантирует безопасность для zero-init переменных.

**Три нетривиальных случая:**

**1. `goto` через объявления переменных — нарушение C99**

В C99 `goto` не может перепрыгивать через объявление переменной. Для value types это не проблема — `Type var = {0};` не вызывает конструктор. Для `Result` и других локальных переменных компилятор использует `{0}`:

```c
// ❌ нарушение C99 (гипотетический pointer-паттерн):
Foo* a = Foo_new();
if (!r.ok) goto cleanup;
Bar* b = Bar_new();  // goto перепрыгнул это объявление → UB

// ✅ реально генерируемый паттерн — value types с {0}:
Result_i32_Err _result = {0};
Array_i32 items = {0};
items = tsc_array_create_i32(4);

if (!r.ok) goto cleanup;  // goto не перепрыгивает объявления
```

**2. Owned переменные внутри циклов**

`cleanup` в конце функции не знает про loop-local переменные. Для них компилятор генерирует inline free перед `goto`:

```c
// TSClang:
// for (let i = 0; i < n; i++) {
//     let tmp = [1, 2]
//     process(tmp)?
// }

for (int32_t i = 0; i < count; i++) {
    Array_f64 tmp = tsc_array_create_f64(2);   // immediate init

    Result_i32_Err _res_0 = process(i);
    if (!_res_0.ok) {
        tsc_array_free_f64(&tmp);              // ← inline free: loop-local
        _result = ...error...;
        goto cleanup;                          // ← затем outer cleanup
    }

    tsc_array_free_f64(&tmp);                  // нормальный путь — конец итерации
}
```

Компилятор определяет scope каждой переменной и генерирует inline free для loop-local перед `goto`.

**3. Вложенные scopes — разные наборы cleanup**

Переменные из внутренних scopes умирают раньше — нельзя использовать одну метку `cleanup` для всего:

```c
// TSClang:
// let items = [1, 2, 3]
// {
//     let inner = [4, 5]
//     if (fail1) throw ...   // нужны: items + inner
// }                          // inner умирает здесь
// if (fail2) throw ...       // нужны: только items (inner уже мёртв)

Array_f64 items = {0};
items = tsc_array_create_f64(4);

{
    Array_f64 inner = tsc_array_create_f64(2);   // immediate init
    if (x < 0) {
        tsc_array_free_f64(&inner);              // inline: inner scope-local
        _result = ...error...;
        goto cleanup;                            // outer cleanup знает про items (не inner)
    }
    tsc_array_free_f64(&inner);                  // нормальный выход из вложенного scope
}

if (!r2.ok) goto cleanup;                        // cleanup: только items

cleanup:
    tsc_array_free_f64(&items);
    return _result;
```

Компилятор **всегда** генерирует value-type паттерн: `Type var = {0};` для outer переменных, `Type var = create(...)` для inner-scope/loop-local.

**Итоговые правила кодогенерации:**

| Случай | Решение |
|--------|---------|
| Несколько `?`-точек | одна метка `cleanup`, `{0}` инициализация value types |
| `goto` через объявления (C99) | value types: `Type var = {0};` — goto не перепрыгивает через init |
| Loop-local переменные | inline `free(&var)` перед `goto`, затем outer `cleanup` |
| `break` / `continue` в цикле | inline `free(&var)` loop-local переменных перед `break`/`continue` |
| Вложенные scopes | scope-local: inline `free(&var)`; outer: через `cleanup` |

Пример cleanup при `break`:

```c
for (int32_t i = 0; i < 5; i++) {
    String s = STR_LIT("hello");
    if (i == 2) {
        tsc_string_release(s);   // ← inline free перед break
        break;
    }
    total = total + i;
    tsc_string_release(s);       // нормальный путь — конец итерации
}
```
