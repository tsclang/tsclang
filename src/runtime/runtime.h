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
