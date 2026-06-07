# 05b — Ownership в async-функциях

Async-функции компилируются в state machine (SM) — struct с полями для переменных, живых через `await`. Ownership для строк и классов в SM отличается от синхронного кода.

### 7.1 String params — retain-on-capture

В синхронном коде строковые параметры используют **implicit borrow** (caller не делает retain, callee не делает release). В async-функциях это **небезопасно**: caller продолжает выполнение после первого `await` и может освободить или перезаписать оригинальную строку.

Поэтому строковые параметры при копировании в SM struct **принудительно удерживаются**:

```typescript
async function greet(name: string): void {
    await sleep(100);
    console.log(name);  // name должен быть жив здесь
}
```

```c
static void greet_poll(greet_state *self) {
    switch (self->_state) {
        case 0:
            tsc_string_retain(self->name);  // retain-on-capture
            self->_await_0 = tsc_sleep_awaitable(100);
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_sleep_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            printf("%.*s\n", self->name.length, self->name.data);
            goto _cleanup;
        _cleanup:
            tsc_string_release(self->name);  // cleanup
            self->_done = true;
            return;
    }
}
```

| Аспект | Синхронная функция | Async-функция |
|--------|-------------------|---------------|
| `string` param | Implicit borrow (zero-cost) | Retain-on-capture + cleanup release |
| Caller | Не делает retain | Не делает retain |
| Callee | Не делает release | Release в cleanup |

### 7.2 String locals в SM struct

Строковые локальные переменные, живые через `await`, попадают в SM struct. Инициализация из Ident/Member/Index требует retain (новый владелец):

```typescript
async function process(): void {
    const raw = await fetchData();
    const copy = raw;  // copy из Ident → retain
    await sleep(10);
    console.log(copy);
}
```

```c
// в poll:
self->raw = self->_await_0._result;     // ownership transfer — без retain
self->copy = self->raw;                  // Ident init → нужен retain
tsc_string_retain(self->copy);
```

| Init source | Retain нужен? | Почему |
|-------------|---------------|--------|
| Await result (`self->_await_N._result`) | Нет | Ownership transfer от sub-SM |
| Function call result | Нет | Callee уже retain на return |
| String literal (`"hello"`) | No-op | `capacity=0`, retain = no-op |
| Ident (`self->other`) | Да | Новый владелец, нужен retain |
| Member (`self->obj.field`) | Да | Новый владелец |
| Index (`self->arr.data[i]`) | Да | Новый владелец |

### 7.3 Cleanup — `goto _cleanup`

Все exit points SM (return, throw, implicit done, catch fallthrough) перенаправляются на единую метку `_cleanup` внутри switch. Cleanup освобождает все string-поля, вызывает `_free()` для классов с string-полями, и вызывает `tsc_array_free_*` для array-полей:

```c
_cleanup:
    tsc_string_release(self->url);
    tsc_string_release(self->data);
    User_free(&self->user);       // класс с string-полями
    tsc_array_free_i32(&self->items);  // array field cleanup
    self->_done = true;
    return;
```

**Почему `goto _cleanup`, а не inline cleanup:** один блок cleanup вместо N копий release/free вызовов на каждом exit point. На AVR/NES экономия ROM критична.

**Почему безусловный release всех полей:** SM struct инициализируется `{0}` — String поля `{0}` имеют `data=NULL, _refcount=NULL`, release = no-op. Класс-поля `{0}` → `ClassName_free` с `if (!self) return;`. Классы — value types на стеке, `_free` освобождает только string-поля, не `free(self)`. Безопасно.

**Opt-out:** если async-функция не имеет string/class/array полей (только примитивы), cleanup label не генерируется — exit points остаются `self->_done = true; return;` без overhead.

**Array-поля в cleanup:** для каждого array-поля с элементами non-примитивного типа (динамический массив) компилятор генерирует `tsc_array_free_*` в cleanup. Array-поля с `capacity=0` (non-owning) — `tsc_array_free_*` пропускает `free` (см. [08-arrays-ownership.md](../08-collections/08-arrays-ownership.md), Array `capacity` — owning vs non-owning).

### 7.4 Ref\<T\> через await — запрещено

Уже реализовано: если async-функция с `await` имеет параметр `Ref<T>`, компилятор выдаёт ошибку:

```typescript
async function bad(arr: Ref<number[]>): void {
    await sleep(10);  // ❌ Ref<T> cannot live across "await"
}
```

Borrow не может быть сохранён в SM struct — нет гарантии что источник жив после `await`.

### 7.5 Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `tsc_string_retain` на capture | `if (_refcount) (*_refcount)++` | No-op |
| `tsc_string_release` в cleanup | Decrement refcount, free при 0 | No-op (ring buffer, нет индивидуального free) |
| `ClassName_free` в cleanup | Release string-полей (без `free(self)`) | No-op |
| Cleanup label | Генерируется при наличии string/class полей | Аналогично (no-op retain/release) |
| `goto _cleanup` overhead | Нет (внутри switch) | Нет |

На embedded retain/release = no-ops. Cleanup всё равно генерируется (для корректности), но не имеет runtime-cost.

### 7.6 Generator cleanup

Синхронные генераторы (`function*`) используют аналогичную SM struct с promoted let-fields. String let-fields в генераторах получают retain перед `yield` и release в cleanup при `_done = true`.

**Retain перед yield:** когда string-переменная инициализируется из Ident/Member/Index (а не из литерала или результата вызова), компилятор вставляет `tsc_string_retain` — генератор становится новым владельцем.

**Cleanup через `goto _cleanup`:** все exit points (return, throw, implicit done) перенаправляются на единую метку `_cleanup` внутри switch. Cleanup освобождает все string-поля и вызывает `_free()` для классов с string-полями — аналогично async (§7.3).

**Opt-out:** если генератор не имеет string/class let-полей, cleanup label не генерируется — exit points остаются `self->_done = true; return;` без overhead.

**Liveness optimization:** переменные, не пересекающие yield-границы и имеющие примитивный тип, не промоутятся в SM struct — остаются локальными переменными внутри case-блока. String/class типы всегда промоутятся (нужен cleanup).

### Почему так

Async-функция — это state machine с неопределённым временем жизни. Переменные переживают `await` и должны быть независимыми владельцами данных. Retain-on-capture для строк — минимальная цена за безопасность: на embedded это no-op, на desktop — один increment. Централизованный cleanup через `goto _cleanup` исключает утечки и минимизирует ROM.
