# Date — Date and Time

[← Up](./index.md) | [Previous ←](./utility-types.md)

---

JS-compatible date/time type. Implemented on top of C `time_t` / `struct tm` from `<time.h>`. Internal representation is `int64_t` (milliseconds since Unix epoch).

> **Warning:** `Date` is a legacy type. Months are **0-indexed** (January = 0) — a legacy of C `struct tm`. For new code use `std/temporal` (1-indexed months, immutable objects, explicit time zone).

## Creation

```typescript
new Date()                              // current time
new Date(1710936000000)                 // from milliseconds since epoch
new Date("2024-03-20")                  // from ISO string
new Date("2024-03-20T14:30:00.000Z")    // ISO with time
new Date(2024, 2, 20)                   // year, month (0-11!), day
new Date(2024, 2, 20, 14, 30, 0, 0)    // + hours, minutes, seconds, ms
```

### C-output

```c
typedef struct { int64_t ms; } Date;

// new Date() — current time
Date Date_now_ctor() {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (Date){ ts.tv_sec * 1000LL + ts.tv_nsec / 1000000LL };
}

// new Date("2024-03-20") — from ISO string
Date Date_from_string(String iso) {
    // parse ISO 8601 → int64_t ms
}
```

## Static methods

```typescript
Date.now()   // i64 — current time in ms since epoch
```

```c
int64_t Date_now() {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return ts.tv_sec * 1000LL + ts.tv_nsec / 1000000LL;
}
```

## Getters

```typescript
const d = new Date("2024-03-20T14:30:00.000Z");

d.getFullYear()        // i32 — 2024
d.getMonth()           // i32 — 2 (0-11, March = 2)
d.getDate()            // i32 — 20 (day of month, 1-31)
d.getDay()             // i32 — 3 (day of week, 0=Sunday)
d.getHours()           // i32 — 14
d.getMinutes()         // i32 — 30
d.getSeconds()         // i32 — 0
d.getMilliseconds()    // i32 — 0
d.getTime()            // i64 — ms since epoch
d.getTimezoneOffset()  // i32 — timezone offset in minutes
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

## Setters

```typescript
d.setFullYear(2025)
d.setMonth(0)           // January
d.setDate(1)
d.setHours(12)
d.setMinutes(0)
d.setSeconds(0)
d.setMilliseconds(0)
d.setTime(1710936000000)
```

All setters mutate the object and return the new `getTime()` (ms since epoch).

## Formatting

```typescript
d.toISOString()          // "2024-03-20T14:30:00.000Z"
d.toString()             // "Wed Mar 20 2024 14:30:00 GMT+0000"
d.toDateString()         // "Wed Mar 20 2024"
d.toTimeString()         // "14:30:00 GMT+0000"
d.toLocaleDateString()   // localized date
d.toLocaleTimeString()   // localized time
d.toLocaleString()       // localized date and time
d.valueOf()              // i64 — same as getTime()
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

## Legacy: 0-indexed months

Months are numbered from **0** (January = 0, December = 11). This is a legacy of C `struct tm`, inherited by JavaScript.

```typescript
const d = new Date(2024, 0, 15)   // January 15, 2024
d.getMonth()                       // 0 — January

const march = new Date(2024, 2, 1) // March 1, 2024
```

| Month | Value | `getMonth()` |
|-------|-------|-------------|
| January | `new Date(y, 0, d)` | 0 |
| February | `new Date(y, 1, d)` | 1 |
| March | `new Date(y, 2, d)` | 2 |
| ... | ... | ... |
| December | `new Date(y, 11, d)` | 11 |

> **Note:** for new code use `std/temporal` — 1-indexed months (January = 1), immutable objects, explicit time zone.

## Embedded

On embedded platforms `gmtime` / `localtime` may be unavailable. In this case getters/setters that depend on timezone are unavailable — use `PlainDateTime` from `std/temporal`.

## Errors

| Code | Error | Solution |
|------|-------|----------|
| `new Date("invalid")` | Runtime panic: `invalid date string` | Check ISO 8601 format |
| `d.getMonth() === 3` | Logic error: March = 2, April = 3 | Account for 0-indexed months |
| Using on embedded without `<time.h>` | Compile error | Use `std/temporal` |

## See also

- [Numeric Types](./index.md) — `i32`, `i64` for storing timestamps
- [Type Aliases](./type-aliases.md) — `type Timestamp = i64`
- [std/temporal](../10-stdlib/index.md) — modern API for new code
