# Автоматический Drop

[← Вверх](./index.md) | [Следующий →](./closures.md) | [Предыдущий ←](./scope-constraint.md)

---

Компилятор автоматически вставляет вызовы освобождения памяти (`_free`) в конце scope владельца. Ручной `free` не нужен и не предусмотрен.

## Базовый паттерн

Owned переменные освобождаются при выходе из scope:

```typescript
function example(): void {
    let user = new User("Alice");
    let items = new Array<i32>(4);
    items.push(1);
    // ... работа ...
}   // user и items автоматически освобождены
```

```c
void example(void) {
    User* user = NULL;
    Array_i32 items = {0};

    user = User_new(STR_LIT("Alice"));
    items = tsc_array_create_i32(4);
    tsc_array_push_i32(&items, 1);

    // ... работа ...

    tsc_array_free_i32(&items);   // auto-inserted
    User_free(user);              // auto-inserted
}
```

## goto cleanup при множественных return

При нескольких точках выхода (`throw`, `?`, ранний `return`) компилятор генерирует **единую метку очистки**:

```typescript
class MyError extends Error {}

function process(flag: bool): i32 throws MyError {
    let items: Array<i32> = new Array<i32>(4);
    items.push(1);
    if (flag) {
        throw new MyError("bad");
    }
    return items.length as i32;
}
```

```c
typedef struct { TscError _base; } MyError;
typedef struct { bool ok; union { int32_t value; MyError error; }; } Result_i32_MyError;
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Result_i32_MyError process_bool(bool flag) {
    Array_i32 items = tsc_array_create_i32(4);
    tsc_array_push_i32(&items, 1);
    if (flag) {
        tsc_array_free_i32(&items);                              // inline free before return
        return (Result_i32_MyError){.ok = false, .error = ...};
    }
    int32_t _ret_0 = (int32_t)items.length;
    tsc_array_free_i32(&items);                                  // normal path cleanup
    return (Result_i32_MyError){.ok = true, .value = _ret_0};
}
```

### Преимущество goto cleanup

N owned-переменных × M точек выхода = O(N+M) строк вместо O(N×M):

```c
void process(User* u, Buffer* b, Cache* c) {
    if (!u) goto cleanup;
    if (error1) goto cleanup;
    if (error2) goto cleanup;
    // ... работа ...

cleanup:
    if (c) Cache_free(c);    // NULL-check безопасен
    if (b) Buffer_free(b);
    if (u) User_free(u);
}
```

## C99: NULL-инициализация

Все owned указатели объявляются как `NULL` в **начале функции**. Это позволяет `goto cleanup` безопасно вызывать `_free` — NULL-check пропустит невыделенные объекты:

```c
void process(void) {
    User* user = NULL;    // declared NULL
    Buffer* buf = NULL;   // declared NULL

    user = User_new();
    if (error) goto cleanup;    // buf still NULL — safe
    buf = Buffer_new();
    if (error2) goto cleanup;

cleanup:
    if (buf) Buffer_free(buf);  // NULL → skip
    if (user) User_free(user);  // non-NULL → free
}
```

В C99 `goto` не может перепрыгивать через объявление переменной. Объявление всех указателей в начале блока решает это.

## Loop-local переменные

Переменные, созданные внутри цикла, получают **inline free** перед `goto`:

```typescript
for (let i = 0; i < n; i++) {
    let item = new Item();
    process(item)?;
}
```

```c
for (int i = 0; i < n; i++) {
    Item* item = Item_new();

    Result _r = process(item);
    if (!_r.ok) {
        Item_free(item);       // inline free: loop-local variable
        goto cleanup;          // outer cleanup for function-level vars
    }

    Item_free(item);           // normal path — end of iteration
}
```

Компилятор определяет scope каждой переменной: loop-local получает inline free, function-level — cleanup.

## Вложенные scopes

Переменные из внутренних блоков освобождаются **раньше** outer cleanup:

```typescript
let a = new Foo();
{
    let b = new Bar();
    if (fail1) throw ...;    // нужны: a + b
}                            // b умирает здесь
let c = new Baz();
if (fail2) throw ...;         // нужны: a + c (b уже мёртв)
```

```c
Foo* a = NULL;
Baz* c = NULL;

a = Foo_new();

{
    Bar* b = NULL;
    b = Bar_new();
    if (!r.ok) {
        Bar_free(b);          // inline: b is scope-local
        goto cleanup;         // outer cleanup knows about a (not b)
    }
    Bar_free(b);              // normal exit from nested scope
}

c = Baz_new();
if (!r2.ok) goto cleanup;    // cleanup: a + c (b already dead)

cleanup:
    if (c) Baz_free(c);
    if (a) Foo_free(a);
```

## Move и обнуление источника

При move ownership указатель источника обнуляется — предотвращает double-free:

```typescript
let a = new Node();
a.value = 42;
let b = a;              // move
console.log(b.value);   // ok
```

```c
Node a = {0};
a.value = 42;
Node b = a;             // struct copy — ownership transferred
a = (Node){0};          // source zeroed — prevents double-free
printf("%d\n", b.value);
```

## Result + ARC — проверка дискриминанта

`Result<T, E>` — discriminated union. `_free` всегда проверяет, какой вариант хранится:

```c
// generated _free for Result<Shared<User>, Error>
void _free_Result_SharedUser_Error(Result_SharedUser_Error* r) {
    if (r->is_ok) {
        // ok variant — release Shared<User>
        SharedUser_release(r->value.ok);
    } else {
        // error variant — free Error
        Error_free(r->value.err);
    }
}
```

Когда `?` пропагирует ошибку, `T` никогда не был создан — утечки нет. Когда `Result` dropped без потребления — `_free` проверяет дискриминант и вызывает нужный деструктор.

## Сводная таблица

| Случай | Поведение |
|--------|-----------|
| Обычный exit из scope | `_free` для всех owned переменных |
| Ранний return / throw | `goto cleanup` — единая точка очистки |
| C99 compliance | Все owned указатели объявлены `NULL` в начале функции |
| Loop-local переменные | Inline `_free` перед `goto`, затем outer cleanup |
| Вложенные scopes | Scope-local: inline free; outer: через cleanup |
| Move | Источник обнулён `(Type){0}` — double-free невозможен |
| Result<T, E> drop | `_free` проверяет дискриминант |

## См. также

- [Передача аргументов](./argument-passing.md) — move при передаче owned
- [Scope Constraint](./scope-constraint.md) — ограничения lifetime
- [Обработка ошибок](../06-errors/index.md) — throw, try/catch, `?`
- [Замыкания](./closures.md) — drop captured значений
