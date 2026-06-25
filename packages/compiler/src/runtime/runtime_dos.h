// TSClang DOS runtime — MS-DOS (djgpp / i386-pc-msdosdjgpp GCC)
// Target: TSC_DOS (djgpp C11, heap via DPMI, int 21h I/O)
// Full C11, stdio available via djgpp libc.

#pragma once
#ifndef TSCLANG_RUNTIME_DOS_H
#define TSCLANG_RUNTIME_DOS_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// No libuv (no POSIX event loop)
#define TSC_NO_LIBUV 1

// console.log → puts (djgpp has full stdio)
#define tsc_log(s)  puts(s)

// String: heap-backed (djgpp has malloc via DPMI)
typedef struct { char *ptr; int32_t len; int32_t cap; } String;

static inline String tsc_str_from(const char *lit) {
    int32_t n = (int32_t)strlen(lit);
    char *p = (char *)malloc((size_t)(n + 1));
    if (!p) { puts("OOM"); while(1); }
    memcpy(p, lit, (size_t)(n + 1));
    return (String){ .ptr = p, .len = n, .cap = n };
}
static inline void tsc_str_free(String *s) { free(s->ptr); s->ptr = 0; s->len = s->cap = 0; }

// Panic/throw
_Noreturn static inline void tsc_throw(const char *msg) { puts(msg); exit(1); }
_Noreturn static inline void tsc_panic(const char *msg) { puts(msg); exit(1); }

// TSC_INIT: nothing required for DOS
#define TSC_INIT()  do {} while(0)

#endif /* TSCLANG_RUNTIME_DOS_H */
