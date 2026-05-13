# Enum

[← Вверх](./index.md) | [Следующий →](./generics.md) | [Предыдущий ←](./interfaces.md)

---

Перечисления TSClang — именованные наборы значений. Поддерживаются числовые, строковые и `const enum`. Обычный `enum` получает runtime-утилиты (`values()`, `fromValue()`, `toString()`), `const enum` компилируется в минимальный C-код без таблиц.

## Числовой enum

```typescript
enum Direction { North, South, East, West }   // 0, 1, 2, 3
enum Color { Red = 1, Green = 2, Blue = 4 }   // явные значения (битовые флаги)
```

```c
typedef enum { North, South, East, West } Direction;
static const Direction Direction_values[] = { North, South, East, West };
static const char*    Direction_names[]  = { "North", "South", "East", "West" };
```

## Строковый enum

```typescript
enum Status { Ok = "OK", Fail = "FAIL", Pending = "PENDING" }
```

```c
typedef enum { Status_Ok, Status_Fail, Status_Pending } Status;
static const char* Status_strings[] = { "OK", "FAIL", "PENDING" };
```

## const enum

Только C enum, без runtime таблиц. Для embedded, где важен размер бинаря.

```typescript
const enum Pin { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 }
```

```c
typedef enum { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 } Pin;
// больше ничего — нет таблиц
```

Утилиты на `const enum` недоступны:

```typescript
Pin.values()         // ошибка: const enum has no runtime table
Pin.fromValue(0)     // ошибка: const enum has no runtime table
Pin.PA0.toString()   // ошибка: const enum has no runtime table
```

## Утилиты enum (только обычный enum)

```typescript
enum Direction { North, South, East, West }

Direction.values()           // Direction[] — [North, South, East, West]
Direction.fromValue(2)       // Direction | null — Direction.East или null
Direction.North.toString()   // string — "North"

for (const d of Direction.values()) {
    console.log(d.toString());
}

const d = Direction.fromValue(userInput);
if (d != null) {
    console.log(d.toString());
}
```

## enum в switch / match

`switch` — компилятор выдаёт warning если не все значения покрыты. `match` — ошибка компилятора если не все значения покрыты (exhaustiveness check).

```typescript
// switch — warning при неполном покрытии
switch (dir) {
    case Direction.North: ...; break;
    case Direction.South: ...; break;
    case Direction.East:  ...; break;
    case Direction.West:  ...; break;
}

// match — ошибка при неполном покрытии (exhaustiveness)
const label = match (dir) {
    Direction.North => "вверх",
    Direction.South => "вниз",
    Direction.East  => "вправо",
    Direction.West  => "влево",
    // _ не нужен — все случаи покрыты
};
```

## enum vs const enum

|  | `enum` | `const enum` |
|--|--------|--------------|
| C-output | `typedef enum` + таблицы | только `typedef enum` |
| `.values()` | да | нет |
| `.fromValue()` | да | нет |
| `.toString()` | да | нет |
| Размер бинаря | больше | минимальный |
| Применение | общий случай | embedded, флаги, константы |

## C-output

### Числовой enum

```typescript
enum Direction { North, South, East, West }
```

```c
typedef enum { North, South, East, West } Direction;
static const Direction Direction_values[] = { North, South, East, West };
static const char*    Direction_names[]  = { "North", "South", "East", "West" };
```

### Строковый enum

```typescript
enum Status { Ok = "OK", Fail = "FAIL", Pending = "PENDING" }
```

```c
typedef enum { Status_Ok, Status_Fail, Status_Pending } Status;
static const char* Status_strings[] = { "OK", "FAIL", "PENDING" };
```

### const enum

```typescript
const enum Pin { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 }
```

```c
typedef enum { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 } Pin;
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `const enum has no runtime table` | Вызов `.values()`, `.fromValue()` или `.toString()` на `const enum` |
| `non-exhaustive match: missing East, West` | `match` покрывает не все варианты enum |
| `duplicate enum value: 2` | Два элемента с одинаковым значением |

## См. также

- [Классы](./classes.md) — определение, модификаторы
- [Интерфейсы](./interfaces.md) — контрактные интерфейсы, `implements`
- [Generics](./generics.md) — параметризованные типы
- [Синтаксис: match](../02-syntax/match/syntax.md) — pattern matching с exhaustiveness
