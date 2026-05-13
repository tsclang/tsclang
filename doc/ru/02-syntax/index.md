# Синтаксис

[← Вверх](../index.md) | [Следующий →](./formatting.md)

---

Полное описание синтаксиса TSClang. Язык следует соглашениям TypeScript/JavaScript с расширениями для безопасной работы с памятью.

## Разделы

### Основы
- [Форматирование](./formatting.md) — точки с запятой, отступы, кавычки, линтер
- [Truthy / Falsy](./truthy-falsy.md) — какие значения считаются true/false

### Переменные
- [let / const](./variables/index.md) — мутабельность, ownership-различия

### Функции
- [Объявление](./functions/declaration.md) — `function`, параметры, возвращаемый тип
- [Стрелочные](./functions/arrow.md) — `=>` синтаксис
- [Перегрузка](./functions/overload.md) — по типам и количеству параметров
- [Дефолтные параметры](./functions/default-params.md) — значения по умолчанию

### Операторы
- [Арифметические](./operators/arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Присваивание](./operators/assignment.md) — `=`, `+=`, `-=`, и т.д.
- [Сравнения](./operators/comparison.md) — `==`, `!=`, `===`, `!==`
- [Логические](./operators/logical.md) — `&&`, `||`, `!`, `??`
- [Битовые](./operators/bitwise.md) — `&`, `|`, `^`, `~`, `<<`, `>>`
- [Опциональные](./operators/optional.md) — `?.`, `??`, spread `...`
- [Приоритет операторов](./operators/precedence.md) — таблица приоритетов

### Циклы
- [for](./loops/for.md) — классический цикл
- [for-of](./loops/for-of.md) — итерация по коллекциям
- [while / do-while](./loops/while.md) — циклы с условием
- [break / continue](./loops/break-continue.md) — управление итерациями

### Управление потоком
- [switch](./match/switch.md) — выбор по значению
- [match](./match/index.md) — pattern matching

### Срезы
- [Индексация и срезы](./slices.md) — `[]`, `[a..b]`, отрицательные индексы

## См. также

- [Типы](../03-types/index.md) — система типов
- [Модель памяти](../05-memory/index.md) — ownership и borrow checker
