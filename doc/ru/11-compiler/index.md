# Архитектура компилятора

[← Вверх](../index.md) | [Следующий →](./phases.md)

---

Архитектура компилятора TSClang для контрибьюторов. Компилятор транслирует `.tsc` в C99, делегируя машинные оптимизации C-компилятору (gcc/clang/avr-gcc).

## Pipeline

```
.tsc исходник
    ↓
Parse (lexer + parser)      →  AST
    ↓
Decorator pass              →  модифицированный AST
    ↓
Typecheck                   →  типизированный AST
    ↓
Lower to IR                 →  SSA-подобное IR (basic blocks)
    ↓
Ownership Analysis          →  borrow checker + ARC injection
    ↓
Codegen                     →  C99 + #line + CMakeLists.txt
    ↓
C-компилятор                →  бинарник / .hex
```

## Исходный код

| Путь | Назначение |
|------|-----------|
| `src/compiler/lexer.js` | Лексер |
| `src/compiler/parser.js` | Парсер → AST |
| `src/compiler/types.js` | Вспомогательные типы и манглинг |
| `src/compiler/codegen.js` | Точка входа кодогенератора, класс Context |
| `src/compiler/codegen/top-level/` | Классы, функции, интерфейсы, enum, type-алиасы |
| `src/compiler/codegen/stmt/` | Декларации переменных, control-flow, деструктуризация, match |
| `src/compiler/codegen/expr/` | Диспетчер выражений, операторы, присвоение, литералы |
| `src/compiler/codegen/calls/` | Вызовы: методы, console, stdlib, builtin, конверсии, конкурентность |
| `src/compiler/codegen/types/` | Разрешение типов, вывод, хелперы |
| `src/compiler/codegen/misc/` | Хелперы, new-expr, замыкания, массивы |
| `src/compiler/codegen/async/` | Async: statements, emit, генераторы, хелперы, сканирование |
| `src/compiler/codegen/generics.js` | Монорфизация дженериков |
| `src/runtime/runtime.h` | Заголовочный файл C-runtime |

## Методология тестов

Каждый компонент реализуется по циклу:

```
1. Тесты     — corpus (input.tsc → expected.c / expected.error)
2. Реализация — до прохождения всех тестов
3. Лог       — log/<компонент>.md: решения, проблемы, изменения
```

Тестовый корпус: `test/cases/phase0–phase19`, всего 1028 тестов. Формат описан в `test/CORPUS.md`.

## Подстраницы

| Страница | Описание |
|----------|----------|
| [Фазы компиляции](./phases.md) | Parse → AST → Decorator → Typecheck → IR → Ownership → Codegen |
| [Name mangling](./name-mangling.md) | Формальная схема, кодирование типов, module slug, коллизии |
| [Debug info](./debug.md) | `#line` директивы, DAP-сервер, embedded debugging |
| [Оптимизация](./optimization.md) | Уровни O0–O3/Os, consumer-side monomorphization, incremental *(roadmap)* |

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `type name must start with uppercase letter` | Имя класса/интерфейса не PascalCase |
| `type name uses reserved mangling prefix` | Использование `ref_`, `mut_`, `arc_`, `opt_`, `arr_` в имени типа |
| `error[TSC-EXXX]` | Стабильный код ошибки — searchable в документации |

## См. также

- [Декораторы](../04-classes/decorators.md) — decorator pass: алгоритм и ограничения
- [Модель памяти](../05-memory/index.md) — ownership, borrow checker, IR-инструкции
- [Система сборки](../09-build/index.md) — CMake, профили, embedded-таргеты
