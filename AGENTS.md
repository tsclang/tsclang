# TSClang — инструкции для ИИ

## О проекте

TSClang — компилятор TypeScript-подобного языка (расширение `.tsc`) в C.

- CLI: `tsclang` (npm-пакет, `bin/index.js`)
- Таргеты: desktop (libuv) и embedded (AVR, без heap-async)
- Текущий статус: компилятор реализован (фазы 0–19), все 1028 тестов проходят

## Ключевые файлы

| Файл | Содержимое |
|------|-----------|
| `SPEC.md` | Полная спецификация языка — читать перед любой работой |
| `LOG.md` | Лог разработки: статус фаз, что сделано |
| `test/CORPUS.md` | Описание тестового корпуса и соглашения |

## Язык общения

Общаться на **русском**. Комментарии в коде — на **английском**.

## Дизайн-философия

См. `SPEC.md` — разделы **Зачем** и **Дизайн-философия**.

## Стиль работы

- Перед предложением изменений — читать `SPEC.md` в нужной части
- Не добавлять фичи сверх запрошенного
- Изменения в дизайне фиксировать в `SPEC.md`, прогресс — в `LOG.md`
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
  phase0/             — Core runtime (24 тестов)
  phase1/             — Базовый парсинг (166 тестов)
  phase2/             — Система типов (164 тестов)
  phase3/             — Модель памяти (159 тестов)
  phase4/             — Классы и интерфейсы (58 тестов)
  phase5/             — Обработка ошибок (21 тестов)
  phase6/             — Модули и платформы (41 тестов)
  phase7/             — Async/await (39 тестов)
  phase8/             — Конкурентность (36 тестов)
  phase9/             — CLI и сборка (25 тестов)
  phase10/            — Строки и кодировки (20 тестов)
  phase11/            — Платформо-зависимый код (38 тестов)
  phase12/            — Embedded runtime (98 тестов)
  phase13/            — Декораторы (21 тестов)
  phase14/            — Reactive (7 тестов)
  phase15/            — Regex (8 тестов)
  phase16/            — LSP (3 тестов)
  phase17/            — Linter (9 тестов)
  phase18/            — Оптимизатор (17 тестов)
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

- Все 20 фаз: 1028 тестов проходят, 0 пропусков, 0 ошибок
