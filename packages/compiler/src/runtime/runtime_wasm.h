// TSClang WebAssembly runtime
// Target: TSC_WASM (Emscripten / clang wasm32-unknown-unknown)
// No libuv; console.log → imported JS function; tsc_throw → wasm trap.

#pragma once
#ifndef TSCLANG_RUNTIME_WASM_H
#define TSCLANG_RUNTIME_WASM_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

// No libuv (no POSIX event loop on WASM)
#define TSC_NO_LIBUV 1

// JS import: wasm_log(ptr, len) — implemented in JS glue
__attribute__((import_module("env"), import_name("log")))
void _wasm_log(const char *ptr, int32_t len);

static inline void tsc_wasm_puts(const char *s) {
    _wasm_log(s, (int32_t)strlen(s));
}
#define tsc_log(s)  tsc_wasm_puts(s)

// String type: heap-backed (wasm linear memory has malloc)
typedef struct { char *ptr; int32_t len; int32_t cap; } String;

static inline String tsc_str_from(const char *lit) {
    int32_t n = (int32_t)strlen(lit);
    char *p = (char *)malloc((size_t)(n + 1));
    if (!p) { tsc_log("panic[E403]: out of memory"); __builtin_trap(); }
    memcpy(p, lit, (size_t)(n + 1));
    return (String){ .ptr = p, .len = n, .cap = n };
}
static inline void tsc_str_free(String *s) { free(s->ptr); s->ptr = 0; s->len = s->cap = 0; }

// Panic/throw → wasm trap (unreachable instruction)
__attribute__((noreturn)) static inline void tsc_throw(const char *msg) { tsc_log(msg); __builtin_trap(); }
__attribute__((noreturn)) static inline void tsc_panic(const char *msg) { tsc_log(msg); __builtin_trap(); }

// TSC_INIT: nothing required for bare wasm32; Emscripten handles its own init
#define TSC_INIT()  do {} while(0)

// WASM exports: functions to be exported to JavaScript
#define WASM_EXPORT  __attribute__((visibility("default")))

// -------------------------------------------------------------------------
// TscRandom — xorshift64 PRNG (same algorithm as runtime.h)
// -------------------------------------------------------------------------
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

// JS import: random_seed() — returns uint64_t seed from Math.random()
__attribute__((import_module("env"), import_name("random_seed")))
uint64_t _wasm_random_seed(void);
static inline TscRandom tsc_random_default(void) {
    uint64_t seed = _wasm_random_seed();
    if (seed == 0) seed = 1;
    return (TscRandom){ seed };
}

// -------------------------------------------------------------------------
// console.time / console.timeEnd via JS performance.now()
// -------------------------------------------------------------------------
__attribute__((import_module("env"), import_name("time_now")))
double _wasm_time_now(void);

#define TSC_MAX_TIMERS 8
static struct { const char *label; double start; } _tsc_timers[TSC_MAX_TIMERS];
static int _tsc_timer_count = 0;

static inline void tsc_console_time(const char *label) {
    if (_tsc_timer_count < TSC_MAX_TIMERS) {
        _tsc_timers[_tsc_timer_count].label = label;
        _tsc_timers[_tsc_timer_count].start = _wasm_time_now();
        _tsc_timer_count++;
    }
}
static inline void tsc_console_time_end(const char *label) {
    double end = _wasm_time_now();
    for (int i = _tsc_timer_count - 1; i >= 0; i--) {
        if (strcmp(_tsc_timers[i].label, label) == 0) {
            char buf[128];
            snprintf(buf, sizeof(buf), "%s: %.3fms", label, end - _tsc_timers[i].start);
            tsc_wasm_puts(buf);
            for (int j = i; j < _tsc_timer_count - 1; j++) _tsc_timers[j] = _tsc_timers[j + 1];
            _tsc_timer_count--;
            return;
        }
    }
}

// printf → _wasm_log via snprintf buffer
#define printf(...) do { char _tsc_buf[512]; snprintf(_tsc_buf, sizeof(_tsc_buf), __VA_ARGS__); tsc_wasm_puts(_tsc_buf); } while(0)
#define fprintf(stream, ...) do { char _tsc_buf[512]; snprintf(_tsc_buf, sizeof(_tsc_buf), __VA_ARGS__); tsc_wasm_puts(_tsc_buf); } while(0)

#endif /* TSCLANG_RUNTIME_WASM_H */
