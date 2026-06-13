# TSClang — инструкции для ИИ

## Манифест TSClang — 6 принципов

### П1 — Кроссплатформенность
Код компилятора и runtime должны корректно работать на всех платформах: desktop (libuv), embedded (AVR, без heap), async (state machine), threads. Любое изменение проверяется на всех релевантных платформах.

### П2 — Максимальная совместимость с TypeScript
Если TypeScript разрешает конструкцию — TSClang тоже должен (если нет веской причины). `true & 3` работает в TS → работает у нас. Не изобретать произвольные ограничения.

### П3 — Лучше чем TS/C/C++/Rust
Брать лучшее из каждого языка. Безопасность Rust, скорость C, эргономика TS. Если все 4 языка поддерживают фичу — поддержать бесшовно. Если расходятся — выбрать наиболее правильный вариант и задокументировать.

### П4 — Продакшн-качество
TSClang — серьёзный продакшн-проект, не учебный, не пет-проект, не исследование. Делать сразу правильно, а не «потом переделаем». Никаких быстрых хаков, временных костылей, «и так сойдёт». Если нужно рефакторить — рефакторить. Если нужно покрытие — писать тесты. Качество результата важнее скорости написания.

### П5 — TDD: сначала тесты
1. Написать падающий тест (input.tsc + expected.c/out/error)
2. Запустить — убедиться что падает по правильной причине
3. Реализовать фикс
4. Запустить — убедиться что проходит

**Покрытие тестами не экономить.** Лучше 50 тестов на все комбинации типов, чем потом ловить баг на платформе, которой нет под рукой. Positive + negative (error) + edge cases + разные defaultNumber/платформы.

**Запуск тестов по фазам.** Полное тестирование запускать по частям, большие фазы бить пополам. Не запускать `node test/runner.js` без аргументов — риск таймаута.

### П6 — Не обходить баги — чинить
Если новая фича или изменение ломает существующее поведение — это блокер. Нельзя писать тесты, которые намеренно избегают сломанного пути. Если код валиден в TS — он должен работать. Не работает — чини, не обходи. Разбить на минимальные шаги, каждый с тестами и коммитом. Если шаг раскрывается в рефакторинг — остановиться, создать issue (лейбл `investigation`), и добавить error test (compile error вместо тихого бага). Не молча обходить.

### Рабочий процесс
- **Перед работой → прочитать `CONTEXT.md`** (архитектурная сводка для ИИ)
- Перед работой → `git log -n 5` (где остановился), `git grep TODO` (незакрытые)
- Перед изменениями → создать/взять issue, описать подход в комментарии
- Перед коммитом → обновить `CONTEXT.md`: зафиксировать что изменилось в архитектуре, новые паттерны, готчи — **разгрузить память для следующей сессии**
- После коммита → обновить issue (результат, commit hash, счётчик тестов), закрыть если готово

## Коммиты
- Формат: `type(scope): [WIP|STABLE] message`
  - type: feat, fix, refactor, docs, test, chore
  - scope: путь модуля (codegen/types, ir, runtime, test)
  - [WIP] — незавершённое, может не компилироваться
  - [STABLE] — завершённое, все тесты проходят
- Пример: `refactor(codegen): [STABLE] extract Emitter from Context`

## Архитектурные конвенции
- Каждый compiler pass — отдельный класс с чётким input/output
- Passes общаются через data structures (annotated AST, IR), не через shared mutable state
- IR — контракт между IRGenerator и IRCodegen

## Рефакторинг
- Маленькие шаги — каждый коммит сохраняет тесты зелёными
- Порядок: извлечение → делегирование → удаление старого кода
- [WIP] для промежуточных, [STABLE] когда все тесты проходят

## TODO-маркеры
- Формат: `// TODO: [scope] description`
- Пример: `// TODO: [ir] implement phi node codegen`

## Отслеживание работы
- GitHub Issues — единый трекер задач (вместо LOG.md)
- Лейблы: `investigation`, `enhancement`, `tech-debt`, `bug`
- Прогресс — в комментариях к issue
- Коммит ссылается на issue: `refactor(codegen): [STABLE] extract Emitter (closes #42)`
- LOG.md удалён — история разработки в `git log`

## О проекте

TSClang — компилятор TypeScript-подобного языка (расширение `.tsc`) в C.

- CLI: `tsclang` (npm-пакет, `bin/index.js`)
- Таргеты: desktop (libuv) и embedded (AVR, без heap-async)
- Текущий статус: компилятор реализован (фазы 0–19), 1942 теста (16 failing — см. issues)

## Ключевые файлы

| Файл | Содержимое |
|------|-----------|
| `CONTEXT.md` | **Архитектурная сводка для ИИ — читать первым делом при старте сессии** |
| `spec/INDEX.md` | Навигация по спецификации + фазы реализации |
| `spec/` | Спецификация языка (17 разделов по логическим слоям) |
| `spec/PHASES.md` | Маппинг тестовых фаз → разделы spec |
| `test/CORPUS.md` | Описание тестового корпуса и соглашения |

## Язык общения

Общаться на **русском**. Комментарии в коде — на **английском**.

## Дизайн-философия

См. `spec/01-intro/` — разделы **Зачем** и **Дизайн-философия**.

## Стиль работы

- Перед предложением изменений — читать `spec/` в нужном разделе (навигация в `spec/INDEX.md`)
- Не добавлять фичи сверх запрошенного
- Изменения в дизайне фиксировать в `spec/`, прогресс — в GitHub Issues
- Код компилятора на JavaScript (Node.js, ESM)

## Структура проекта

```
src/compiler/         — компилятор
  lexer.js            — лексер
  parser.js           — парсер
  types.js            — вспомогательные типы и манглинг
  codegen.js          — точка входа кодогенератора, класс Context
  codegen/
    top-level.js      — реэкспорт из top-level/ (ClassDecl, FuncDecl, Interface, Enum, TypeAlias)
    top-level/        — 6 модулей: dispatch, func, class, program, decorators, types-alias
    stmt.js           — тонкий диспетчер (visitStmtInMain)
    stmt/             — 4 модуля: vardecl, control-flow, destruct, match
    expr.js           — реэкспорт из expr/
    expr/             — 4 модуля: dispatch, operators, assign, literals
    calls/            — 8 модулей: call-dispatch, method-dispatch, console, stdlib,
    │                    builtin, builtin-helpers, conversion, concurrency
    types.js          — реэкспорт из types/
    types/            — 3 модуля: resolve, infer, helpers
    misc.js           — реэкспорт из misc/
    misc/             — 4 модуля: emit-helpers, new-expr, closures, arrays
    async.js          — реэкспорт из async/
    async/            — 5 модулей: async-stmt, async-emit, generator, helpers, scan
    generics.js       — монорфизация дженериков
src/runtime/          — runtime.h (заголовочный файл для C-output)
bin/index.js          — CLI (команда build)
test/runner.js        — тест-раннер
test/cases/           — тестовый корпус (phase0–phase19)
  phase0/             — Core runtime (30 тестов)
  phase1/             — Базовый парсинг (536 тестов)
  phase2/             — Система типов (322 тестов)
  phase3/             — Модель памяти (360 тестов)
  phase4/             — Классы и интерфейсы (81 тестов)
  phase5/             — Обработка ошибок (27 тестов)
  phase6/             — Модули и платформы (48 тестов)
  phase7/             — Async/await (81 тестов)
  phase8/             — Конкурентность (44 тестов)
  phase9/             — CLI и сборка (57 тестов)
  phase10/            — Строки и кодировки (20 тестов)
  phase11/            — Платформо-зависимый код (69 тестов)
  phase12/            — Embedded runtime (119 тестов)
  phase13/            — Декораторы (21 тестов)
  phase14/            — Reactive (7 тестов)
  phase15/            — Regex (10 тестов)
  phase16/            — LSP (3 тестов)
  phase17/            — Linter (12 тестов)
  phase18/            — Оптимизатор (21 тестов)
  phase19/            — IO/Net/WS (74 тестов)
```

## Тесты

```bash
npm test                        # все тесты
node test/runner.js phase3      # только phase3
node test/runner.js --no-gcc    # только C-compare, без компиляции
node test/runner.js --verbose   # показывать diff при провале
```

Каждый тест: `test/cases/<phase>/<feature>/<name>/`
- `input.tsc` — входной код
- `expected.c` — ожидаемый C-output ([F] fragment или [R] runnable)
- `expected.out` — ожидаемый stdout при запуске ([R] only)
- `expected.error` — ожидаемое сообщение об ошибке ([E] error)

## Запуск CLI вручную

При ручном запуске `tsclang build` ВСЕГДА указывай `--outDir` во временную папку:

```bash
node bin/index.js build input.tsc --outDir .tsclang-tmp/
```

Или используй программный API вместо CLI:

```js
import { codegen } from './src/compiler/codegen.js';
const result = codegen(ast, 'desktop');
// result.c — C-код как строка
```

**Никогда не запускай `tsclang build` без `--outDir` из корня проекта** — артефакты (`.c`, `CMakeLists.txt`) попадут в корень и засорят его.

## Текущий статус тестов

- Все 20 фаз: 1942 теста, 1926 проходят, 16 падают (phase1: 8, phase10: 1, phase11: 7)
