// TSClang PS1 runtime — PlayStation 1 (psn00bsdk / mipsel-unknown-elf-gcc)
// Target: TSC_PS1 (GCC MIPS, C11 subset, 2MB RAM)
// No heap by default; no async; soft-float optional.

#pragma once
#ifndef TSCLANG_RUNTIME_PS1_H
#define TSCLANG_RUNTIME_PS1_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

// No libuv, no POSIX
#define TSC_NO_LIBUV 1

// console.log → tty output via psn00bsdk TTY or BIOS putchar
#ifdef PSN00B_SDK
#  include <psxetc.h>
#  define tsc_log(s)  FntPrint(-1, "%s\n", s)
#else
static inline void _tsc_ps1_puts(const char *s) {
    while (*s) {
        // BIOS A-function 0x3C: putchar
        __asm__ volatile("" ::: "memory");
        (void)s; break; // stub — replace with BIOS call in real code
    }
}
#  define tsc_log(s)  _tsc_ps1_puts(s)
#endif

// No-heap String: points to string literals only (no malloc)
typedef struct { const char *ptr; int32_t len; } String;

static inline String tsc_str_from(const char *lit) {
    return (String){ .ptr = lit, .len = (int32_t)strlen(lit) };
}

// Panic/throw: infinite loop (no exceptions on PS1)
_Noreturn static inline void tsc_throw(const char *msg) { tsc_log(msg); while(1); }
_Noreturn static inline void tsc_panic(const char *msg) { tsc_log(msg); while(1); }

// TSC_INIT: ResetCallback + init GPU
#ifdef PSN00B_SDK
#  define TSC_INIT()  do { ResetCallback(); } while(0)
#else
#  define TSC_INIT()  do {} while(0)
#endif

#endif /* TSCLANG_RUNTIME_PS1_H */
