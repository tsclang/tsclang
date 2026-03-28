# TSClang — Архитектура компилятора

## Фазы компиляции

```
Parse → AST → Typecheck → Lower to IR → Ownership Analysis → Codegen
                                 ↑              ↑
                            Flatten CFG    Borrow checker / ARC injection
```

## IR (Intermediate Representation)

IR — linear представление между AST и C. Flattens вложенность, делает порядок выполнения явным.

**Операции:**

| Операция | Описание |
|----------|----------|
| `alloc x, value` | Создать переменную, владелец |
| `borrow x, source, imm/mut` | Заимствовать (`Ref`/`Mut`) |
| `retain x` | Увеличить refcount (`Shared`) |
| `release x` | Уменьшить refcount |
| `call fn, args` | Вызов функции |
| `assign x, value` | Присвоение |
| `drop x` | Конец жизни переменной |
| `return value` | Возврат |
| `branch cond, label1, label2` | Условный переход |
| `jump label` | Безусловный переход |

**Пример трансформации:**

TypeScript:
```typescript
let users = [user1, user2, user3]
const first = users[0]
push(users, user4)
```

IR:
```
alloc users, [user1, user2, user3]
borrow first, users[0], imm  // first = Ref<User>
call push, [users, user4]    // ← ошибка: users заимствован
drop first
drop users
```

**Почему IR:**

- Явный порядок операций (не как в AST)
- Простые проверки для borrow checker
- Легко вставлять `retain`/`release` для `Shared<T>`
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
