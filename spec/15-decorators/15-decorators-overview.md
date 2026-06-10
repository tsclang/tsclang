## Built-in decorators overview

TSClang имеет набор встроенных декораторов, которые всегда обрабатываются компилятором и не требуют импорта. Они влияют на codegen, ownership и платформенные ограничения.

### Class decorators

| Декоратор | Эффект | Полная спецификация |
|-----------|--------|---------------------|
| `@struct` | Value-type class (inline, no vtable, no methods) | [07-classes-ownership.md](../07-classes/07-classes-ownership.md#struct--value-type-class) |
| `@pool(N)` | Статический пул из N слотов в BSS | [07-classes-ownership.md](../07-classes/07-classes-ownership.md#pooln--статический-пул-объектов) |
| `@heap` (future) | Heap-аллокация через `malloc`/`free` | [07-classes-ownership.md](../07-classes/07-classes-ownership.md#heap--heap-аллокация-классов-future-feature) |
| `@packed` | Compact struct layout (no padding) | [07-packed-align.md](../07-classes/07-packed-align.md) |
| `@align(N)` | Выравнивание struct по N байт | [07-packed-align.md](../07-classes/07-packed-align.md) |
| `@platform(target)` | Условная компиляция класса по платформе | [13-build.md](../13-build/13-build.md) |

### Field decorators

| Декоратор | Эффект | Полная спецификация |
|-----------|--------|---------------------|
| `@static` | Одно поле на класс в BSS (не per-instance) | [07-classes-ownership.md](../07-classes/07-classes-ownership.md#static-class-field--статическое-поле-класса) |
| `@readonly` | Поле неизменяемо после конструктора | [07-classes-ownership.md](../07-classes/07-classes-ownership.md#readonly-class-field) |

### Function decorators

| Декоратор | Эффект | Полная спецификация |
|-----------|--------|---------------------|
| `@static` | `static` функция в C (видимость ограничена TU) | [06-functions.md](../06-functions/06-functions.md#static-function--статическая-функция) |
| `@inline` | Forced `static inline` в C | [06-functions.md](../06-functions/06-functions.md#inline-function--принудительный-inline) |
| `@isr` | Обработчик прерывания (embedded) | [11-concurrency.md](../11-concurrency/11-concurrency.md) |
| `@stack(name, N)` | Статический стек для async-рекурсии | [10-async.md](../10-async/10-async.md) |
| `@platform(target)` | Условная компиляция функции по платформе | [13-build.md](../13-build/13-build.md) |

### Variable decorators

| Декоратор | Эффект | Полная спецификация |
|-----------|--------|---------------------|
| `@static` | Мутабельное глобальное состояние в BSS | [04-borrow.md](../04-ownership/04-borrow.md) |

### Принципы

1. **Контекстно-зависимы** — `@static` имеет разную семантику для class field, let, function, generator
2. **Не требуют импорта** — доступны глобально
3. **Не переопределяются** — пользовательские декораторы не могут иметь те же имена
4. **Обрабатываются в последней фазе** — после пользовательских декораторов, до type checker

См. [15-decorators.md](15-decorators.md) — полная спецификация (синтаксис, model, codegen, patterns).
