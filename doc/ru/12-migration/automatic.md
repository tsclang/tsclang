# Автоматическая миграция (tsclang migrate)

[← Вверх](./index.md) | [Следующий →](./manual.md) | [Предыдущий ←](./index.md)

---

Команда `tsclang migrate` *(roadmap — фаза 13)* автоматически применяет механические трансформации к TypeScript-коду, подготавливая его к компиляции в TSClang. Инструмент анализирует AST и заменяет несовместимые конструкции.

## Синтаксис команды

```bash
tsclang migrate [path]           # dry-run: показать что изменится
tsclang migrate [path] --fix     # применить изменения на месте
tsclang migrate [path] --check   # CI-режим: exit 1 если есть несовместимости
```

`path` — файл, директория или glob. По умолчанию — текущая директория.

**Входные файлы:** `.ts` / `.tsx` (TypeScript-источник)
**Выходные файлы:** `.tsc` (переименованные + трансформированные, оригиналы не удаляются)

## Режимы работы

### Dry-run (по умолчанию)

Показывает планируемые изменения без записи файлов:

```
tsclang migrate ./src

  src/user.ts → src/user.tsc
    line 12: throw "not found"  →  throw new Error("not found")
    line 34: x === undefined    →  x == null
    line 67: export default User  →  export { User }

  src/api.ts → src/api.tsc
    line 5:  x !== undefined    →  x != null

  Manual review required (2 files):
    src/base.ts:15  — class Dog extends Animal (inheritance)
    src/parser.ts:8 — s[i] string indexing

  3 files to transform, 2 require manual review.
  Run with --fix to apply automatic changes.
```

### --fix

Применяет автоматические трансформации на месте. Создаёт `.tsc`-файлы рядом с оригинальными `.ts`-файлами. Оригиналы не удаляются.

### --check

CI-режим: не применяет изменений, завершается с `exit 1` если найдены несовместимости, требующие ручной правки. Используется в пайплайнах для отслеживания миграционного долга.

## Автоматические трансформации

| TypeScript | TSClang | Причина |
|------------|---------|---------|
| `undefined` | `null` | TSClang не имеет `undefined` |
| `throw "message"` | `throw new Error("message")` | Бросать можно только экземпляры `Error` |
| `export default X` | `export { X }` | `export default` запрещён |
| `import X from "./m"` | `import X from "./m"` | Имя — namespace, не default (уже совместимо) |
| `x === y` | `x == y` | `==` и `===` идентичны в TSClang |
| `x !== y` | `x != y` | Аналогично |
| `.ts` → `.tsc` | `user.ts` → `user.tsc` | Переименование файлов |

### Примеры трансформаций

```typescript
// TypeScript → TSClang (автоматически)

// 1. undefined → null
let x = undefined          →  let x = null
if (y === undefined)       →  if (y == null)
if (y !== undefined)       →  if (y != null)

// 2. throw строк → throw Error
throw "not found"          →  throw new Error("not found")
throw 404                  →  throw new Error("404")

// 3. export default → именованный экспорт
export default User        →  export { User }
export default { x: 1 }   →  const _default = { x: 1 }; export { _default }

// 4. === → ==, !== → !=
x === y                    →  x == y
x !== null                 →  x != null
```

## Что НЕ автоматизируется

Следующие паттерны требуют ручной правки — `--check` выводит их список:

- **Классовое наследование** (`extends` не `Error`) — нет безопасной автозамены
- **`s[i]` строковая индексация** — семантика изменилась (u8 вместо string)
- **`for (let x of arr)`** — нужен анализ типа элемента
- **Числовые аннотации** (`number` → конкретный тип) — зависит от контекста
- **Ownership аннотации** — требует понимания data flow

Подробнее — в разделе [Ручная миграция](./manual.md).

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `no .ts files found in path` | Указанный путь не содержит TypeScript-файлов |
| `circular import detected` | Циклический импорт в исходном коде |
| `unable to parse .ts file` | Файл содержит синтаксические ошибки |

## См. также

- [Миграция — обзор](./index.md) — общая информация о миграции
- [Ручная миграция](./manual.md) — паттерны, требующие ручных правок
- [Сборка: CLI](../09-build/cli.md) — все команды `tsclang`
