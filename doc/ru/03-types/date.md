# Date — дата и время

[← Вверх](./index.md) | [Предыдущий ←](./utility-types.md)

---

JS-совместимый тип даты/времени. Реализован поверх C `time_t` / `struct tm` из `<time.h>`. Внутреннее представление — `int64_t` (миллисекунды с Unix epoch).

> **Предупреждение:** `Date` — legacy-тип. Месяцы **0-indexed** (январь = 0) — наследие C `struct tm`. Для нового кода используйте `std/temporal` (месяцы 1-indexed, иммутабельные объекты, явная временная зона).

## Создание

```typescript
new Date()                              // текущее время
new Date(1710936000000)                 // из миллисекунд с epoch
new Date("2024-03-20")                  // из ISO строки
new Date("2024-03-20T14:30:00.000Z")    // ISO с временем
new Date(2024, 2, 20)                   // год, месяц (0-11!), день
new Date(2024, 2, 20, 14, 30, 0, 0)    // + часы, минуты, секунды, мс
```

### C-output

```c
typedef struct { int64_t ms; } Date;

// new Date() — текущее время
Date Date_now_ctor() {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (Date){ ts.tv_sec * 1000LL + ts.tv_nsec / 1000000LL };
}

// new Date("2024-03-20") — из ISO строки
Date Date_from_string(String iso) {
    // parse ISO 8601 → int64_t ms
}
```

## Статические методы

```typescript
Date.now()   // i64 — текущее время в мс с epoch
```

```c
int64_t Date_now() {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return ts.tv_sec * 1000LL + ts.tv_nsec / 1000000LL;
}
```

## Геттеры

```typescript
const d = new Date("2024-03-20T14:30:00.000Z");

d.getFullYear()        // i32 — 2024
d.getMonth()           // i32 — 2 (0-11, март = 2)
d.getDate()            // i32 — 20 (день месяца, 1-31)
d.getDay()             // i32 — 3 (день недели, 0=воскресенье)
d.getHours()           // i32 — 14
d.getMinutes()         // i32 — 30
d.getSeconds()         // i32 — 0
d.getMilliseconds()    // i32 — 0
d.getTime()            // i64 — мс с epoch
d.getTimezoneOffset()  // i32 — смещение timezone в минутах
```

### C-output

```c
int32_t Date_getFullYear(Date d) {
    time_t t = d.ms / 1000;
    struct tm* tm = gmtime(&t);
    return tm->tm_year + 1900;
}

int32_t Date_getMonth(Date d) {
    time_t t = d.ms / 1000;
    struct tm* tm = gmtime(&t);
    return tm->tm_mon;  // 0-11
}
```

## Сеттеры

```typescript
d.setFullYear(2025)
d.setMonth(0)           // январь
d.setDate(1)
d.setHours(12)
d.setMinutes(0)
d.setSeconds(0)
d.setMilliseconds(0)
d.setTime(1710936000000)
```

Все сеттеры мутируют объект и возвращают новый `getTime()` (мс с epoch).

## Форматирование

```typescript
d.toISOString()          // "2024-03-20T14:30:00.000Z"
d.toString()             // "Wed Mar 20 2024 14:30:00 GMT+0000"
d.toDateString()         // "Wed Mar 20 2024"
d.toTimeString()         // "14:30:00 GMT+0000"
d.toLocaleDateString()   // локализованная дата
d.toLocaleTimeString()   // локализованное время
d.toLocaleString()       // локализованные дата и время
d.valueOf()              // i64 — то же что getTime()
```

### C-output

```c
String Date_toISOString(Date d) {
    time_t t = d.ms / 1000;
    int32_t ms = d.ms % 1000;
    struct tm* tm = gmtime(&t);
    // format: "YYYY-MM-DDTHH:MM:SS.sssZ"
    char buf[32];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
        tm->tm_year + 1900, tm->tm_mon + 1, tm->tm_mday,
        tm->tm_hour, tm->tm_min, tm->tm_sec, ms);
    return tsc_str_from_c(buf);
}
```

## Legacy: 0-indexed месяцы

Месяцы нумеруются с **0** (январь = 0, декабрь = 11). Это наследие C `struct tm`, перенятое JavaScript.

```typescript
const d = new Date(2024, 0, 15)   // 15 января 2024
d.getMonth()                       // 0 — январь

const march = new Date(2024, 2, 1) // 1 марта 2024
```

| Месяц | Значение | `getMonth()` |
|-------|----------|-------------|
| Январь | `new Date(y, 0, d)` | 0 |
| Февраль | `new Date(y, 1, d)` | 1 |
| Март | `new Date(y, 2, d)` | 2 |
| ... | ... | ... |
| Декабрь | `new Date(y, 11, d)` | 11 |

> **Примечание:** для нового кода используйте `std/temporal` — месяцы 1-indexed (январь = 1), иммутабельные объекты, явная временная зона.

## Embedded

На embedded `gmtime` / `localtime` могут быть недоступны. В этом случае геттеры/сеттеры, зависящие от timezone, недоступны — используйте `PlainDateTime` из `std/temporal`.

## Ошибки

| Код | Ошибка | Решение |
|-----|--------|---------|
| `new Date("invalid")` | Runtime panic: `invalid date string` | Проверьте формат ISO 8601 |
| `d.getMonth() === 3` | Логическая ошибка: март = 2, апрель = 3 | Учитывайте 0-indexed месяцы |
| Использование на embedded без `<time.h>` | Compile error | Используйте `std/temporal` |

## См. также

- [Числовые типы](./index.md) — `i32`, `i64` для хранения timestamp
- [Type Aliases](./type-aliases.md) — `type Timestamp = i64`
- [std/temporal](../10-stdlib/index.md) — современный API для нового кода
