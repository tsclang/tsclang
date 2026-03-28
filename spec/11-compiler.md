# TSClang — Архитектура компилятора

## Фазы компиляции

```
Parse → AST → Typecheck → Lower to IR → Ownership Analysis → Codegen
                                 ↑              ↑
                            Flatten CFG    Borrow checker / ARC injection
```

## IR (Intermediate Representation)

IR — SSA-подобное представление между AST и C на основе **basic blocks**. Flattens вложенность, делает порядок выполнения явным.

### Basic Block

Единица IR — basic block: линейная последовательность инструкций с одним terminator в конце. Нет ветвлений внутри блока — только на границах.

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

### Инструкции

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
| `branch cond, then_label, else_label` | Условный переход (terminator) |
| `jump label` | Безусловный переход (terminator) |
| `phi x, [v1 from b1, v2 from b2, ...]` | Phi-node — значение зависит от предыдущего блока |
| `await x, resume_label` | Suspend coroutine (terminator для async) |
| `yield value` | Отдать управление планировщику (async) |

**Phi nodes** появляются при слиянии путей управления — например, переменная присваивается в обеих ветках `if/else`. Phi не генерирует C-код напрямую — borrow checker и кодоген читают его чтобы знать откуда пришло значение.

### Пример трансформации

TypeScript:
```typescript
let users = [user1, user2, user3]
const first = users[0]
push(users, user4)
```

IR:
```
block entry:
    alloc users, User[], [user1, user2, user3]
    borrow first, users[0], imm       // first = Ref<User>
    call _, push, [users, user4]      // ← ошибка: users заимствован (first жив)
    drop first
    drop users
    return void
```

### Async lowering в IR

`async` функция компилируется в state machine. `await` становится `suspend + resume`:

```typescript
async function fetchUser(id: i32): Promise<User> {
    const resp = await fetch("/api/" + id)
    return resp.json<User>()
}
```

IR (после async lowering):

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
    drop resp          // if alive
    return error
```

**Почему IR:**

- Явный порядок операций (не как в AST)
- Простые проверки для borrow checker (линейный проход по блокам)
- Phi nodes делают merge явным — borrow checker видит все пути
- Async lowering — чёткое отображение `await` → state transitions
- Почти 1:1 с C — кодоген тривиальный

## Методология тестов

Каждый компонент реализуется по одному циклу:

```
1. Тесты    — написать test corpus (формат Этап 0):
               входной .tsc → ожидаемый C output / ошибка компилятора
2. Реализация — реализовать компонент до полного прохождения тестов
3. Лог      — вести log/<компонент>.md: решения, проблемы, изменения дизайна
```

Структура файлов проекта:
```
doc/          — test corpus (Этап 0)
log/          — логи компонентов
src/          — исходный код компилятора
```

## Consumer-side monomorphization

Дженерики инстанцируются у потребителя, а не в библиотеке.

**Библиотека компилируется один раз** в IR с «дырами» для типов:

```typescript
// @myco/collections/index.tsc
export function identity<T>(x: T): T {
    return x
}

export class Box<T> {
    constructor(public value: T) {}
}
```

**Кеш библиотеки** содержит IR, не конкретные типы:
```
~/.tsclang/cache/@myco/collections@1.0.0/
  source/
    index.tsc
  build/
    desktop/
      include/
        collections.h      // IR с type holes
      lib/
        libcollections.a   // скомпилированный IR
```

**При компиляции потребителя** — компилятор инстанцирует конкретные варианты:

```typescript
import { identity, Box } from "@myco/collections"

const a = identity(42)           // identity<i32>
const b = identity("hello")      // identity<string>
const box = new Box<User>({...}) // Box<User>
```

**При компиляции проекта:**

1. Загрузить IR библиотеки с type holes
2. Найти использования: `identity<i32>`, `identity<string>`, `Box<User>`
3. Инстанцировать код для каждого типа

Генерируемый C:
```c
// identity<i32>
int32_t  identity_i32(int32_t x)   { return x; }

// identity<string>
String*  identity_string(String* x) { return x; }

// Box<User>
typedef struct { User* value; } Box_User;
```

Плюсы:
- Библиотека компилируется один раз (не для каждого набора типов)
- Оптимальная производительность — inlining и специализация под конкретный тип
- В бинарь попадает только используемое

### Формат скомпилированной библиотеки

Скомпилированная TSClang-библиотека в кеше:

```
@myco/mylib@1.0.0/
  source/
    index.tsc
    src/
      utils.tsc
  build/
    desktop/
      include/
        mylib.h
      lib/
        libmylib.a
  metadata.json
```

**`metadata.json`** — описывает публичный API библиотеки для consumer-side monomorphization:

```json
{
  "exports": {
    "foo": { "layout_hash": "abc123" },
    "Bar": { "layout_hash": "def456", "size": 16 }
  },
  "generics": {
    "identity": { "params": ["T"] },
    "Map": { "params": ["K", "V"] }
  }
}
```

- `exports` — конкретные (не generic) экспорты с хешом layout (для инвалидации кеша при изменении структуры)
- `generics` — generic-экспорты с именами параметров — компилятор потребителя инстанцирует их под конкретные типы
