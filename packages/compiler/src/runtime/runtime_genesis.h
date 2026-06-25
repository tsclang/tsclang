// TSClang Genesis runtime — Sega Genesis / Mega Drive (SGDK / m68k-elf-gcc)
// Target: TSC_GENESIS (GCC m68k, C11, 64KB RAM)
// No heap; no async; console.log → VDP debug plane.

#pragma once
#ifndef TSCLANG_RUNTIME_GENESIS_H
#define TSCLANG_RUNTIME_GENESIS_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

// No libuv
#define TSC_NO_LIBUV 1

// VDP registers (memory-mapped I/O)
#define VDP_CTRL   (*(volatile uint16_t *)0xC00004)
#define VDP_DATA   (*(volatile uint16_t *)0xC00000)
#define Z80_BUSREQ (*(volatile uint16_t *)0xA11100)
#define Z80_RESET  (*(volatile uint16_t *)0xA11200)

// console.log → SGDK kprintf or no-op
#ifdef SGDK
#  include <genesis.h>
#  define tsc_log(s)  kprintf("%s\n", s)
#else
#  define tsc_log(s)  ((void)(s))
#endif

// No-heap String
typedef struct { const char *ptr; int32_t len; } String;

static inline String tsc_str_from(const char *lit) {
    return (String){ .ptr = lit, .len = (int32_t)strlen(lit) };
}

// Panic/throw
_Noreturn static inline void tsc_throw(const char *msg) { tsc_log(msg); while(1); }
_Noreturn static inline void tsc_panic(const char *msg) { tsc_log(msg); while(1); }

// TSC_INIT: Genesis hardware init
#ifdef SGDK
#  define TSC_INIT()  do { VDP_init(); } while(0)
#else
#  define TSC_INIT()  do {} while(0)
#endif

#endif /* TSCLANG_RUNTIME_GENESIS_H */
