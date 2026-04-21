// TSClang PS2 runtime — PlayStation 2 (ee-gcc / ps2dev SDK)
// Target: TSC_PS2 (ee-gcc, C11, 32MB EE RAM)
// Usage: #include "runtime_ps2.h" instead of runtime.h when --target ps2

#pragma once
#ifndef TSCLANG_RUNTIME_PS2_H
#define TSCLANG_RUNTIME_PS2_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdio.h>

// ps2sdk types: s8/s16/s32/s64, u8/u16/u32/u64 match stdint.h
typedef int8_t   s8;
typedef int16_t  s16;
typedef int32_t  s32;
typedef int64_t  s64;
typedef uint8_t  u8;
typedef uint16_t u16;
typedef uint32_t u32;
typedef uint64_t u64;

// No libuv (no POSIX event loop on PS2)
#define TSC_NO_LIBUV 1

// console.log → scr_printf (ps2sdk screen output)
// On bare-metal builds without ps2sdk, fall back to printf
#ifdef PS2_SDK
#  include <kernel.h>
#  include <loadfile.h>
#  include <tamtypes.h>
void tsc_ps2_puts(const char *s) { scr_printf("%s\n", s); }
#  define tsc_log(s)  tsc_ps2_puts(s)
#else
#  include <stdio.h>
#  define tsc_log(s)  printf("%s\n", s)
#endif

// String type (heap available via malloc on PS2)
#include <stdlib.h>
typedef struct { char *ptr; int32_t len; int32_t cap; } String;

static inline String tsc_str_from(const char *lit) {
    int32_t n = (int32_t)strlen(lit);
    char *p = (char *)malloc((size_t)(n + 1));
    if (!p) { tsc_log("OOM"); while(1); }
    memcpy(p, lit, (size_t)(n + 1));
    return (String){ .ptr = p, .len = n, .cap = n };
}

static inline void tsc_str_free(String *s) { free(s->ptr); s->ptr = 0; s->len = s->cap = 0; }

// Panic/throw
_Noreturn static inline void tsc_throw(const char *msg) { tsc_log(msg); while(1); }
_Noreturn static inline void tsc_panic(const char *msg) { tsc_log(msg); while(1); }

// TSC_INIT: on PS2 we call SifInitRpc() if ps2sdk is present
#ifdef PS2_SDK
#  define TSC_INIT()  do { SifInitRpc(0); scr_init(); } while(0)
#else
#  define TSC_INIT()  do {} while(0)
#endif

#endif /* TSCLANG_RUNTIME_PS2_H */
