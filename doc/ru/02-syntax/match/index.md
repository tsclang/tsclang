# Ветвление: switch и match

[← Вверх](../index.md) | [Следующий →](./switch.md)

---

TSClang предоставляет две конструкции для ветвления по значению:

- **`switch`** — оператор выбора по значению. Аналог JS/TS, но с **запрещённым неявным fallthrough**.
- **`match`** — выражение с pattern matching. Возвращает значение, проверяет полноту покрытия.

## Краткое сравнение

| | `switch` | `match` |
|---|---|---|
| Тип | оператор (statement) | выражение (возвращает значение) |
| Полнота покрытия | предупреждение (warning) | ошибка компиляции (error) |
| Паттерны | только равенство | литералы, диапазоны, деструктуризация, `|` |
| Fallthrough | запрещён | нет (каждая ветка — отдельное выражение) |
| Поддерживаемые типы | numeric, string, boolean, enum | любой тип |

## Пример

```typescript
// switch — оператор, ничего не возвращает
switch (status) {
    case 200:
        console.log("OK");
        break;
    default:
        console.log("error");
}

// match — выражение, возвращает значение
const label = match (x) {
    0       => "zero",
    1..10   => "small",
    _       => "large",
};
```

## Подробные страницы

- [switch](./switch.md) — оператор выбора: синтаксис, fallthrough, enum, C-output
- [match](./syntax.md) — pattern matching: паттерны, exhaustiveness, деструктуризация, C-output

## См. также

- [Переменные](../variables/index.md) — let / const и ownership
- [Enum](../../03-types/enum.md) — перечисления и exhaustiveness
- [Модель памяти](../../05-memory/index.md) — move-семантика в match
