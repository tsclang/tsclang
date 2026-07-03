## Built-in decorators overview

TSClang имеет набор встроенных декораторов, которые всегда обрабатываются компилятором и не требуют импорта. Они влияют на codegen, ownership и платформенные ограничения.

### Class decorators

| Декоратор | Эффект | Полная спецификация |
|-----------|--------|---------------------|
| `@struct` | Value-type class (inline, no vtable, no methods — embedded) | [07-classes-ownership.md](../07-classes/07-classes-ownership.md#struct--value-type-class) |
| `@pool(N)` | Статический пул из N слотов в BSS (N ≤ 64) | [07-classes-ownership.md](../07-classes/07-classes-ownership.md#pooln--статический-пул-объектов) |
| `@heap` | Heap-аллокация через `malloc`/`free`, pointer type | [07-classes-ownership.md](../07-classes/07-classes-ownership.md#heap--heap-аллокация-классов) |
| `@packed` | Compact struct layout — `__attribute__((packed))` | [07-packed-align.md](../07-classes/07-packed-align.md) |
| `@align(N)` | Выравнивание struct — `__attribute__((aligned(N)))` | [07-packed-align.md](../07-classes/07-packed-align.md) |

### Field decorators

| Декоратор | Эффект | Полная спецификация |
|-----------|--------|---------------------|
| `@readonly` | Поле неизменяемо после конструктора (`const` квалификатор). На method — error | [07-classes-ownership.md](../07-classes/07-classes-ownership.md#readonly-class-field) |

### Function decorators

| Декоратор | Эффект | Полная спецификация |
|-----------|--------|---------------------|
| `@static` | `static` функция в C (видимость ограничена TU) | [06-functions.md](../06-functions/06-functions.md#static-function--статическая-функция) |
| `@static` | На `async function` — state machine в BSS (cooperative scheduler) | [10-async.md](../10-async/10-async.md) |
| `@isr` | Обработчик прерывания (embedded only) | [11-concurrency.md](../11-concurrency/11-concurrency.md) |
| `@stack(name, N)` | Статический стек для async-рекурсии | [10-async.md](../10-async/10-async.md) |
| `@platform(target)` | Условная компиляция по платформе (function, method) | [13-build.md](../13-build/13-build.md) |

### Variable decorators

| Декоратор | Эффект | Полная спецификация |
|-----------|--------|---------------------|
| `@static` | Мутабельное глобальное состояние в BSS | [04-borrow.md](../04-ownership/04-borrow.md) |

### Принципы

1. **Контекстно-зависимы** — `@static` имеет разную семантику для let, function, async function, generator
2. **Не требуют импорта** — доступны глобально
3. **Не переопределяются** — пользовательские декораторы не могут иметь те же имена
4. **Обрабатываются в последней фазе** — после пользовательских декораторов, до type checker

См. [15-decorators.md](15-decorators.md) — полная спецификация (синтаксис, model, codegen, patterns).
