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
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    _tsc_t0 = (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1.0e6;
}

static inline double tsc_performance_now(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1.0e6 - _tsc_t0;
}

/* Compiler inserts this at the top of main() */
#define TSC_INIT() _tsc_init()

/* -------------------------------------------------------------------------
 * String utilities
 * ------------------------------------------------------------------------- */

/* Create a String from a runtime (non-literal) char pointer */
#define STR_LIT_RUNTIME(s) ((String){ .data = (s), .length = strlen(s), .capacity = 0 })

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
typedef struct { K _keys[TSC_MAP_CAP]; V _vals[TSC_MAP_CAP]; size_t _count; } TscMap_##SUFFIX; \
static inline TscMap_##SUFFIX tsc_map_create_##SUFFIX(void) { \
    TscMap_##SUFFIX m; m._count = 0; return m; } \
static inline void tsc_map_set_##SUFFIX(TscMap_##SUFFIX *m, K key, V val) { \
    for (size_t _i = 0; _i < m->_count; _i++) { \
        if (m->_keys[_i].length == key.length && memcmp(m->_keys[_i].data, key.data, key.length) == 0) { \
            m->_vals[_i] = val; return; } } \
    if (m->_count < TSC_MAP_CAP) { m->_keys[m->_count] = key; m->_vals[m->_count] = val; m->_count++; } } \
static inline V tsc_map_get_##SUFFIX(const TscMap_##SUFFIX *m, K key) { \
    for (size_t _i = 0; _i < m->_count; _i++) { \
        if (m->_keys[_i].length == key.length && memcmp(m->_keys[_i].data, key.data, key.length) == 0) \
            return m->_vals[_i]; } \
    return (V){0}; }

TSC_MAP_DECL(String, int32_t, string_i32)

/* tsc_throw — used for 'throw new Error(msg)' in _Noreturn functions */
#include <stdlib.h>
_Noreturn static inline void tsc_throw(String msg) {
    fprintf(stderr, "Error: %.*s\n", (int)msg.length, msg.data);
    exit(1);
}

/* Numeric-to-string conversions (used by optional chaining x?.toString()) */
static inline String tsc_i32_to_string(int32_t v) {
    static char _tsc_i32_buf[32];
    int n = snprintf(_tsc_i32_buf, sizeof(_tsc_i32_buf), "%d", v);
    return (String){ .data = _tsc_i32_buf, .length = (size_t)(n > 0 ? n : 0), .capacity = 0 };
}
static inline String tsc_i64_to_string(int64_t v) {
    static char _tsc_i64_buf[32];
    int n = snprintf(_tsc_i64_buf, sizeof(_tsc_i64_buf), "%lld", (long long)v);
    return (String){ .data = _tsc_i64_buf, .length = (size_t)(n > 0 ? n : 0), .capacity = 0 };
}
static inline String tsc_f64_to_string(double v) {
    static char _tsc_f64_buf[64];
    int n = snprintf(_tsc_f64_buf, sizeof(_tsc_f64_buf), "%g", v);
    return (String){ .data = _tsc_f64_buf, .length = (size_t)(n > 0 ? n : 0), .capacity = 0 };
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
