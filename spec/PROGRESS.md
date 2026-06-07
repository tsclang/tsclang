# PROGRESS — миграция спецификации

## Статус: ЗАВЕРШЕНО

Спецификация реорганизована из фазовой структуры (`spec/01-intro/`, `spec/05-memory/`, `spec/0a-control-flow/` и т.д.) в послойную (`spec/01-intro/`, `spec/04-ownership/`, `spec/05-control-flow/` и т.д.). Промежуточный этап `spec_v2/` объединён обратно в `spec/`.

## Лог перемещений

Старый путь — исходная фазовая структура. Новый путь — текущая послойная.

| Старый путь | Новый путь | Примечание |
|-------------|-----------|------------|
| `spec/01-intro/01-intro.md` | `spec/01-intro/01-intro.md` | Навигация обновлена на v2 |
| `spec/02-syntax/*.md` (4 файла) | `spec/02-syntax/` | Как есть |
| `spec/03-types/*.md` (10 файлов) | `spec/03-types/` | Как есть |
| `spec/0d-strings/0d-strings.md` | `spec/03-types/03-strings.md` | Строки = тип |
| `spec/0d-strings/0d-ownership.md` | `spec/03-types/03-strings-ownership.md` | String ARC ownership |
| `spec/0d-strings/0d-arc-overview.md` | удалён | Дубликат, содержание в 03-strings-ownership |
| `spec/05-memory/05-memory.md` | `spec/04-ownership/04-ownership.md` | Обзор + навигация обновлена |
| `spec/05-memory/05-borrow.md` | `spec/04-ownership/04-borrow.md` | Ссылки обновлены на v2 |
| `spec/05-memory/05b-ownership.md` | `spec/04-ownership/04-primitives.md` | Примитивы ownership |
| `spec/05-memory/05b-shared-weak.md` | `spec/04-ownership/04-shared-weak.md` | Shared/Weak ARC |
| `spec/05-memory/05-clone.md` | `spec/04-ownership/04-clone.md` | Clone интерфейс |
| `spec/05-memory/05-const-vs-let.md` | `spec/04-ownership/04-const-vs-let.md` | const vs let |
| `spec/0a-control-flow/*.md` (5 файлов) | `spec/05-control-flow/` | Как есть |
| `spec/05-memory/05c-for-of-iteration.md` | `spec/05-control-flow/05-for-of-iteration.md` | for-of = control flow |
| `spec/0b-functions/*.md` (7 файлов) | `spec/06-functions/` | Как есть |
| `spec/05-memory/05e-closures.md` | `spec/06-functions/06-closures.md` | Замыкания = функции |
| `spec/04-classes/*.md` (7 файлов) | `spec/07-classes/` | Как есть |
| `spec/05-memory/05b-classes.md` | `spec/07-classes/07-classes-ownership.md` | Class ownership |
| `spec/0c-arrays/*.md` (4 файла) | `spec/08-collections/` | Как есть |
| `spec/05-memory/05b-arrays.md` | `spec/08-collections/08-arrays-ownership.md` | Array ownership |
| `spec/05-memory/05b-tuples.md` | `spec/08-collections/08-tuples-ownership.md` | Tuple ownership |
| `spec/05-memory/05d-spread-destructuring-merge.md` | `spec/08-collections/08-spread-destructuring.md` | Spread = collections |
| `spec/06-errors/06-errors.md` | `spec/09-errors/09-errors.md` | Как есть |
| `spec/05-memory/05-cleanup.md` | `spec/09-errors/09-cleanup.md` | Cleanup = error handling |
| `spec/07-concurrency/07-concurrency.md` секции 1,5 | `spec/10-async/10-async.md` | Разделено на async + concurrency |
| `spec/05-memory/05b-async.md` | `spec/10-async/10-async-ownership.md` | Async ownership |
| `spec/07-concurrency/07-concurrency.md` секции 2,3,4,6 | `spec/11-concurrency/11-concurrency.md` | Threads + ISR + embedded |
| `spec/08-modules/08-modules.md` | `spec/12-modules/12-modules.md` | Как есть |
| `spec/09-build/*.md` (3 файла) | `spec/13-build/` | Как есть |
| `spec/10-stdlib/*.md` (8 файлов) | `spec/14-stdlib/` | Как есть |
| `spec/14-reactive/index.md` | `spec/14-stdlib/index.md` | Reactive → stdlib (объединены) |
| `spec/15-regex/index.md` | `spec/14-stdlib/index.md` | Regex → stdlib (объединены) |
| `spec/13-decorators/*.md` (3 файла) | `spec/15-decorators/` | Как есть |
| `spec/11-compiler/11-compiler.md` | `spec/16-tooling/16-compiler.md` | Объединены в tooling |
| `spec/16-lsp/index.md` | `spec/16-tooling/index.md` | LSP → tooling |
| `spec/17-linter/index.md` | `spec/16-tooling/index.md` | Linter → tooling |
| `spec/18-optimizer/index.md` | `spec/16-tooling/index.md` | Optimizer → tooling |
| `spec/12-migration/12-migration.md` | `spec/17-migration/17-migration.md` | Как есть |

## Удалённые дубликаты

| Файл | Причина удаления |
|------|-----------------|
| `spec/0d-strings/0d-arc-overview.md` | Дубликат содержания 03-strings-ownership |
| `spec/05-memory/05-passing-semantics.md` | Ранее удалён, содержание в 04-borrow |
| `spec/05-memory/05-spread.md` | Ранее удалён, содержание в 08-spread-destructuring |
| Все `index.md` из старой спеки | Навигация больше не нужна |
