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
    if (!p) { tsc_log("OOM"); __builtin_trap(); }
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

#endif /* TSCLANG_RUNTIME_WASM_H */
