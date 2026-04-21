// TSClang Spectrum runtime — ZX Spectrum (z88dk / sccz80)
// Target: TSC_SPECTRUM (sccz80 C11 subset, 48KB RAM)
// usize=u16; no heap; no async; no float; console via ROM RST 10h.

#pragma once
#ifndef TSCLANG_RUNTIME_SPECTRUM_H
#define TSCLANG_RUNTIME_SPECTRUM_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

// No libuv
#define TSC_NO_LIBUV 1

// usize on Spectrum = uint16_t (16-bit address space)
// This is enforced by the compiler when --target spectrum

// ZX Spectrum hardware registers
#define BORDER_REG (*(volatile uint8_t *)0xFE)

// console.log → ROM RST 10h (print char) via z88dk
#ifdef Z88DK
#  include <stdio.h>
#  define tsc_log(s)  printf("%s\n", s)
#else
static inline void _tsc_spectrum_puts(const char *s) {
    // Stub: replace with z88dk printk or ROM call
    (void)s;
}
#  define tsc_log(s)  _tsc_spectrum_puts(s)
#endif

// No-heap String: literal refs only
typedef struct { const char *ptr; uint16_t len; } String;

static inline String tsc_str_from(const char *lit) {
    return (String){ .ptr = lit, .len = (uint16_t)strlen(lit) };
}

// Panic/throw: infinite loop
_Noreturn static inline void tsc_throw(const char *msg) { tsc_log(msg); while(1); }
_Noreturn static inline void tsc_panic(const char *msg) { tsc_log(msg); while(1); }

// TSC_INIT: no hardware init required for basic Spectrum
#define TSC_INIT()  do {} while(0)

#endif /* TSCLANG_RUNTIME_SPECTRUM_H */
