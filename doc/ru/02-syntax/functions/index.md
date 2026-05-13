# Функции

[← Вверх](../index.md) | [Следующий →](./declaration.md)

---

Функции в TSClang следуют синтаксису TypeScript с расширениями для работы с ownership-моделью. Компилятор транслирует функции в C с name mangling для поддержки перегрузки.

## Разделы

| Страница | Описание |
|----------|----------|
| [Объявление функций](./declaration.md) | `function`, анонимные функции, IIFE, замыкания |
| [Стрелочные функции](./arrow.md) | Синтаксис `=>`, expression/block body, async |
| [Перегрузка функций](./overload.md) | По типам и количеству параметров, name mangling |
| [Дефолтные параметры](./default-params.md) | Значения по умолчанию, подстановка на callsite |

## Общие свойства

- Все TSClang-функции в C-output помечены `static` — не видны линковщику вне единицы компиляции
- Только `export extern "C"` функции non-static с явным C-именем
- Примитивы (`i8`..`f64`, `bool`) передаются по значению (copy)
- Сложные типы управляются ownership-системой (move / borrow)

## C-output: базовая структура

```typescript
function add(a: i32, b: i32): i32 {
    return a + b;
}
```

```c
int32_t add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}
```

---

## См. также

- [Переменные: let / const](../variables/index.md) — влияние на передачу как `Mut<T>`
- [Типы](../../03-types/index.md) — числовые типы, строки, arrays
- [Модель памяти](../../05-memory/index.md) — ownership, borrow checker, замыкания
- [Обработка ошибок](../../06-errors/index.md) — `throws`, `try/catch`
