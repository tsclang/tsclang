/*
 * TSClang runtime — header-only
 * Included by all generated C files: gcc -I src/runtime
 *
 * Type mapping (TSClang → C):
 *   i8→int8_t   i16→int16_t   i32→int32_t   i64→int64_t
 *   u8→uint8_t  u16→uint16_t  u32→uint32_t  u64→uint64_t
 *   f32→float   f64→double    bool→bool      usize→size_t
 *   string→String
 *
 * console.log(x) rules:
 *   string literal  → printf("...\n")
 *   i32/i16/i8      → printf("%d\n", v)
 *   u32/u16/u8      → printf("%u\n", v)
 *   i64             → printf("%lld\n", (long long)v)
 *   u64             → printf("%llu\n", (unsigned long long)v)
 *   f64             → printf("%g\n", v)
 *   f32             → printf("%g\n", (double)v)
 *   bool            → printf("%s\n", (v) ? "true" : "false")
 *   multi-arg       → single printf with merged format string
 * console.error/warn/debug → fprintf(stderr, ...)
 */

#pragma once

#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <stdlib.h>
#include <stdarg.h>
#include <ctype.h>
#ifndef TSC_EMBEDDED
#include <stdatomic.h>
#endif

/* ISR fallback for non-AVR targets (avr-libc defines the real one) */
#ifndef __AVR_ARCH__
#ifndef ISR
#define ISR(vector) void vector##_handler(void)
#endif
#endif

/* Math constants — POSIX extensions, not guaranteed by C99 */
#ifndef M_E
#define M_E        2.718281828459045235360
#endif
#ifndef M_LOG2E
#define M_LOG2E    1.442695040888963407360
#endif
#ifndef M_LOG10E
#define M_LOG10E   0.434294481903251827651
#endif
#ifndef M_LN2
#define M_LN2      0.693147180559945309417
#endif
#ifndef M_LN10
#define M_LN10     2.302585092994045684018
#endif
#ifndef M_PI
#define M_PI       3.141592653589793238463
#endif
#ifndef M_SQRT2
#define M_SQRT2    1.414213562373095048802
#endif
#ifndef M_SQRT1_2
#define M_SQRT1_2  0.707106781186547524401
#endif

/* -------------------------------------------------------------------------
 * String
 * ------------------------------------------------------------------------- */
typedef struct {
    const char *data;
    size_t      length;
    size_t      capacity; /* 0 = rodata (literal), >0 = heap */
} String;

/* Construct a string literal (no heap allocation) */
#define STR_LIT(s) ((String){ .data = (s), .length = sizeof(s) - 1, .capacity = 0 })

/* -------------------------------------------------------------------------
 * Error (stub — proper heap allocation added in Phase 3)
 * ------------------------------------------------------------------------- */
typedef struct TscError {
    String message;
} TscError;

/* -------------------------------------------------------------------------
 * performance.now() — milliseconds since program start
 * _tsc_t0 is set in TSC_INIT() which the compiler inserts at top of main()
 * ------------------------------------------------------------------------- */
static double _tsc_t0 = 0.0;

static inline void _tsc_init(void) {
#ifndef TSC_NES
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    _tsc_t0 = (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1.0e6;
#endif
}

static inline double tsc_performance_now(void) {
#ifndef TSC_NES
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1.0e6 - _tsc_t0;
#else
    return 0.0;
#endif
}

/* performance.mark / performance.measure */
typedef struct { String name; double duration; double startTime; } TscPerfEntry;
#define TSC_PERF_MARKS_MAX 16
typedef struct { String name; double ts; } _TscPerfMark;
static _TscPerfMark _tsc_perf_marks[TSC_PERF_MARKS_MAX];
static size_t _tsc_perf_mark_count = 0;
static inline void tsc_performance_mark(String name) {
    double ts = tsc_performance_now();
    for (size_t _i = 0; _i < _tsc_perf_mark_count; _i++) {
        if (_tsc_perf_marks[_i].name.length == name.length &&
            memcmp(_tsc_perf_marks[_i].name.data, name.data, name.length) == 0)
            { _tsc_perf_marks[_i].ts = ts; return; }
    }
    if (_tsc_perf_mark_count < TSC_PERF_MARKS_MAX)
        _tsc_perf_marks[_tsc_perf_mark_count++] = (_TscPerfMark){name, ts};
}
static inline double _tsc_perf_get_mark(String name) {
    for (size_t _i = 0; _i < _tsc_perf_mark_count; _i++) {
        if (_tsc_perf_marks[_i].name.length == name.length &&
            memcmp(_tsc_perf_marks[_i].name.data, name.data, name.length) == 0)
            return _tsc_perf_marks[_i].ts;
    }
    return 0.0;
}
static inline TscPerfEntry tsc_performance_measure(String name, String startMark, String endMark) {
    double _st = _tsc_perf_get_mark(startMark);
    double _en = _tsc_perf_get_mark(endMark);
    return (TscPerfEntry){name, _en - _st, _st};
}

/* Compiler inserts this at the top of main() */
#define TSC_INIT() _tsc_init()

/* -------------------------------------------------------------------------
 * Date — legacy JS-compatible date/time type (ms since Unix epoch)
 * ------------------------------------------------------------------------- */
typedef struct { int64_t ms; } Date;

/* Portable UTC mktime (_tsc_timegm is POSIX extension, not on Windows) */
static inline time_t _tsc_timegm(struct tm *tm) {
    /* Days per month (non-leap) */
    static const int _dpm[] = {31,28,31,30,31,30,31,31,30,31,30,31};
    int y = tm->tm_year + 1900, m = tm->tm_mon + 1, d = tm->tm_mday;
    /* Normalize month */
    while (m > 12) { m -= 12; y++; }
    while (m < 1)  { m += 12; y--; }
    /* Days since epoch via formula */
    long days = 0;
    int yy;
    for (yy = 1970; yy < y; yy++)
        days += (yy%4==0 && (yy%100!=0 || yy%400==0)) ? 366 : 365;
    for (int mm = 1; mm < m; mm++) {
        days += _dpm[mm-1];
        if (mm == 2 && (y%4==0 && (y%100!=0 || y%400==0))) days++;
    }
    days += d - 1;
    return (time_t)(days * 86400LL + tm->tm_hour * 3600LL + tm->tm_min * 60LL + tm->tm_sec);
}

static inline Date tsc_date_from_ms(int64_t ms) { return (Date){ ms }; }

static inline int64_t tsc_date_now(void) {
#ifndef TSC_EMBEDDED
    struct timespec _ts;
    clock_gettime(CLOCK_REALTIME, &_ts);
    return (int64_t)_ts.tv_sec * 1000LL + (int64_t)_ts.tv_nsec / 1000000LL;
#else
    return 0LL;
#endif
}

static inline int32_t tsc_date_get_full_year(Date d) {
    time_t t = (time_t)(d.ms / 1000); struct tm *tm = gmtime(&t); return tm->tm_year + 1900; }
static inline int32_t tsc_date_get_month(Date d) {
    time_t t = (time_t)(d.ms / 1000); struct tm *tm = gmtime(&t); return tm->tm_mon; }
static inline int32_t tsc_date_get_date(Date d) {
    time_t t = (time_t)(d.ms / 1000); struct tm *tm = gmtime(&t); return tm->tm_mday; }
static inline int32_t tsc_date_get_day(Date d) {
    time_t t = (time_t)(d.ms / 1000); struct tm *tm = gmtime(&t); return tm->tm_wday; }
static inline int32_t tsc_date_get_hours(Date d) {
    time_t t = (time_t)(d.ms / 1000); struct tm *tm = gmtime(&t); return tm->tm_hour; }
static inline int32_t tsc_date_get_minutes(Date d) {
    time_t t = (time_t)(d.ms / 1000); struct tm *tm = gmtime(&t); return tm->tm_min; }
static inline int32_t tsc_date_get_seconds(Date d) {
    time_t t = (time_t)(d.ms / 1000); struct tm *tm = gmtime(&t); return tm->tm_sec; }
static inline int32_t tsc_date_get_milliseconds(Date d) { return (int32_t)(d.ms % 1000); }
static inline int64_t tsc_date_get_time(Date d) { return d.ms; }
static inline int32_t tsc_date_get_timezone_offset(Date d) {
    (void)d;
    time_t now = time(NULL);
    struct tm *gmt = gmtime(&now);
    time_t gmt_t = mktime(gmt);
    struct tm *loc = localtime(&now);
    time_t loc_t = mktime(loc);
    return (int32_t)((gmt_t - loc_t) / 60);
}

static inline void tsc_date_set_full_year(Date *d, int32_t y) {
    time_t t = (time_t)(d->ms / 1000); struct tm tm = *gmtime(&t);
    tm.tm_year = y - 1900; d->ms = (int64_t)_tsc_timegm(&tm) * 1000LL + d->ms % 1000; }
static inline void tsc_date_set_month(Date *d, int32_t m) {
    time_t t = (time_t)(d->ms / 1000); struct tm tm = *gmtime(&t);
    tm.tm_mon = m; d->ms = (int64_t)_tsc_timegm(&tm) * 1000LL + d->ms % 1000; }
static inline void tsc_date_set_date(Date *d, int32_t day) {
    time_t t = (time_t)(d->ms / 1000); struct tm tm = *gmtime(&t);
    tm.tm_mday = day; d->ms = (int64_t)_tsc_timegm(&tm) * 1000LL + d->ms % 1000; }
static inline void tsc_date_set_hours(Date *d, int32_t h) {
    time_t t = (time_t)(d->ms / 1000); struct tm tm = *gmtime(&t);
    tm.tm_hour = h; d->ms = (int64_t)_tsc_timegm(&tm) * 1000LL + d->ms % 1000; }
static inline void tsc_date_set_minutes(Date *d, int32_t m) {
    time_t t = (time_t)(d->ms / 1000); struct tm tm = *gmtime(&t);
    tm.tm_min = m; d->ms = (int64_t)_tsc_timegm(&tm) * 1000LL + d->ms % 1000; }
static inline void tsc_date_set_seconds(Date *d, int32_t s) {
    time_t t = (time_t)(d->ms / 1000); struct tm tm = *gmtime(&t);
    tm.tm_sec = s; d->ms = (int64_t)_tsc_timegm(&tm) * 1000LL + d->ms % 1000; }
static inline void tsc_date_set_milliseconds(Date *d, int32_t ms) {
    d->ms = (d->ms / 1000) * 1000LL + (int64_t)ms; }
static inline void tsc_date_set_time(Date *d, int64_t ms) { d->ms = ms; }

static inline String tsc_date_to_iso_string(Date d) {
    time_t t = (time_t)(d.ms / 1000);
    struct tm *tm = gmtime(&t);
    char *buf = (char *)malloc(32);
    int ms = (int)(d.ms % 1000);
    if (ms < 0) ms += 1000;
    snprintf(buf, 32, "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
             tm->tm_year + 1900, tm->tm_mon + 1, tm->tm_mday,
             tm->tm_hour, tm->tm_min, tm->tm_sec, ms);
    return (String){ buf, (size_t)strlen(buf) };
}

static inline String tsc_date_to_date_string(Date d) {
    static const char *days[] = {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"};
    static const char *months[] = {"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"};
    time_t t = (time_t)(d.ms / 1000); struct tm *tm = gmtime(&t);
    char *buf = (char *)malloc(32);
    snprintf(buf, 32, "%s %s %02d %04d", days[tm->tm_wday], months[tm->tm_mon], tm->tm_mday, tm->tm_year + 1900);
    return (String){ buf, (size_t)strlen(buf) };
}

static inline String tsc_date_to_string(Date d) {
    time_t t = (time_t)(d.ms / 1000); struct tm *tm = gmtime(&t);
    static const char *days[] = {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"};
    static const char *months[] = {"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"};
    char *buf = (char *)malloc(64);
    snprintf(buf, 64, "%s %s %02d %04d %02d:%02d:%02d GMT+0000",
             days[tm->tm_wday], months[tm->tm_mon], tm->tm_mday,
             tm->tm_year + 1900, tm->tm_hour, tm->tm_min, tm->tm_sec);
    return (String){ buf, (size_t)strlen(buf) };
}

/* console.time / console.timeEnd — simple map-backed timers */
#define _TSC_CONSOLE_TIMERS_CAP 16
typedef struct {
    String _label;
    double _start;
} _TscTimer;
static _TscTimer _tsc_timers[_TSC_CONSOLE_TIMERS_CAP];
static int _tsc_timer_count = 0;
static inline void tsc_console_time(String label) {
    for (int _i = 0; _i < _tsc_timer_count; _i++) {
        if (_tsc_timers[_i]._label.length == label.length &&
            memcmp(_tsc_timers[_i]._label.data, label.data, label.length) == 0)
            return;
    }
    if (_tsc_timer_count < _TSC_CONSOLE_TIMERS_CAP) {
        _tsc_timers[_tsc_timer_count]._label = label;
        _tsc_timers[_tsc_timer_count]._start = tsc_performance_now();
        _tsc_timer_count++;
    }
}
static inline void tsc_console_time_end(String label) {
    double _end = tsc_performance_now();
    for (int _i = 0; _i < _tsc_timer_count; _i++) {
        if (_tsc_timers[_i]._label.length == label.length &&
            memcmp(_tsc_timers[_i]._label.data, label.data, label.length) == 0) {
            double _ms = _end - _tsc_timers[_i]._start;
            fprintf(stderr, "%.*s: %.3fms\n", (int)label.length, label.data, _ms);
            /* Remove timer */
            _tsc_timers[_i] = _tsc_timers[--_tsc_timer_count];
            return;
        }
    }
}
static inline void tsc_console_trace(String msg) {
    fprintf(stderr, "Trace: %.*s\n", (int)msg.length, msg.data);
}
static inline void tsc_console_time_log(String label) {
    double _now = tsc_performance_now();
    for (int _i = 0; _i < _tsc_timer_count; _i++) {
        if (_tsc_timers[_i]._label.length == label.length &&
            memcmp(_tsc_timers[_i]._label.data, label.data, label.length) == 0) {
            double _ms = _now - _tsc_timers[_i]._start;
            fprintf(stderr, "%.*s: %.3fms\n", (int)label.length, label.data, _ms);
            return;
        }
    }
}

/* -------------------------------------------------------------------------
 * TscRandom — xorshift64 PRNG
 * ------------------------------------------------------------------------- */
typedef struct { uint64_t state; } TscRandom;
static inline TscRandom tsc_random_seed(uint64_t seed) {
    if (seed == 0) seed = 1;
    return (TscRandom){ seed };
}
static inline uint64_t _tsc_xorshift64(uint64_t *s) {
    uint64_t x = *s;
    x ^= x << 13; x ^= x >> 7; x ^= x << 17;
    return *s = x;
}
static inline int32_t tsc_random_next_i32(TscRandom *r) {
    return (int32_t)(_tsc_xorshift64(&r->state) >> 32);
}
static inline int64_t tsc_random_next_i64(TscRandom *r) {
    return (int64_t)_tsc_xorshift64(&r->state);
}
static inline double tsc_random_next_f64(TscRandom *r) {
    return (double)(_tsc_xorshift64(&r->state) >> 11) / (double)(UINT64_C(1) << 53);
}
static inline int32_t tsc_random_range_i32(TscRandom *r, int32_t lo, int32_t hi) {
    if (hi <= lo) return lo;
    return lo + (int32_t)(_tsc_xorshift64(&r->state) % (uint32_t)(hi - lo));
}
static inline TscRandom tsc_random_default(void) {
#ifndef TSC_NES
    struct timespec _ts;
    clock_gettime(CLOCK_MONOTONIC, &_ts);
    uint64_t seed = (uint64_t)_ts.tv_nsec ^ ((uint64_t)_ts.tv_sec << 32);
    if (seed == 0) seed = 1;
    return (TscRandom){ seed };
#else
    return (TscRandom){ 12345 };
#endif
}

/* -------------------------------------------------------------------------
 * String utilities
 * ------------------------------------------------------------------------- */

/* Create a String from a runtime (non-literal) char pointer */
#define STR_LIT_RUNTIME(s) ((String){ .data = (s), .length = strlen(s), .capacity = 0 })

/* -------------------------------------------------------------------------
 * ARC — Atomic Reference Counting
 * All Shared<T> structs have int32_t _refcount as their first field.
 * Weak<T> structs also have int32_t _weakcount as their second field.
 * tsc_arc_alloc sets _refcount = 1; all other fields are zero-initialized.
 * ------------------------------------------------------------------------- */
static inline void *_tsc_arc_alloc(size_t sz) {
    int32_t *p = (int32_t *)calloc(1, sz);
    if (p) p[0] = 1;
    return (void *)p;
}
#define tsc_arc_alloc(sz) _tsc_arc_alloc(sz)
#define tsc_arc_retain(ptr) ((ptr)->_refcount++, (ptr))
#define tsc_arc_release(ptr) do { if (--(ptr)->_refcount <= 0) free(ptr); } while(0)
#define tsc_weak_create(ptr) ((ptr)->_weakcount++, (ptr))
#define tsc_weak_upgrade(ptr) ((ptr)->_refcount > 0 ? ((ptr)->_refcount++, (ptr)) : NULL)
#define tsc_weak_release(ptr) do { --(ptr)->_weakcount; } while(0)

/* Optional byte (for string.at()) */
typedef struct { bool has_value; uint8_t value; } opt_u8;

/* string.at(idx): negative indices count from end; returns opt_u8 */
static inline opt_u8 tsc_string_at(String s, int32_t idx) {
    int32_t len = (int32_t)s.length;
    if (idx < 0) idx += len;
    if (idx < 0 || idx >= len) return (opt_u8){ false, 0 };
    return (opt_u8){ true, (uint8_t)(unsigned char)s.data[idx] };
}

/* -------------------------------------------------------------------------
 * TscMap — simple array-backed string→value map (up to 64 entries)
 * ------------------------------------------------------------------------- */
#define TSC_MAP_CAP 64

#define TSC_MAP_DECL(K, V, SUFFIX) \
typedef struct { K _keys[TSC_MAP_CAP]; V _vals[TSC_MAP_CAP]; size_t size; } TscMap_##SUFFIX; \
static inline TscMap_##SUFFIX tsc_map_create_##SUFFIX(void) { \
    TscMap_##SUFFIX m; m.size = 0; return m; } \
static inline void tsc_map_set_##SUFFIX(TscMap_##SUFFIX *m, K key, V val) { \
    for (size_t _i = 0; _i < m->size; _i++) { \
        if (m->_keys[_i].length == key.length && memcmp(m->_keys[_i].data, key.data, key.length) == 0) { \
            m->_vals[_i] = val; return; } } \
    if (m->size < TSC_MAP_CAP) { m->_keys[m->size] = key; m->_vals[m->size] = val; m->size++; } } \
static inline bool tsc_map_has_##SUFFIX(const TscMap_##SUFFIX *m, K key) { \
    for (size_t _i = 0; _i < m->size; _i++) { \
        if (m->_keys[_i].length == key.length && memcmp(m->_keys[_i].data, key.data, key.length) == 0) \
            return true; } \
    return false; } \
static inline void tsc_map_delete_impl_##SUFFIX(TscMap_##SUFFIX *m, K key) { \
    for (size_t _i = 0; _i < m->size; _i++) { \
        if (m->_keys[_i].length == key.length && memcmp(m->_keys[_i].data, key.data, key.length) == 0) { \
            memmove(&m->_keys[_i], &m->_keys[_i+1], (m->size-_i-1)*sizeof(K)); \
            memmove(&m->_vals[_i], &m->_vals[_i+1], (m->size-_i-1)*sizeof(V)); \
            m->size--; return; } } } \
static inline void tsc_map_clear_##SUFFIX(TscMap_##SUFFIX *m) { m->size = 0; }

/* get returns opt_V — expanded at call site where opt_V is already typedef'd */
#define tsc_map_get_string_i32(_m_, _key_) ({ \
    const TscMap_string_i32 *_mm_ = (_m_); \
    String _kk_ = (_key_); \
    int32_t _vv_ = 0; bool _ff_ = false; \
    for (size_t _ii_ = 0; _ii_ < _mm_->size; _ii_++) { \
        if (_mm_->_keys[_ii_].length == _kk_.length && \
            memcmp(_mm_->_keys[_ii_].data, _kk_.data, _kk_.length) == 0) \
            { _vv_ = _mm_->_vals[_ii_]; _ff_ = true; break; } \
    } \
    (opt_i32){ _ff_, _vv_ }; \
})

/* delete returns opt_V (the removed value, or nothing if key absent) */
#define tsc_map_delete_string_i32(_m_, _key_) ({ \
    TscMap_string_i32 *_mm_ = (_m_); \
    String _kk_ = (_key_); \
    int32_t _vv_ = 0; bool _ff_ = false; \
    for (size_t _ii_ = 0; _ii_ < _mm_->size; _ii_++) { \
        if (_mm_->_keys[_ii_].length == _kk_.length && \
            memcmp(_mm_->_keys[_ii_].data, _kk_.data, _kk_.length) == 0) { \
            _vv_ = _mm_->_vals[_ii_]; _ff_ = true; \
            memmove(&_mm_->_keys[_ii_], &_mm_->_keys[_ii_+1], (_mm_->size-_ii_-1)*sizeof(String)); \
            memmove(&_mm_->_vals[_ii_], &_mm_->_vals[_ii_+1], (_mm_->size-_ii_-1)*sizeof(int32_t)); \
            _mm_->size--; break; } } \
    (opt_i32){ _ff_, _vv_ }; \
})

TSC_MAP_DECL(String, int32_t, string_i32)

/* free is a no-op for flat-array maps (no heap allocation) */
#define tsc_map_free_string_i32(m) ((void)(m))

/* -------------------------------------------------------------------------
 * TscSet — simple array-backed set (up to 64 entries)
 * ------------------------------------------------------------------------- */
#define TSC_SET_CAP 64

/* Primitive-type set: element comparison via == */
#define TSC_SET_DECL_PRIM(T, SUFFIX) \
typedef struct { T _vals[TSC_SET_CAP]; size_t size; } TscSet_##SUFFIX; \
static inline TscSet_##SUFFIX tsc_set_create_##SUFFIX(void) { \
    TscSet_##SUFFIX _s; _s.size = 0; return _s; } \
static inline void tsc_set_add_##SUFFIX(TscSet_##SUFFIX *_s, T val) { \
    for (size_t _i = 0; _i < _s->size; _i++) if (_s->_vals[_i] == val) return; \
    if (_s->size < TSC_SET_CAP) _s->_vals[_s->size++] = val; } \
static inline bool tsc_set_has_##SUFFIX(const TscSet_##SUFFIX *_s, T val) { \
    for (size_t _i = 0; _i < _s->size; _i++) if (_s->_vals[_i] == val) return true; \
    return false; } \
static inline bool tsc_set_delete_##SUFFIX(TscSet_##SUFFIX *_s, T val) { \
    for (size_t _i = 0; _i < _s->size; _i++) { \
        if (_s->_vals[_i] == val) { \
            memmove(&_s->_vals[_i], &_s->_vals[_i+1], (_s->size-_i-1)*sizeof(T)); \
            _s->size--; return true; } } \
    return false; } \
static inline void tsc_set_clear_##SUFFIX(TscSet_##SUFFIX *_s) { _s->size = 0; }

TSC_SET_DECL_PRIM(int8_t,   i8)
TSC_SET_DECL_PRIM(int16_t,  i16)
TSC_SET_DECL_PRIM(int32_t,  i32)
TSC_SET_DECL_PRIM(int64_t,  i64)
TSC_SET_DECL_PRIM(uint8_t,  u8)
TSC_SET_DECL_PRIM(uint16_t, u16)
TSC_SET_DECL_PRIM(uint32_t, u32)
TSC_SET_DECL_PRIM(uint64_t, u64)
TSC_SET_DECL_PRIM(float,    f32)
TSC_SET_DECL_PRIM(double,   f64)
TSC_SET_DECL_PRIM(bool,     bool)

/* String set: element comparison via memcmp */
typedef struct { String _vals[TSC_SET_CAP]; size_t size; } TscSet_string;
static inline TscSet_string tsc_set_create_string(void) {
    TscSet_string _s; _s.size = 0; return _s; }
static inline void tsc_set_add_string(TscSet_string *_s, String val) {
    for (size_t _i = 0; _i < _s->size; _i++)
        if (_s->_vals[_i].length == val.length && memcmp(_s->_vals[_i].data, val.data, val.length) == 0) return;
    if (_s->size < TSC_SET_CAP) _s->_vals[_s->size++] = val; }
static inline bool tsc_set_has_string(const TscSet_string *_s, String val) {
    for (size_t _i = 0; _i < _s->size; _i++)
        if (_s->_vals[_i].length == val.length && memcmp(_s->_vals[_i].data, val.data, val.length) == 0) return true;
    return false; }
static inline bool tsc_set_delete_string(TscSet_string *_s, String val) {
    for (size_t _i = 0; _i < _s->size; _i++) {
        if (_s->_vals[_i].length == val.length && memcmp(_s->_vals[_i].data, val.data, val.length) == 0) {
            memmove(&_s->_vals[_i], &_s->_vals[_i+1], (_s->size-_i-1)*sizeof(String));
            _s->size--; return true; } }
    return false; }
static inline void tsc_set_clear_string(TscSet_string *_s) { _s->size = 0; }

/* cc65 does not support _Noreturn; guard for NES target */
#ifdef TSC_NES
#define _Noreturn
#endif

/* tsc_throw — used for 'throw new Error(msg)' in _Noreturn functions */
#include <stdlib.h>
_Noreturn static inline void tsc_throw(String msg) {
    fprintf(stderr, "Error: %.*s\n", (int)msg.length, msg.data);
    exit(1);
}

/* tsc_panic — used for '!' non-null assertion failure in non-throws context */
_Noreturn static inline void tsc_panic(String msg) {
    fprintf(stderr, "panic: %.*s\n", (int)msg.length, msg.data);
    exit(1);
}

/* tsc_capture_stack — capture call stack as string (stub for desktop) */
static inline String tsc_capture_stack(void) {
    static const char _tsc_stack_stub[] = "(stack trace not available)";
    return (String){ .data = _tsc_stack_stub, .length = sizeof(_tsc_stack_stub) - 1, .capacity = 0 };
}

/* Numeric-to-string conversions (used by optional chaining x?.toString()) */
static inline String tsc_i32_to_string(int32_t v) {
    static char _tsc_i32_buf[32];
#ifndef TSC_NES
    int n = snprintf(_tsc_i32_buf, sizeof(_tsc_i32_buf), "%d", v);
    return (String){ .data = _tsc_i32_buf, .length = (size_t)(n > 0 ? n : 0), .capacity = 0 };
#else
    sprintf(_tsc_i32_buf, "%ld", (long)v);
    return STR_LIT_RUNTIME(_tsc_i32_buf);
#endif
}
static inline String tsc_i64_to_string(int64_t v) {
    static char _tsc_i64_buf[32];
#ifndef TSC_NES
    int n = snprintf(_tsc_i64_buf, sizeof(_tsc_i64_buf), "%lld", (long long)v);
    return (String){ .data = _tsc_i64_buf, .length = (size_t)(n > 0 ? n : 0), .capacity = 0 };
#else
    sprintf(_tsc_i64_buf, "%ld", (long)v);
    return STR_LIT_RUNTIME(_tsc_i64_buf);
#endif
}
static inline String tsc_f64_to_string(double v) {
    static char _tsc_f64_buf[64];
#ifndef TSC_NES
    int n = snprintf(_tsc_f64_buf, sizeof(_tsc_f64_buf), "%g", v);
    return (String){ .data = _tsc_f64_buf, .length = (size_t)(n > 0 ? n : 0), .capacity = 0 };
#else
    sprintf(_tsc_f64_buf, "%g", v);
    return STR_LIT_RUNTIME(_tsc_f64_buf);
#endif
}

/* string.lastIndexOf(sub): returns last position of sub, or -1 */
static inline ptrdiff_t tsc_string_last_index_of(String s, String sub) {
    if (sub.length == 0) return (ptrdiff_t)s.length;
    if (sub.length > s.length) return -1;
    ptrdiff_t last = -1;
    for (size_t i = 0; i <= s.length - sub.length; i++) {
        if (memcmp(s.data + i, sub.data, sub.length) == 0) last = (ptrdiff_t)i;
    }
    return last;
}

/* -------------------------------------------------------------------------
 * String heap allocation / concat / format
 * ------------------------------------------------------------------------- */

/* Free a heap-allocated string (no-op if capacity==0, i.e. string literal) */
static inline void tsc_string_free(String s) {
    if (s.capacity > 0) free((char *)s.data);
}

/* String equality */
static inline bool tsc_string_eq(String a, String b) {
    return a.length == b.length && memcmp(a.data, b.data, a.length) == 0;
}

/* Concatenate two strings → new heap String */
static inline String tsc_string_concat(String a, String b) {
    size_t len = a.length + b.length;
    char *buf = (char *)malloc(len + 1);
    if (a.length) memcpy(buf, a.data, a.length);
    if (b.length) memcpy(buf + a.length, b.data, b.length);
    buf[len] = '\0';
    return (String){ .data = buf, .length = len, .capacity = len + 1 };
}

/* Format string → new heap String (like sprintf) */
static inline String tsc_string_format(const char *fmt, ...) {
#ifndef TSC_NES
    va_list a, b;
    va_start(a, fmt);
    va_copy(b, a);                      /* va_copy: C99, not available on cc65 */
    int n = vsnprintf(NULL, 0, fmt, a); /* vsnprintf: not available on cc65    */
    va_end(a);
    size_t sz = (n > 0) ? (size_t)n : 0;
    char *buf = (char *)malloc(sz + 1);
    vsnprintf(buf, sz + 1, fmt, b);
    va_end(b);
#else
    /* NES: fixed-size static buffer; heap/vsnprintf not available */
    static char _fmt_buf[128];
    va_list a;
    va_start(a, fmt);
    vsprintf(_fmt_buf, fmt, a);         /* vsprintf: available in cc65 stdio.h */
    va_end(a);
    size_t sz = strlen(_fmt_buf);
    char *buf = _fmt_buf; /* no heap — caller must use immediately */
#endif
    return (String){ .data = buf, .length = sz, .capacity = sz + 1 };
}

/* -------------------------------------------------------------------------
 * String query methods (return primitive types — no heap issue)
 * ------------------------------------------------------------------------- */

static inline bool tsc_string_includes(String s, String sub) {
    if (sub.length == 0) return true;
    if (sub.length > s.length) return false;
    for (size_t i = 0; i <= s.length - sub.length; i++)
        if (memcmp(s.data + i, sub.data, sub.length) == 0) return true;
    return false;
}

static inline bool tsc_string_starts_with(String s, String prefix) {
    if (prefix.length > s.length) return false;
    return memcmp(s.data, prefix.data, prefix.length) == 0;
}

static inline bool tsc_string_ends_with(String s, String suffix) {
    if (suffix.length > s.length) return false;
    return memcmp(s.data + s.length - suffix.length, suffix.data, suffix.length) == 0;
}

static inline ptrdiff_t tsc_string_index_of(String s, String sub) {
    if (sub.length == 0) return 0;
    if (sub.length > s.length) return -1;
    for (size_t i = 0; i <= s.length - sub.length; i++)
        if (memcmp(s.data + i, sub.data, sub.length) == 0) return (ptrdiff_t)i;
    return -1;
}

/* -------------------------------------------------------------------------
 * String transform methods (return new heap String)
 * ------------------------------------------------------------------------- */

static inline String tsc_string_slice(String s, int32_t start, int32_t end_idx) {
    int32_t len = (int32_t)s.length;
    if (start < 0) start = len + start; if (start < 0) start = 0;
    if (end_idx < 0) end_idx = len + end_idx; if (end_idx > len) end_idx = len;
    if (start >= end_idx) { char *e = (char*)malloc(1); e[0] = '\0'; return (String){e, 0, 1}; }
    size_t n = (size_t)(end_idx - start);
    char *buf = (char *)malloc(n + 1);
    memcpy(buf, s.data + start, n); buf[n] = '\0';
    return (String){ .data = buf, .length = n, .capacity = n + 1 };
}

static inline String tsc_string_substring(String s, int32_t start, int32_t end_idx) {
    int32_t len = (int32_t)s.length;
    if (start < 0) start = 0; if (end_idx < 0) end_idx = 0;
    if (start > len) start = len; if (end_idx > len) end_idx = len;
    if (start > end_idx) { int32_t t = start; start = end_idx; end_idx = t; }
    return tsc_string_slice(s, start, end_idx);
}

static inline String tsc_string_to_lower(String s) {
    char *buf = (char *)malloc(s.length + 1);
    for (size_t i = 0; i < s.length; i++) buf[i] = (char)tolower((unsigned char)s.data[i]);
    buf[s.length] = '\0';
    return (String){ .data = buf, .length = s.length, .capacity = s.length + 1 };
}

static inline String tsc_string_to_upper(String s) {
    char *buf = (char *)malloc(s.length + 1);
    for (size_t i = 0; i < s.length; i++) buf[i] = (char)toupper((unsigned char)s.data[i]);
    buf[s.length] = '\0';
    return (String){ .data = buf, .length = s.length, .capacity = s.length + 1 };
}

static inline String tsc_string_trim(String s) {
    size_t i = 0, j = s.length;
    while (i < j && isspace((unsigned char)s.data[i])) i++;
    while (j > i && isspace((unsigned char)s.data[j-1])) j--;
    size_t n = j - i;
    char *buf = (char *)malloc(n + 1);
    memcpy(buf, s.data + i, n); buf[n] = '\0';
    return (String){ .data = buf, .length = n, .capacity = n + 1 };
}

static inline String tsc_string_trim_start(String s) {
    size_t i = 0;
    while (i < s.length && isspace((unsigned char)s.data[i])) i++;
    size_t n = s.length - i;
    char *buf = (char *)malloc(n + 1);
    memcpy(buf, s.data + i, n); buf[n] = '\0';
    return (String){ .data = buf, .length = n, .capacity = n + 1 };
}

static inline String tsc_string_trim_end(String s) {
    size_t j = s.length;
    while (j > 0 && isspace((unsigned char)s.data[j-1])) j--;
    char *buf = (char *)malloc(j + 1);
    memcpy(buf, s.data, j); buf[j] = '\0';
    return (String){ .data = buf, .length = j, .capacity = j + 1 };
}

static inline String tsc_string_pad_start(String s, int32_t target_len, String fill) {
    if ((int32_t)s.length >= target_len) {
        char *b = (char*)malloc(s.length + 1); memcpy(b, s.data, s.length); b[s.length] = '\0';
        return (String){ b, s.length, s.length + 1 };
    }
    size_t pad = (size_t)(target_len - (int32_t)s.length);
    size_t total = (size_t)target_len;
    char *buf = (char *)malloc(total + 1);
    for (size_t i = 0; i < pad; i++) buf[i] = fill.length > 0 ? fill.data[i % fill.length] : ' ';
    memcpy(buf + pad, s.data, s.length); buf[total] = '\0';
    return (String){ .data = buf, .length = total, .capacity = total + 1 };
}

static inline String tsc_string_pad_end(String s, int32_t target_len, String fill) {
    if ((int32_t)s.length >= target_len) {
        char *b = (char*)malloc(s.length + 1); memcpy(b, s.data, s.length); b[s.length] = '\0';
        return (String){ b, s.length, s.length + 1 };
    }
    size_t total = (size_t)target_len;
    char *buf = (char *)malloc(total + 1);
    memcpy(buf, s.data, s.length);
    for (size_t i = s.length; i < total; i++) buf[i] = fill.length > 0 ? fill.data[(i - s.length) % fill.length] : ' ';
    buf[total] = '\0';
    return (String){ .data = buf, .length = total, .capacity = total + 1 };
}

static inline String tsc_string_replace(String s, String from, String to) {
    ptrdiff_t pos = tsc_string_index_of(s, from);
    if (pos < 0 || from.length == 0) {
        char *b = (char*)malloc(s.length + 1); memcpy(b, s.data, s.length); b[s.length] = '\0';
        return (String){ b, s.length, s.length + 1 };
    }
    size_t n = s.length - from.length + to.length;
    char *buf = (char *)malloc(n + 1);
    memcpy(buf, s.data, (size_t)pos);
    memcpy(buf + pos, to.data, to.length);
    size_t after = (size_t)pos + from.length;
    memcpy(buf + pos + to.length, s.data + after, s.length - after);
    buf[n] = '\0';
    return (String){ .data = buf, .length = n, .capacity = n + 1 };
}

static inline String tsc_string_replace_all(String s, String from, String to) {
    if (from.length == 0) {
        char *b = (char*)malloc(s.length + 1); memcpy(b, s.data, s.length); b[s.length] = '\0';
        return (String){ b, s.length, s.length + 1 };
    }
    /* Count occurrences */
    size_t count = 0;
    for (size_t i = 0; i + from.length <= s.length; ) {
        if (memcmp(s.data + i, from.data, from.length) == 0) { count++; i += from.length; }
        else i++;
    }
    size_t n = s.length + count * (to.length - from.length);
    char *buf = (char *)malloc(n + 1);
    size_t dst = 0;
    for (size_t i = 0; i < s.length; ) {
        if (i + from.length <= s.length && memcmp(s.data + i, from.data, from.length) == 0) {
            memcpy(buf + dst, to.data, to.length); dst += to.length; i += from.length;
        } else { buf[dst++] = s.data[i++]; }
    }
    buf[n] = '\0';
    return (String){ .data = buf, .length = n, .capacity = n + 1 };
}

static inline String tsc_string_char_at(String s, int32_t idx) {
    if (idx < 0 || (size_t)idx >= s.length) { char *b = (char*)malloc(1); b[0] = '\0'; return (String){b, 0, 1}; }
    char *buf = (char *)malloc(2);
    buf[0] = s.data[idx]; buf[1] = '\0';
    return (String){ .data = buf, .length = 1, .capacity = 2 };
}

static inline String tsc_string_repeat(String s, int32_t n) {
    if (n <= 0 || s.length == 0) { char *b = (char*)malloc(1); b[0] = '\0'; return (String){b, 0, 1}; }
    size_t total = s.length * (size_t)n;
    char *buf = (char *)malloc(total + 1);
    for (int32_t i = 0; i < n; i++) memcpy(buf + (size_t)i * s.length, s.data, s.length);
    buf[total] = '\0';
    return (String){ .data = buf, .length = total, .capacity = total + 1 };
}

/* tsc_string_split: split s by sep, write pointers to *out_parts, count to *out_len */
static inline void tsc_string_split(String s, String sep, String **out_parts, int32_t *out_len) {
    /* Count splits */
    int32_t cnt = 1;
    if (sep.length > 0) {
        for (size_t i = 0; i + sep.length <= s.length; ) {
            if (memcmp(s.data + i, sep.data, sep.length) == 0) { cnt++; i += sep.length; }
            else i++;
        }
    }
    String *parts = (String *)malloc((size_t)cnt * sizeof(String));
    int32_t pi = 0; size_t start = 0;
    if (sep.length == 0) { parts[0] = s; *out_parts = parts; *out_len = 1; return; }
    for (size_t i = 0; i <= s.length; ) {
        if (i == s.length || (i + sep.length <= s.length && memcmp(s.data + i, sep.data, sep.length) == 0)) {
            size_t n = i - start;
            char *buf = (char *)malloc(n + 1); memcpy(buf, s.data + start, n); buf[n] = '\0';
            parts[pi++] = (String){ .data = buf, .length = n, .capacity = n + 1 };
            start = i + sep.length;
            if (i == s.length) break;
            i += sep.length;
        } else i++;
    }
    *out_parts = parts; *out_len = cnt;
}

/* Free array of strings from tsc_string_split */
static inline void tsc_string_array_free(String *parts, int32_t len) {
    for (int32_t i = 0; i < len; i++) tsc_string_free(parts[i]);
    free(parts);
}

/* JSON stringify: wraps a String value in double-quotes with basic escaping */
static inline String tsc_json_stringify_string(String s) {
    size_t cap = s.length * 2 + 3;
    char *buf = (char *)malloc(cap);
    size_t pos = 0;
    buf[pos++] = '"';
    for (size_t i = 0; i < (size_t)s.length; i++) {
        unsigned char c = (unsigned char)s.data[i];
        if      (c == '"')  { buf[pos++] = '\\'; buf[pos++] = '"'; }
        else if (c == '\\') { buf[pos++] = '\\'; buf[pos++] = '\\'; }
        else if (c == '\n') { buf[pos++] = '\\'; buf[pos++] = 'n'; }
        else if (c == '\r') { buf[pos++] = '\\'; buf[pos++] = 'r'; }
        else if (c == '\t') { buf[pos++] = '\\'; buf[pos++] = 't'; }
        else                { buf[pos++] = (char)c; }
    }
    buf[pos++] = '"';
    buf[pos] = '\0';
    return (String){ .data = buf, .length = (int32_t)pos, .capacity = (int32_t)cap };
}

/* -------------------------------------------------------------------------
 * Parse functions
 * Non-opt versions are regular static inline functions.
 * Opt-returning versions are GCC statement-expression macros because
 * opt_T types are typedef'd AFTER #include "runtime.h" in generated files.
 *
 * All parse functions support 0x (hex), 0b (binary), 0o (octal) prefixes
 * in addition to plain decimal / float notation.
 * ------------------------------------------------------------------------- */

/* Helper: parse integer from null-terminated string with 0x/0b/0o prefix support.
 * Returns 1 on success, 0 on failure. Result written to *out. */
static inline int _tsc_parse_prefixed_i64(const char *b, int64_t *out) {
    if (b[0] == '0' && (b[1] == 'x' || b[1] == 'X')) {
        char *e; long long v = strtoll(b, &e, 16);
        if (e == b || *e != '\0') return 0;
        *out = (int64_t)v; return 1;
    }
    if (b[0] == '0' && (b[1] == 'b' || b[1] == 'B')) {
        if (b[2] == '\0') return 0;
        const char *s = b + 2; char *e; long long v = strtoll(s, &e, 2);
        if (e == s || *e != '\0') return 0;
        *out = (int64_t)v; return 1;
    }
    if (b[0] == '0' && (b[1] == 'o' || b[1] == 'O')) {
        if (b[2] == '\0') return 0;
        const char *s = b + 2; char *e; long long v = strtoll(s, &e, 8);
        if (e == s || *e != '\0') return 0;
        *out = (int64_t)v; return 1;
    }
    /* decimal: allow float-like input (parseInt("3.14") → 3), truncate fraction */
    char *e; double dv = strtod(b, &e);
    if (e == b) return 0;
    *out = (int64_t)dv; return 1;
}

/* Helper: parse double from null-terminated string with 0x/0b/0o prefix support.
 * Returns 1 on success, 0 on failure. Result written to *out. */
static inline int _tsc_parse_prefixed_f64(const char *b, double *out) {
    if (b[0] == '0' && (b[1] == 'x' || b[1] == 'X')) {
        char *e; long long v = strtoll(b, &e, 16);
        if (e == b || *e != '\0') return 0;
        *out = (double)v; return 1;
    }
    if (b[0] == '0' && (b[1] == 'b' || b[1] == 'B')) {
        if (b[2] == '\0') return 0;
        const char *s = b + 2; char *e; long long v = strtoll(s, &e, 2);
        if (e == s || *e != '\0') return 0;
        *out = (double)v; return 1;
    }
    if (b[0] == '0' && (b[1] == 'o' || b[1] == 'O')) {
        if (b[2] == '\0') return 0;
        const char *s = b + 2; char *e; long long v = strtoll(s, &e, 8);
        if (e == s || *e != '\0') return 0;
        *out = (double)v; return 1;
    }
    char *e; double v = strtod(b, &e);
    if (e == b) return 0;
    *out = v; return 1;
}

static inline int32_t tsc_i32_parse(String s) {
    char buf[64]; size_t n = s.length < 63 ? s.length : 63;
    memcpy(buf, s.data, n); buf[n] = '\0';
    int64_t v = 0;
    if (!_tsc_parse_prefixed_i64(buf, &v)) {
        fprintf(stderr, "Parse error: '%s' is not a valid integer\n", buf); exit(1);
    }
    return (int32_t)v;
}

static inline double tsc_parse_f64(String s) {
    char buf[64]; size_t n = s.length < 63 ? s.length : 63;
    memcpy(buf, s.data, n); buf[n] = '\0';
    double v = 0;
    if (!_tsc_parse_prefixed_f64(buf, &v)) {
        fprintf(stderr, "Parse error: '%s' is not a valid number\n", buf); exit(1);
    }
    return v;
}

/* opt_T parse: macros so they can reference opt_i32/opt_f64 at call site */
#define tsc_i32_try_parse(s) ({ \
    String _s_ = (s); char _b_[64]; \
    size_t _n_ = _s_.length < 63 ? _s_.length : 63; \
    memcpy(_b_, _s_.data, _n_); _b_[_n_] = '\0'; \
    int64_t _v_ = 0; int _ok_ = _tsc_parse_prefixed_i64(_b_, &_v_); \
    (opt_i32){ .has_value = _ok_, .value = (int32_t)_v_ }; \
})
#define tsc_try_parse_i32(s) tsc_i32_try_parse(s)

#define tsc_parse_int(s) ({ \
    String _s_ = (s); char _b_[64]; \
    size_t _n_ = _s_.length < 63 ? _s_.length : 63; \
    memcpy(_b_, _s_.data, _n_); _b_[_n_] = '\0'; \
    int64_t _v_ = 0; int _ok_ = _tsc_parse_prefixed_i64(_b_, &_v_); \
    (opt_i32){ .has_value = _ok_, .value = (int32_t)_v_ }; \
})

#define tsc_try_parse_f64(s) ({ \
    String _s_ = (s); char _b_[64]; \
    size_t _n_ = _s_.length < 63 ? _s_.length : 63; \
    memcpy(_b_, _s_.data, _n_); _b_[_n_] = '\0'; \
    double _v_ = 0; int _ok_ = _tsc_parse_prefixed_f64(_b_, &_v_); \
    (opt_f64){ .has_value = _ok_, .value = _v_ }; \
})
#define tsc_parse_float(s) tsc_try_parse_f64(s)

/* -------------------------------------------------------------------------
 * process.argv support
 * ------------------------------------------------------------------------- */
typedef struct { String  *data; size_t length; size_t capacity; } Array_string;
typedef struct { uint8_t *data; size_t length; size_t capacity; } Array_u8;

typedef struct { bool has_value; String value; } opt_String;

/* process.env.get(key) → opt_String  (key must be null-terminated — string literals are) */
static inline opt_String tsc_env_get(String key) {
    const char *v = getenv(key.data);
    if (!v) return (opt_String){false, {NULL, 0, 0}};
    return (opt_String){true, {(char *)v, strlen(v), 0}};
}
static inline bool tsc_env_has(String key) { return getenv(key.data) != NULL; }

static inline Array_string tsc_make_argv(int argc, char **argv) {
    size_t n = (size_t)(argc > 0 ? argc : 0);
    String *data = (String *)malloc(n * sizeof(String));
    for (size_t i = 0; i < n; i++) {
        data[i].data = argv[i];
        data[i].length = strlen(argv[i]);
        data[i].capacity = 0;
    }
    return (Array_string){ .data = data, .length = n, .capacity = n };
}

/* -------------------------------------------------------------------------
 * Array functions — GCC statement-expression macros so they can reference
 * Array_T and opt_T types defined AFTER #include "runtime.h".
 * -------------------------------------------------------------------------
 */

/* Default comparator for qsort (ascending) */
static int _tsc_cmp_i32_asc(const void *a, const void *b) {
    int32_t x = *(const int32_t*)a, y = *(const int32_t*)b;
    return (x > y) - (x < y);
}
static int32_t (*_tsc_cmp_i32_user)(int32_t, int32_t) = NULL;
static int _tsc_cmp_i32_user_adapter(const void *a, const void *b) {
    return (int)_tsc_cmp_i32_user(*(const int32_t*)a, *(const int32_t*)b);
}

#define tsc_array_create_i32(cap) ({ \
    size_t _c_ = (size_t)(cap); \
    int32_t *_d_ = (int32_t*)malloc(_c_ * sizeof(int32_t)); \
    (Array_i32){ .data = _d_, .length = 0, .capacity = _c_ }; \
})

#define tsc_array_free_i32(arr) do { \
    Array_i32 *_a_ = (arr); \
    if (_a_->data) free(_a_->data); \
    _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; \
} while(0)

#define tsc_array_push_i32(arr, val) do { \
    Array_i32 *_a_ = (arr); int32_t _v_ = (val); \
    if (_a_->length >= _a_->capacity) { \
        size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; \
        _a_->data = (int32_t*)realloc(_a_->data, _nc_ * sizeof(int32_t)); \
        _a_->capacity = _nc_; \
    } \
    _a_->data[_a_->length++] = _v_; \
} while(0)

#define tsc_array_pop_i32(arr) ({ \
    Array_i32 *_a_ = (arr); \
    opt_i32 _r_ = {false, 0}; \
    if (_a_->length > 0) { _r_ = (opt_i32){true, _a_->data[--_a_->length]}; } \
    _r_; \
})

#define tsc_array_get_checked_i32(arr, idx) ({ \
    Array_i32 _a_ = (arr); int32_t _i_ = (idx); \
    if (_i_ < 0 || (size_t)_i_ >= _a_.length) { \
        fprintf(stderr, "Array index %d out of bounds (length %zu)\n", _i_, _a_.length); exit(1); } \
    _a_.data[_i_]; \
})

#define tsc_array_concat_i32(a, b) ({ \
    Array_i32 _a_ = (a), _b_ = (b); \
    size_t _n_ = _a_.length + _b_.length; \
    int32_t *_d_ = (int32_t*)malloc(_n_ * sizeof(int32_t)); \
    memcpy(_d_, _a_.data, _a_.length * sizeof(int32_t)); \
    memcpy(_d_ + _a_.length, _b_.data, _b_.length * sizeof(int32_t)); \
    (Array_i32){ .data = _d_, .length = _n_, .capacity = _n_ }; \
})

#define tsc_array_slice_i32(arr, start, end_idx) ({ \
    Array_i32 _a_ = (arr); int32_t _s_ = (start), _e_ = (end_idx); \
    if (_s_ < 0) _s_ = 0; if (_e_ > (int32_t)_a_.length) _e_ = (int32_t)_a_.length; \
    size_t _n_ = (_s_ < _e_) ? (size_t)(_e_ - _s_) : 0; \
    int32_t *_d_ = (int32_t*)malloc(_n_ * sizeof(int32_t)); \
    if (_n_) memcpy(_d_, _a_.data + _s_, _n_ * sizeof(int32_t)); \
    (Array_i32){ .data = _d_, .length = _n_, .capacity = _n_ }; \
})

#define tsc_array_fill_i32(arr, val, start, end_idx) do { \
    Array_i32 *_a_ = (arr); int32_t _v_ = (val), _s_ = (start), _e_ = (end_idx); \
    if (_s_ < 0) _s_ = 0; if (_e_ > (int32_t)_a_->length) _e_ = (int32_t)_a_->length; \
    for (int32_t _i_ = _s_; _i_ < _e_; _i_++) _a_->data[_i_] = _v_; \
} while(0)

#define tsc_array_reverse_i32(arr) do { \
    Array_i32 *_a_ = (arr); \
    for (size_t _l_ = 0, _r_ = _a_->length; _l_ < _r_; ) { \
        _r_--; int32_t _t_ = _a_->data[_l_]; _a_->data[_l_++] = _a_->data[_r_]; _a_->data[_r_] = _t_; \
    } \
} while(0)

#define tsc_array_sort_i32(arr, cmp) do { \
    Array_i32 *_a_ = (arr); \
    if ((cmp) == NULL) { qsort(_a_->data, _a_->length, sizeof(int32_t), _tsc_cmp_i32_asc); } \
    else { _tsc_cmp_i32_user = (cmp); qsort(_a_->data, _a_->length, sizeof(int32_t), _tsc_cmp_i32_user_adapter); } \
} while(0)

#define tsc_array_includes_i32(arr, val) ({ \
    Array_i32 _a_ = (arr); int32_t _v_ = (val); bool _f_ = false; \
    for (size_t _i_ = 0; _i_ < _a_.length && !_f_; _i_++) if (_a_.data[_i_] == _v_) _f_ = true; \
    _f_; \
})

#define tsc_array_index_of_i32(arr, val) ({ \
    Array_i32 _a_ = (arr); int32_t _v_ = (val); ptrdiff_t _r_ = -1; \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) if (_a_.data[_i_] == _v_) { _r_ = (ptrdiff_t)_i_; break; } \
    _r_; \
})

#define tsc_array_find_i32(arr, pred) ({ \
    Array_i32 _a_ = (arr); \
    opt_ref_i32 _r_ = {false, NULL}; \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) \
        if ((pred)(_a_.data[_i_])) { _r_ = (opt_ref_i32){true, &_a_.data[_i_]}; break; } \
    _r_; \
})

#define tsc_array_find_index_i32(arr, pred) ({ \
    Array_i32 _a_ = (arr); ptrdiff_t _r_ = -1; \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) \
        if ((pred)(_a_.data[_i_])) { _r_ = (ptrdiff_t)_i_; break; } \
    _r_; \
})

#define tsc_array_every_i32(arr, pred) ({ \
    Array_i32 _a_ = (arr); bool _r_ = true; \
    for (size_t _i_ = 0; _i_ < _a_.length && _r_; _i_++) if (!(pred)(_a_.data[_i_])) _r_ = false; \
    _r_; \
})

#define tsc_array_some_i32(arr, pred) ({ \
    Array_i32 _a_ = (arr); bool _r_ = false; \
    for (size_t _i_ = 0; _i_ < _a_.length && !_r_; _i_++) if ((pred)(_a_.data[_i_])) _r_ = true; \
    _r_; \
})

#define tsc_array_filter_i32(arr, pred) ({ \
    Array_i32 _a_ = (arr); \
    Array_i32 _r_ = {NULL, 0, 0}; \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) { \
        if ((pred)(_a_.data[_i_])) { \
            if (_r_.length >= _r_.capacity) { \
                size_t _nc_ = _r_.capacity == 0 ? 8 : _r_.capacity * 2; \
                _r_.data = (int32_t*)realloc(_r_.data, _nc_ * sizeof(int32_t)); _r_.capacity = _nc_; \
            } \
            _r_.data[_r_.length++] = _a_.data[_i_]; \
        } \
    } \
    _r_; \
})

#define tsc_array_map_i32_i32(arr, fn) ({ \
    Array_i32 _a_ = (arr); \
    int32_t *_d_ = (int32_t*)malloc(_a_.length * sizeof(int32_t)); \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _d_[_i_] = (fn)(_a_.data[_i_]); \
    (Array_i32){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \
})

#define tsc_array_reduce_i32_i32(arr, fn, init) ({ \
    Array_i32 _a_ = (arr); int32_t _acc_ = (init); \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _acc_ = (fn)(_acc_, _a_.data[_i_]); \
    _acc_; \
})

#define tsc_array_remove_i32(arr, idx) ({ \
    Array_i32 *_a_ = (arr); size_t _i_ = (size_t)(idx); \
    int32_t _v_ = _a_->data[_i_]; \
    memmove(_a_->data + _i_, _a_->data + _i_ + 1, (_a_->length - _i_ - 1) * sizeof(int32_t)); \
    _a_->length--; _v_; \
})

#define tsc_array_resize_i32(arr, new_len, def_val) do { \
    Array_i32 *_a_ = (arr); size_t _nl_ = (size_t)(new_len); int32_t _dv_ = (def_val); \
    if (_nl_ > _a_->capacity) { \
        int32_t *_nd_ = (int32_t*)malloc(_nl_ * sizeof(int32_t)); \
        if (_a_->length > 0) memcpy(_nd_, _a_->data, _a_->length * sizeof(int32_t)); \
        for (size_t _i_ = _a_->length; _i_ < _nl_; _i_++) _nd_[_i_] = _dv_; \
        _a_->data = _nd_; _a_->capacity = _nl_; \
    } else if (_nl_ > _a_->length) { \
        for (size_t _i_ = _a_->length; _i_ < _nl_; _i_++) _a_->data[_i_] = _dv_; \
    } \
    _a_->length = _nl_; \
} while(0)

#define tsc_array_reallocate_i32(arr, new_cap) do { \
    Array_i32 *_a_ = (arr); size_t _nc_ = (size_t)(new_cap); \
    int32_t *_nd_ = (int32_t*)malloc(_nc_ * sizeof(int32_t)); \
    size_t _cp_ = _a_->length < _nc_ ? _a_->length : _nc_; \
    if (_cp_ > 0) memcpy(_nd_, _a_->data, _cp_ * sizeof(int32_t)); \
    _a_->data = _nd_; _a_->capacity = _nc_; \
    if (_a_->length > _nc_) _a_->length = _nc_; \
} while(0)


/* keys: returns Array_string of all keys (heap-allocated copy) */
#define tsc_map_keys_string_i32(_m_) ({ \
    const TscMap_string_i32 *_mk_ = (_m_); \
    String *_dk_ = (String*)malloc(_mk_->size * sizeof(String)); \
    memcpy(_dk_, _mk_->_keys, _mk_->size * sizeof(String)); \
    (Array_string){ .data = _dk_, .length = _mk_->size, .capacity = _mk_->size }; \
})

/* entries: returns Array_MapEntry_string_i32 (heap-allocated copy) */
#define tsc_map_entries_string_i32(_m_) ({ \
    const TscMap_string_i32 *_me_ = (_m_); \
    MapEntry_string_i32 *_de_ = (MapEntry_string_i32*)malloc(_me_->size * sizeof(MapEntry_string_i32)); \
    for (size_t _i_ = 0; _i_ < _me_->size; _i_++) { _de_[_i_].key = _me_->_keys[_i_]; _de_[_i_].value = _me_->_vals[_i_]; } \
    (Array_MapEntry_string_i32){ .data = _de_, .length = _me_->size, .capacity = _me_->size }; \
})

// StaticMap: fixed-capacity map backed by parallel arrays (no heap)
// Generated inline in .c output; these macros implement the operations.
#define TSC_STATICMAP_IMPL(K, V, SUFFIX) \
static inline void tsc_staticmap_set_##SUFFIX(void *_sm, K key, V val) { \
    typedef struct { K keys[1]; V values[1]; bool used[1]; size_t capacity; size_t count; } _SM_##SUFFIX; \
    _SM_##SUFFIX *m = (_SM_##SUFFIX*)_sm; \
    for (size_t _i = 0; _i < m->capacity; _i++) { \
        if (m->used[_i] && m->keys[_i] == key) { m->values[_i] = val; return; } \
    } \
    for (size_t _i = 0; _i < m->capacity; _i++) { \
        if (!m->used[_i]) { m->keys[_i] = key; m->values[_i] = val; m->used[_i] = true; m->count++; return; } \
    } \
} \
static inline bool tsc_staticmap_has_##SUFFIX(void *_sm, K key) { \
    typedef struct { K keys[1]; V values[1]; bool used[1]; size_t capacity; size_t count; } _SM2_##SUFFIX; \
    _SM2_##SUFFIX *m = (_SM2_##SUFFIX*)_sm; \
    for (size_t _i = 0; _i < m->capacity; _i++) { \
        if (m->used[_i] && m->keys[_i] == key) return true; \
    } \
    return false; \
} \
static inline void tsc_staticmap_delete_##SUFFIX(void *_sm, K key) { \
    typedef struct { K keys[1]; V values[1]; bool used[1]; size_t capacity; size_t count; } _SM3_##SUFFIX; \
    _SM3_##SUFFIX *m = (_SM3_##SUFFIX*)_sm; \
    for (size_t _i = 0; _i < m->capacity; _i++) { \
        if (m->used[_i] && m->keys[_i] == key) { m->used[_i] = false; m->count--; return; } \
    } \
} \
static inline void tsc_staticmap_clear_##SUFFIX(void *_sm) { \
    typedef struct { K keys[1]; V values[1]; bool used[1]; size_t capacity; size_t count; } _SM4_##SUFFIX; \
    _SM4_##SUFFIX *m = (_SM4_##SUFFIX*)_sm; \
    for (size_t _i = 0; _i < m->capacity; _i++) m->used[_i] = false; \
    m->count = 0; \
}

// get is handled via statement expression to return optional
#define tsc_staticmap_get_u8_i32(_sm, _key) ({ \
    StaticMap_u8_i32 *_m = (StaticMap_u8_i32*)(_sm); \
    opt_i32 _r = {false, 0}; \
    for (size_t _i = 0; _i < _m->capacity; _i++) { \
        if (_m->used[_i] && _m->keys[_i] == (_key)) { _r = (opt_i32){true, _m->values[_i]}; break; } \
    } \
    _r; \
})

/* -------------------------------------------------------------------------
 * UTF-8 codepoint iteration
 * ------------------------------------------------------------------------- */
typedef struct { const char *_p; size_t _rem; } TscCodePointIter;

static inline TscCodePointIter tsc_codepoints(String s) {
    return (TscCodePointIter){ ._p = s.data, ._rem = s.length };
}

static inline bool tsc_codepoints_next(TscCodePointIter *it, uint32_t *out) {
    if (it->_rem == 0) return false;
    unsigned char c = (unsigned char)*it->_p;
    uint32_t cp; size_t bytes;
    if      (c < 0x80) { cp = c; bytes = 1; }
    else if (c < 0xE0) { cp = c & 0x1F; bytes = 2; }
    else if (c < 0xF0) { cp = c & 0x0F; bytes = 3; }
    else               { cp = c & 0x07; bytes = 4; }
    for (size_t i = 1; i < bytes && i < it->_rem; i++)
        cp = (cp << 6) | ((unsigned char)it->_p[i] & 0x3F);
    *out = cp;
    size_t advance = bytes < it->_rem ? bytes : it->_rem;
    it->_p += advance; it->_rem -= advance;
    return true;
}

/* -------------------------------------------------------------------------
 * Grapheme cluster iteration (simplified: one codepoint per grapheme)
 * ------------------------------------------------------------------------- */
typedef struct { TscCodePointIter _cp; } TscGraphemeIter;

static inline TscGraphemeIter tsc_graphemes(String s) {
    return (TscGraphemeIter){ ._cp = tsc_codepoints(s) };
}

static inline bool tsc_graphemes_next(TscGraphemeIter *it, String *out) {
    if (it->_cp._rem == 0) return false;
    const char *start = it->_cp._p;
    uint32_t _cp_dummy;
    tsc_codepoints_next(&it->_cp, &_cp_dummy);
    size_t len = (size_t)(it->_cp._p - start);
    char *buf = (char *)malloc(len + 1);
    memcpy(buf, start, len); buf[len] = '\0';
    *out = (String){ .data = buf, .length = len, .capacity = len + 1 };
    return true;
}

/* -------------------------------------------------------------------------
 * UTF-8 encode/decode (work on any Array_u8-compatible struct — use macros)
 * Array_u8 is defined by codegen; these macros expand at call site.
 * ------------------------------------------------------------------------- */
#define tsc_encode_utf8(_tsc_str) ({ \
    String _es = (_tsc_str); \
    uint8_t *_ebuf = (uint8_t *)malloc(_es.length); \
    memcpy(_ebuf, _es.data, _es.length); \
    (Array_u8){ .data = _ebuf, .length = _es.length, .capacity = _es.length }; \
})

#define tsc_decode_utf8(_tsc_bytes) ({ \
    size_t _dlen = (_tsc_bytes).length; \
    char *_dbuf = (char *)malloc(_dlen + 1); \
    memcpy(_dbuf, (_tsc_bytes).data, _dlen); \
    _dbuf[_dlen] = '\0'; \
    (String){ .data = _dbuf, .length = _dlen, .capacity = _dlen + 1 }; \
})

TSC_STATICMAP_IMPL(uint8_t, int32_t, u8_i32)

/* -------------------------------------------------------------------------
 * AbortController / AbortSignal
 * Desktop: atomic_bool for thread-safety; Embedded: plain bool
 * ------------------------------------------------------------------------- */
typedef struct {
#ifndef TSC_EMBEDDED
    _Atomic bool aborted;
#else
    bool aborted;
#endif
} TscAbortSignal;

typedef struct {
    TscAbortSignal *signal;
} TscAbortController;

static inline TscAbortController tsc_abort_controller_create(void) {
    TscAbortSignal *sig = (TscAbortSignal *)calloc(1, sizeof(TscAbortSignal));
    return (TscAbortController){ .signal = sig };
}

static inline void tsc_abort_controller_abort(TscAbortController *ctrl) {
#ifndef TSC_EMBEDDED
    atomic_store(&ctrl->signal->aborted, true);
#else
    ctrl->signal->aborted = true;
#endif
}

static inline bool tsc_abort_signal_aborted(TscAbortSignal *sig) {
#ifndef TSC_EMBEDDED
    return atomic_load(&sig->aborted);
#else
    return sig->aborted;
#endif
}

static inline void tsc_abort_controller_free(TscAbortController *ctrl) {
    free(ctrl->signal);
    ctrl->signal = NULL;
}

/* -------------------------------------------------------------------------
 * AsyncMutex — non-blocking mutex for async coordination on event loop
 * Simple boolean lock; in a real event loop the waiter queue would be
 * implemented with callbacks, but for single-threaded async state machines
 * a plain bool is sufficient.
 * ------------------------------------------------------------------------- */
typedef struct {
    bool _locked;
} TscAsyncMutex;

static inline TscAsyncMutex tsc_async_mutex_create(void) {
    return (TscAsyncMutex){ ._locked = false };
}

static inline bool tsc_async_mutex_try_lock(TscAsyncMutex *m) {
    if (m->_locked) return false;
    m->_locked = true;
    return true;
}

static inline void tsc_async_mutex_unlock(TscAsyncMutex *m) {
    m->_locked = false;
}

static inline bool tsc_async_mutex_is_locked(TscAsyncMutex *m) {
    return m->_locked;
}

/* -------------------------------------------------------------------------
 * Thread runtime — tsc_thread_t, tsc_thread_spawn, tsc_thread_join
 * Uses Win32 threads on Windows, pthreads elsewhere.
 * ------------------------------------------------------------------------- */
#ifndef TSC_EMBEDDED
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
typedef struct { HANDLE _h; void *(*_fn)(void *); void *_arg; } _TscThread;
typedef _TscThread *tsc_thread_t;
static DWORD WINAPI _tsc_thread_trampoline(LPVOID arg) {
    _TscThread *t = (_TscThread *)arg;
    t->_fn(t->_arg);
    return 0;
}
static inline tsc_thread_t tsc_thread_spawn(void *(*fn)(void *), void *arg) {
    _TscThread *t = (_TscThread *)malloc(sizeof(_TscThread));
    t->_fn = fn; t->_arg = arg;
    t->_h = CreateThread(NULL, 0, _tsc_thread_trampoline, t, 0, NULL);
    return t;
}
static inline void tsc_thread_join(tsc_thread_t t) {
    WaitForSingleObject(t->_h, INFINITE);
    CloseHandle(t->_h);
    free(t);
}
static inline bool tsc_thread_done(tsc_thread_t t) {
    return WaitForSingleObject(t->_h, 0) == WAIT_OBJECT_0;
}
#else
#include <pthread.h>
typedef pthread_t tsc_thread_t;
static inline tsc_thread_t tsc_thread_spawn(void *(*fn)(void *), void *arg) {
    pthread_t t;
    pthread_create(&t, NULL, fn, arg);
    return t;
}
static inline void tsc_thread_join(tsc_thread_t t) {
    pthread_join(t, NULL);
}
static inline bool tsc_thread_done(tsc_thread_t t) {
    /* Non-blocking join attempt — not portable but works on Linux */
#if defined(__linux__)
    return pthread_tryjoin_np(t, NULL) == 0;
#else
    (void)t; return false;
#endif
}
#endif
#endif /* TSC_EMBEDDED */

/* -------------------------------------------------------------------------
 * Channel runtime — bounded SPSC ring buffer, single-threaded tests only.
 * For multi-threaded use, add mutex guards around send/receive.
 * ------------------------------------------------------------------------- */
#ifndef TSC_EMBEDDED
/* TSC_CHANNEL_DEF(T, TNAME): defines TscChannel_TNAME struct and all operations.
 * try_receive uses a GCC statement-expression so it can reference opt_TNAME
 * which is defined in the generated .c file after #include "runtime.h". */
#define TSC_CHANNEL_DEF(T, TNAME) \
typedef struct { \
    T      *_data; \
    size_t  _cap; \
    size_t  _len; \
    size_t  _head; \
    bool    _closed; \
} TscChannel_##TNAME; \
\
static inline TscChannel_##TNAME *tsc_channel_create_##TNAME(size_t cap) { \
    TscChannel_##TNAME *ch = (TscChannel_##TNAME *)malloc(sizeof(TscChannel_##TNAME)); \
    ch->_data   = (T *)malloc(cap * sizeof(T)); \
    ch->_cap    = cap; \
    ch->_len    = 0; \
    ch->_head   = 0; \
    ch->_closed = false; \
    return ch; \
} \
static inline void tsc_channel_release_##TNAME(TscChannel_##TNAME *ch) { \
    if (!ch) return; \
    free(ch->_data); \
    free(ch); \
} \
static inline bool tsc_channel_try_send_##TNAME(TscChannel_##TNAME *ch, T val) { \
    if (!ch || ch->_closed || ch->_len >= ch->_cap) return false; \
    size_t idx = (ch->_head + ch->_len) % ch->_cap; \
    ch->_data[idx] = val; \
    ch->_len++; \
    return true; \
} \
static inline void tsc_channel_send_##TNAME(TscChannel_##TNAME *ch, T val) { \
    while (!tsc_channel_try_send_##TNAME(ch, val)) {} \
} \
static inline T tsc_channel_receive_##TNAME(TscChannel_##TNAME *ch) { \
    while (!ch || ch->_len == 0) {} \
    T _v_ = ch->_data[ch->_head]; \
    ch->_head = (ch->_head + 1) % ch->_cap; \
    ch->_len--; \
    return _v_; \
} \
/* try_receive: GCC statement-expression so opt_TNAME (from generated file) is in scope */ \
static inline void _tsc_ch_pop_##TNAME(TscChannel_##TNAME *ch, T *out) { \
    *out = ch->_data[ch->_head]; \
    ch->_head = (ch->_head + 1) % ch->_cap; \
    ch->_len--; \
} \
static inline void tsc_channel_close_##TNAME(TscChannel_##TNAME *ch) { \
    if (ch) ch->_closed = true; \
} \
static inline bool tsc_channel_is_empty_##TNAME(TscChannel_##TNAME *ch) { \
    return !ch || ch->_len == 0; \
} \
static inline size_t tsc_channel_length_##TNAME(TscChannel_##TNAME *ch) { \
    return ch ? ch->_len : 0; \
} \
static inline size_t tsc_channel_capacity_##TNAME(TscChannel_##TNAME *ch) { \
    return ch ? ch->_cap : 0; \
}

/* tsc_channel_try_receive_TNAME: must be a macro so opt_TNAME is resolved at call site */
#define tsc_channel_try_receive_i32(ch) ({ \
    TscChannel_i32 *_c_ = (ch); \
    opt_i32 _r_ = {false, 0}; \
    if (_c_ && _c_->_len > 0) { _tsc_ch_pop_i32(_c_, &_r_.value); _r_.has_value = true; } \
    _r_; \
})
#define tsc_channel_try_receive_i64(ch) ({ \
    TscChannel_i64 *_c_ = (ch); \
    opt_i64 _r_ = {false, 0}; \
    if (_c_ && _c_->_len > 0) { _tsc_ch_pop_i64(_c_, &_r_.value); _r_.has_value = true; } \
    _r_; \
})
#define tsc_channel_try_receive_f64(ch) ({ \
    TscChannel_f64 *_c_ = (ch); \
    opt_f64 _r_ = {false, 0}; \
    if (_c_ && _c_->_len > 0) { _tsc_ch_pop_f64(_c_, &_r_.value); _r_.has_value = true; } \
    _r_; \
})
#define tsc_channel_try_receive_bool(ch) ({ \
    TscChannel_bool *_c_ = (ch); \
    opt_bool _r_ = {false, false}; \
    if (_c_ && _c_->_len > 0) { _tsc_ch_pop_bool(_c_, &_r_.value); _r_.has_value = true; } \
    _r_; \
})

/* Instantiate structs + non-try functions for common types */
TSC_CHANNEL_DEF(int32_t, i32)
TSC_CHANNEL_DEF(int64_t, i64)
TSC_CHANNEL_DEF(double,  f64)
TSC_CHANNEL_DEF(bool,    bool)

#endif /* TSC_EMBEDDED */

/* -------------------------------------------------------------------------
 * Async event loop — simple synchronous stub for desktop targets
 * ------------------------------------------------------------------------- */
#ifndef TSC_EMBEDDED

typedef void (*_TscPollFn)(void *);

/* Drive a poll function (wrapping a state struct) to completion. */
#define tsc_event_loop_run(poll_fn) do { \
    struct { int32_t _state; int _result; bool _done; } _sm = {0}; \
    while (!_sm._done) (poll_fn)(&_sm); \
} while (0)

/* Timer stubs: synchronous — callbacks fire immediately, intervals fire once */
typedef int32_t _TscTimerId;

static inline _TscTimerId tsc_set_timeout(void (*fn)(void), int32_t ms) {
    (void)ms;
    fn();
    return 0;
}

static inline _TscTimerId tsc_set_interval(void (*fn)(void), int32_t ms) {
    (void)ms;
    fn();
    return 0;
}

static inline void tsc_clear_timeout(_TscTimerId id) { (void)id; }
static inline void tsc_clear_interval(_TscTimerId id) { (void)id; }

/* Sleep awaitable — synchronous stub: marks done immediately */
typedef struct {
    bool _done;
    int32_t _ms;
} TscSleepAwaitable;

static inline TscSleepAwaitable tsc_sleep_awaitable(int32_t ms) {
    return (TscSleepAwaitable){ ._done = false, ._ms = ms };
}

static inline void tsc_sleep_poll(TscSleepAwaitable *self) {
    self->_done = true;
}

#endif /* TSC_EMBEDDED */

/* -------------------------------------------------------------------------
 * TSC_RUN_ASYNC — drive async main state machine to completion.
 * Default (cooperative): busy spin.  With TSC_SCHEDULER_LIBUV: uv_idle_t.
 * ------------------------------------------------------------------------- */
#ifndef TSC_EMBEDDED

#ifdef TSC_SCHEDULER_LIBUV
#include <uv.h>

typedef struct { void *_sm; void (*_poll)(void *); bool *_done; } _TscUvCtx;

static void _tsc_uv_idle_cb(uv_idle_t *h) {
    _TscUvCtx *c = (_TscUvCtx *)h->data;
    c->_poll(c->_sm);
    if (*c->_done) { uv_idle_stop(h); uv_stop(h->loop); }
}

#define TSC_RUN_ASYNC(state_t, poll_fn, sm_ptr) do {                          \
    uv_loop_t *_loop = uv_default_loop();                                     \
    uv_idle_t _idle_h;                                                        \
    _TscUvCtx _ctx = {                                                        \
        (sm_ptr), (void (*)(void *))(poll_fn), &(sm_ptr)->_done };            \
    uv_idle_init(_loop, &_idle_h);                                            \
    _idle_h.data = &_ctx;                                                     \
    uv_idle_start(&_idle_h, _tsc_uv_idle_cb);                                \
    uv_run(_loop, UV_RUN_DEFAULT);                                            \
    uv_loop_close(_loop);                                                     \
} while (0)

#else /* cooperative */

#define TSC_RUN_ASYNC(state_t, poll_fn, sm_ptr) \
    do { while (!(sm_ptr)->_done) { (poll_fn)(sm_ptr); } } while (0)

#endif /* TSC_SCHEDULER_LIBUV */

#endif /* TSC_EMBEDDED */
