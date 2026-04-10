# TSClang — инструкции для Claude

## О проекте

TSClang — компилятор TypeScript-подобного языка (расширение `.tsc`) в C.

- CLI: `tsclang` (npm-пакет, `bin/index.js`)
- Таргеты: desktop (libuv) и embedded (AVR, без heap-async)
- Текущий статус: компилятор реализован (фазы 0–3), фаза 4+ в работе

## Ключевые файлы

| Файл | Содержимое |
|------|-----------|
| `SPEC.md` | Полная спецификация языка — читать перед любой работой |
| `LOG.md` | Лог разработки: статус фаз, что сделано |
| `doc/CORPUS.md` | Описание тестового корпуса и соглашения |

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
    top-level.js      — ClassDecl, FuncDecl, Interface, Enum, TypeAlias
    stmt.js           — VarDecl, If, For, While, Switch, Return, ...
    expr.js           — выражения: Ident, Member, Index, Binary, Unary, ...
    calls.js          — вызовы: console.log, string/array/map методы, ...
    types.js          — resolveType, inferType, mangleType, ...
    misc.js           — вспомогательные методы codegen
    generics.js       — монорфизация дженериков
src/runtime/          — runtime.h (заголовочный файл для C-output)
bin/index.js          — CLI (команда build)
test/runner.js        — тест-раннер
doc/                  — тестовый корпус (phase0–phase13)
  phase0/             — Core runtime
  phase1/             — Базовый парсинг
  phase2/             — Система типов
  phase3/             — Модель памяти
  phase4+/            — не реализовано
```

## Тесты

```bash
npm test                        # все тесты
node test/runner.js phase3      # только phase3
node test/runner.js --no-gcc    # только C-compare, без компиляции
node test/runner.js --verbose   # показывать diff при провале
```

Каждый тест: `doc/<phase>/<feature>/<name>/`
- `input.tsc` — входной код
- `expected.c` — ожидаемый C-output ([F] fragment или [R] runnable)
- `expected.out` — ожидаемый stdout при запуске ([R] only)
- `expected.error` — ожидаемое сообщение об ошибке ([E] error)

## Текущий статус тестов

- Phase 0–2: все [F]/[R] тесты проходят
- Phase 3: все [F]/[R] тесты проходят; [E] (borrow checker) не реализованы
- Phase 4+: `expected.c` ещё не написаны
