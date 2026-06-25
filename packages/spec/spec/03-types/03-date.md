## Date

**Намеренный legacy-тип.** Сохранён для совместимости с устоявшимся поведением в двух мирах:
- **C:** `struct tm` из `<time.h>` — месяцы 0-indexed (январь = 0), это стандарт C со времён POSIX
- **JS/TS:** `Date` — та же конвенция, перенятая из C

`Date` не является ошибкой дизайна — он намеренно воспроизводит legacy поведение для кода который взаимодействует с C-библиотеками, системным временем или портируется из JS. Для нового кода используй `std/temporal` (месяцы 1-indexed, явная временная зона, иммутабельные объекты).

JS-совместимый тип даты/времени. Реализован поверх C `time_t` / `struct tm` из `<time.h>`.

Внутреннее представление — `int64_t` (миллисекунды с Unix epoch), как в JS.

### Создание

```typescript
new Date()                              // текущее время
new Date(1710936000000)                 // из миллисекунд с epoch
new Date("2024-03-20")                  // из ISO строки
new Date("2024-03-20T14:30:00.000Z")    // ISO с временем
new Date(2024, 2, 20)                   // год, месяц (0-11!), день
new Date(2024, 2, 20, 14, 30, 0, 0)    // + часы, минуты, секунды, мс
```

### Статические методы

```typescript
Date.now()   // number — текущее время в мс с epoch
```

### Геттеры

```typescript
const d = new Date("2024-03-20T14:30:00.000Z");

d.getFullYear()        // number — 2024
d.getMonth()           // number — 2 (0-11, март = 2)
d.getDate()            // number — 20 (день месяца, 1-31)
d.getDay()             // number — 3 (день недели, 0=воскресенье)
d.getHours()           // number — 14
d.getMinutes()         // number — 30
d.getSeconds()         // number — 0
d.getMilliseconds()    // number — 0
d.getTime()            // number — мс с epoch
d.getTimezoneOffset()  // number — смещение timezone в минутах
```

### Сеттеры

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

### Форматирование

```typescript
d.toISOString()          // "2024-03-20T14:30:00.000Z"
d.toString()             // "Wed Mar 20 2024 14:30:00 GMT+0000"
d.toDateString()         // "Wed Mar 20 2024"
d.toTimeString()         // "14:30:00 GMT+0000"
d.toLocaleDateString()   // локализованная дата
d.toLocaleTimeString()   // локализованное время
d.toLocaleString()       // локализованные дата и время
d.valueOf()              // number — то же что getTime()
```

### C-output

```c
typedef struct { int64_t ms; } Date;

// new Date() / Date.now()
Date d = tsc_date_now();

// new Date(ms)
Date d = tsc_date_from_ms((int64_t)(ms));

// getFullYear()
int32_t year = tsc_date_get_full_year(d);

// getTime()
int64_t ms = tsc_date_get_time(d);

// toISOString()
String iso = tsc_date_to_iso_string(d);
```

> На embedded `gmtime` / `localtime` могут быть недоступны — используй `PlainDateTime` (Temporal, в разработке).

