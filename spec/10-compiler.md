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
