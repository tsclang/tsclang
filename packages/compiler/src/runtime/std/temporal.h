/* std/temporal.h — TSClang Temporal date/time API */
#pragma once
#include <time.h>
#include <stdint.h>
#include <string.h>

typedef struct { int32_t year; int32_t month; int32_t day; } TscPlainDate;
typedef struct { int32_t hour; int32_t minute; int32_t second; int32_t millisecond; } TscPlainTime;
typedef struct {
    int32_t year; int32_t month; int32_t day;
    int32_t hour; int32_t minute; int32_t second; int32_t millisecond;
} TscPlainDateTime;
typedef struct { int32_t years; int32_t months; int32_t days; int32_t hours; int32_t minutes; int32_t seconds; } TscDuration;
typedef struct { int64_t epochNanoseconds; } TscInstant;
typedef struct {
    int32_t year; int32_t month; int32_t day;
    int32_t hour; int32_t minute; int32_t second;
    String  timeZone;
} TscZonedDateTime;

static inline TscPlainDate tsc_plain_date_from(int32_t y, int32_t m, int32_t d) {
    return (TscPlainDate){ .year = y, .month = m, .day = d };
}

static inline TscPlainTime tsc_plain_time_from(int32_t h, int32_t m, int32_t s) {
    return (TscPlainTime){ .hour = h, .minute = m, .second = s };
}

static inline TscPlainDateTime tsc_plain_datetime_from(TscPlainDate d, TscPlainTime t) {
    return (TscPlainDateTime){
        .year = d.year, .month = d.month, .day = d.day,
        .hour = t.hour, .minute = t.minute, .second = t.second
    };
}

static inline TscDuration tsc_duration_from_days(int32_t days) {
    return (TscDuration){ .days = days };
}

static inline TscDuration tsc_duration_from_hms(int32_t h, int32_t m, int32_t s) {
    return (TscDuration){ .hours = h, .minutes = m, .seconds = s };
}

static inline TscPlainDate tsc_plain_date_add(TscPlainDate d, TscDuration dur) {
    /* Simple day addition using mktime/localtime */
    struct tm t = {0};
    t.tm_year = d.year - 1900;
    t.tm_mon  = d.month - 1;
    t.tm_mday = d.day + dur.days;
    mktime(&t);
    return (TscPlainDate){ .year = t.tm_year + 1900, .month = t.tm_mon + 1, .day = t.tm_mday };
}

static inline TscDuration tsc_plain_date_until(TscPlainDate d1, TscPlainDate d2) {
    struct tm t1 = {0}, t2 = {0};
    t1.tm_year = d1.year - 1900; t1.tm_mon = d1.month - 1; t1.tm_mday = d1.day;
    t2.tm_year = d2.year - 1900; t2.tm_mon = d2.month - 1; t2.tm_mday = d2.day;
    time_t tt1 = mktime(&t1), tt2 = mktime(&t2);
    int32_t days = (int32_t)((tt2 - tt1) / 86400);
    return (TscDuration){ .days = days };
}

static inline TscInstant tsc_instant_now(void) {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (TscInstant){ .epochNanoseconds = (int64_t)ts.tv_sec * 1000000000LL + ts.tv_nsec };
}

static inline TscPlainDate tsc_now_plain_date(String tz) {
    (void)tz;
    time_t t = time(NULL);
    struct tm *tm = gmtime(&t);
    return (TscPlainDate){ .year = tm->tm_year + 1900, .month = tm->tm_mon + 1, .day = tm->tm_mday };
}

static inline TscZonedDateTime tsc_zoned_datetime_now(String tz) {
    time_t t = time(NULL);
    struct tm *tm = gmtime(&t);
    return (TscZonedDateTime){
        .year = tm->tm_year + 1900, .month = tm->tm_mon + 1, .day = tm->tm_mday,
        .hour = tm->tm_hour, .minute = tm->tm_min, .second = tm->tm_sec,
        .timeZone = tz
    };
}
