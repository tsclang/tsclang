# Фазы компиляции

[← Вверх](./index.md) | [Следующий →](./name-mangling.md) | [Предыдущий ←](./index.md)

---

TSClang проходит несколько фаз от исходного `.tsc` до генерации C99.

## Обзор

```
Parse → AST → Decorator pass → Typecheck → Lower to IR → Ownership Analysis → Codegen
                                                  ↑              ↑
                                             Flatten CFG    Borrow checker / ARC injection
```

## Parse

Лексер (`lexer.js`) разбивает исходник на токены, парсер (`parser.js`) строит AST. Форматирование не влияет на результат — парсер проверяет только семантику.

## AST

Результат парсинга — дерево с узлами для объявлений, выражений, типов. AST используется всеми последующими фазами.

## Decorator pass

Выполняется **после парсинга, до typecheck**. Обходит все классы и функции в порядке объявления, применяет декораторы.

### Алгоритм

1. Обойти все классы и функции в порядке объявления
2. Для каждого декорированного узла — вычислить декораторы сверху вниз (фабрики вызываются)
3. Применить полученные функции снизу вверх — каждая получает и возвращает дескриптор
4. Модифицированный дескриптор заменяет оригинальный узел в AST
5. После обхода всех узлов — AST модифицирован, переходим к Typecheck

### Ограничения

| Операция | Разрешено |
|----------|-----------|
| Читать `cls.name`, `desc.params`, `desc.returnType` | Да |
| Вызывать `desc.before()`, `desc.after()` | Да |
| Вызывать `cls.addField()`, `cls.addMethod()` | Да |
| Читать `meta` других классов | Нет — порядок обхода не гарантирован |
| Вызывать рантайм-функции | Нет — рантайма ещё нет |
| Читать типы полей добавленных другим декоратором | Нет — если тот ещё не выполнился |

Ошибки decorator pass — compile-time ошибки, останавливают компиляцию до Typecheck.

## Typecheck

Проверка типов по всей программе: совместимость присвоений, вывод типов, exhaustiveness `switch`, generic constraints.

### Пример ошибки типов

```
error[TSC-E011]: type mismatch — expected `i32`, got `f64`
  --> src/calc.tsc:5:18
   |
 5 |     let x: i32 = 3.14
   |                  ^^^^ expected i32
   |
   = hint: use explicit cast `3.14 as i32` (truncates) or change type to `f64`
```

## Lower to IR

Типизированный AST опускается в **SSA-подобное IR** на основе basic blocks. IR делает порядок выполнения явным, «сплющивает» вложенность.

### Basic Block

Единица IR — linear последовательность инструкций с одним terminator в конце. Ветвления только на границах блоков.

```
block entry:
    alloc x, i32, 5
    alloc y, i32, 10
    branch (x > y), then_block, else_block

block then_block:
    call print, [x]
    jump end_block

block else_block:
    call print, [y]
    jump end_block

block end_block:
    phi result, [x from then_block, y from else_block]
    return result
```

### Инструкции IR

| Операция | Описание |
|----------|----------|
| `alloc x, type, value` | Создать переменную, владелец |
| `borrow x, source, imm\|mut` | Заимствовать (`Ref`/`Mut`) |
| `retain x` | Увеличить refcount (`Shared`) |
| `release x` | Уменьшить refcount |
| `call x, fn, args` | Вызов функции, результат в `x` |
| `assign x, value` | Присвоение |
| `drop x` | Конец жизни переменной |
| `return value` | Возврат (terminator) |
| `branch cond, then, else` | Условный переход (terminator) |
| `jump label` | Безусловный переход (terminator) |
| `phi x, [v1 from b1, ...]` | Phi-node — значение зависит от предыдущего блока |
| `await x, resume_label` | Suspend coroutine (terminator для async) |
| `yield value` | Отдать управление планировщику (async) |

### Phi nodes

Появляются при слиянии путей управления — например, переменная присваивается в обеих ветках `if/else`. Phi не генерирует C-код напрямую — borrow checker и кодоген читают его, чтобы знать откуда пришло значение.

### Пример: borrow в IR

```typescript
let users = [user1, user2, user3]
const first = users[0]
push(users, user4)    // ошибка: users заимствован
```

```
block entry:
    alloc users, User[], [user1, user2, user3]
    borrow first, users[0], imm       // first = Ref<User>
    call _, push, [users, user4]      // ← ошибка: users заимствован (first жив)
    drop first
    drop users
    return void
```

## Ownership Analysis

Borrow checker + ARC injection на IR. Линейный проход по basic blocks: отслеживает жизни переменных, заимствования, точки drop.

### Async lowering

`async` функция компилируется в state machine. `await` становится `suspend + resume`:

```typescript
async function fetchUser(id: i32): Promise<User> {
    const resp = await fetch("/api/" + id)
    return resp.json<User>()
}
```

```
// State machine struct: { _state: u8, id: i32, resp: Response }

block state_0:         // initial state
    alloc url, string, "/api/" + id
    call resp_future, fetch, [url]
    await resp_future, state_1     // suspend → сохранить id в struct, выйти
    drop url

block state_1:         // resume after await
    assign resp, resp_future.result
    call result, resp.json<User>, []
    return result

block state_cleanup:   // при отмене или ошибке
    drop resp
    return error
```

### Почему IR

- Явный порядок операций (не как в AST)
- Простые проверки для borrow checker (линейный проход по блокам)
- Phi nodes делают merge явным — borrow checker видит все пути
- Async lowering — чёткое отображение `await` → state transitions
- Почти 1:1 с C — кодоген тривиальный

## Codegen

IR транслируется в C99. Кодогенератор генерирует:
- `.c` и `.h` файлы для каждого модуля
- `CMakeLists.txt` для сборки
- `#line` директивы в debug-профиле

## C-output

```c
// сгенерировано из src/main.tsc
#include <stdint.h>
#include "runtime.h"

int32_t myapp_src_main_foo_i32(int32_t x) {
    return x * 2;
}

int main(void) {
    tsc_init_all();
    int32_t result = myapp_src_main_foo_i32(21);
    printf("%d\n", result);
    return 0;
}
```

## Ошибки

| Код | Описание |
|-----|----------|
| `TSC-E042` | Нельзя заимствовать `mut` — уже заимствовано как immutable |
| `TSC-E043` | Использование перемещённого значения |
| `TSC-E044` | `Ref<T>` нельзя хранить в поле — lifetime не отслеживается |
| `TSC-E051` | `Ref<T>` не может пересекать `await` |
| `TSC-E011` | Несовпадение типов |
| `TSC-E021` | Свойство не существует у типа |
| `TSC-E031` | Non-exhaustive switch — отсутствует case |

## См. также

- [Name mangling](./name-mangling.md) — кодирование имён и типов в C-output
- [Debug info](./debug.md) — `#line` директивы и DAP-сервер
- [Декораторы](../04-classes/decorators.md) — подробно о decorator pass
- [Модель памяти](../05-memory/index.md) — ownership, borrow checker
