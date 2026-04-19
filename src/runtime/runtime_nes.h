/*
 * TSClang NES runtime — cc65 / 6502 target
 * Replaces runtime.h when compiling with -DTSC_NES (--target nes).
 *
 * Constraints vs desktop runtime:
 *   - No heap (malloc/free absent): String heap ops not available
 *   - No stdio (printf absent): console.log → stub (silent or PPU text)
 *   - No POSIX (clock_gettime absent): performance.now() → returns 0
 *   - No float/double: f32/f64 are soft-float, extremely slow — avoid
 *   - usize = uint16_t (6502 native pointer width)
 *   - Stack: 256 bytes (page 1); keep recursion minimal
 *
 * cc65 C99-subset support:
 *   - compound literals ✓, designated initializers ✓
 *   - stdbool.h ✓, stdint.h ✓, static inline ✓
 *   - _Noreturn ✗ → defined as empty macro below
 *   - va_copy ✗ → not available (avoid variadic heap format)
 *   - snprintf/vsnprintf ✗ → only sprintf available
 *
 * Type mapping (TSClang → C on NES):
 *   i8→int8_t   i16→int16_t   i32→int32_t   i64→int64_t
 *   u8→uint8_t  u16→uint16_t  u32→uint32_t  u64→uint64_t
 *   usize→uint16_t  (NES: 16-bit address space)
 *   f32/f64 → avoid; use only if absolutely necessary
 *   bool→bool    string→String (literals only, no heap)
 */

#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>

/* cc65 does not support _Noreturn; define as empty */
#define _Noreturn

/* NES: usize is 16-bit */
typedef uint16_t usize;

/* -------------------------------------------------------------------------
 * NES Memory-Mapped I/O registers ($2000–$401F)
 * Declare as volatile to prevent compiler optimization of MMIO accesses.
 * Use via: PPU_CTRL = 0x80; / uint8_t s = PPU_STATUS;
 * ------------------------------------------------------------------------- */
#define PPU_CTRL    (*(volatile uint8_t*)0x2000)  /* PPUCTRL   W  */
#define PPU_MASK    (*(volatile uint8_t*)0x2001)  /* PPUMASK   W  */
#define PPU_STATUS  (*(volatile uint8_t*)0x2002)  /* PPUSTATUS R  */
#define OAM_ADDR    (*(volatile uint8_t*)0x2003)  /* OAMADDR   W  */
#define OAM_DATA    (*(volatile uint8_t*)0x2004)  /* OAMDATA   RW */
#define PPU_SCROLL  (*(volatile uint8_t*)0x2005)  /* PPUSCROLL W  (2x write) */
#define PPU_ADDR    (*(volatile uint8_t*)0x2006)  /* PPUADDR   W  (2x write) */
#define PPU_DATA    (*(volatile uint8_t*)0x2007)  /* PPUDATA   RW */
#define OAM_DMA     (*(volatile uint8_t*)0x4014)  /* OAMDMA    W  */
#define APU_SQ1_VOL (*(volatile uint8_t*)0x4000)
#define APU_SQ1_SWP (*(volatile uint8_t*)0x4001)
#define APU_SQ1_LO  (*(volatile uint8_t*)0x4002)
#define APU_SQ1_HI  (*(volatile uint8_t*)0x4003)
#define APU_SQ2_VOL (*(volatile uint8_t*)0x4004)
#define APU_SQ2_SWP (*(volatile uint8_t*)0x4005)
#define APU_SQ2_LO  (*(volatile uint8_t*)0x4006)
#define APU_SQ2_HI  (*(volatile uint8_t*)0x4007)
#define APU_TRI_LIN (*(volatile uint8_t*)0x4008)
#define APU_TRI_LO  (*(volatile uint8_t*)0x400A)
#define APU_TRI_HI  (*(volatile uint8_t*)0x400B)
#define APU_NOISE_V (*(volatile uint8_t*)0x400C)
#define APU_NOISE_P (*(volatile uint8_t*)0x400E)
#define APU_NOISE_L (*(volatile uint8_t*)0x400F)
#define APU_STATUS  (*(volatile uint8_t*)0x4015)
#define APU_FRAME   (*(volatile uint8_t*)0x4017)
#define JOY1        (*(volatile uint8_t*)0x4016)
#define JOY2        (*(volatile uint8_t*)0x4017)

/* -------------------------------------------------------------------------
 * Controller button masks
 * ------------------------------------------------------------------------- */
#define PAD_A      0x80
#define PAD_B      0x40
#define PAD_SELECT 0x20
#define PAD_START  0x10
#define PAD_UP     0x08
#define PAD_DOWN   0x04
#define PAD_LEFT   0x02
#define PAD_RIGHT  0x01

/* Read controller state (strobe + read 8 bits) */
static inline uint8_t nes_read_joy(volatile uint8_t *joy) {
    uint8_t r = 0;
    JOY1 = 1; JOY1 = 0;
    for (uint8_t i = 0; i < 8; i++) {
        r = (uint8_t)((r << 1) | (*joy & 1));
    }
    return r;
}
#define readJoy1() nes_read_joy(&JOY1)
#define readJoy2() nes_read_joy(&JOY2)

/* -------------------------------------------------------------------------
 * String — literals only, no heap on NES
 * ------------------------------------------------------------------------- */
typedef struct {
    const char *data;
    uint16_t    length;
    uint16_t    capacity; /* always 0 on NES (no heap) */
} String;

#define STR_LIT(s) ((String){ .data = (s), .length = (uint16_t)(sizeof(s) - 1), .capacity = 0 })
#define STR_LIT_RUNTIME(s) ((String){ .data = (s), .length = (uint16_t)strlen(s), .capacity = 0 })

/* Optional byte */
typedef struct { bool has_value; uint8_t value; } opt_u8;

static inline opt_u8 tsc_string_at(String s, int16_t idx) {
    int16_t len = (int16_t)s.length;
    if (idx < 0) idx = (int16_t)(idx + len);
    if (idx < 0 || idx >= len) return (opt_u8){ false, 0 };
    return (opt_u8){ true, (uint8_t)(unsigned char)s.data[idx] };
}

/* -------------------------------------------------------------------------
 * TscError — minimal, no heap string
 * ------------------------------------------------------------------------- */
typedef struct TscError {
    String message;
} TscError;

/* tsc_throw / tsc_panic — hang on NES (no stderr) */
_Noreturn static inline void tsc_throw(String msg) {
    (void)msg;
    while (1) {} /* halt; consider triggering a reset via $FFFC jump */
}

_Noreturn static inline void tsc_panic(String msg) {
    (void)msg;
    while (1) {}
}

static inline String tsc_capture_stack(void) {
    static const char _s[] = "";
    return (String){ .data = _s, .length = 0, .capacity = 0 };
}

/* -------------------------------------------------------------------------
 * console.log → no-op on NES (no stdout)
 * Override by providing custom tsc_nes_print in platform profile.
 * ------------------------------------------------------------------------- */
#ifndef tsc_nes_print_str
#define tsc_nes_print_str(s)   ((void)(s))
#endif
#ifndef tsc_nes_print_i32
#define tsc_nes_print_i32(v)   ((void)(v))
#endif
#ifndef tsc_nes_print_u32
#define tsc_nes_print_u32(v)   ((void)(v))
#endif
#ifndef tsc_nes_print_bool
#define tsc_nes_print_bool(v)  ((void)(v))
#endif

/* -------------------------------------------------------------------------
 * Numeric → String (sprintf with static buffer; no vsnprintf on cc65)
 * ------------------------------------------------------------------------- */
#include <stdio.h>
static inline String tsc_i32_to_string(int32_t v) {
    static char _buf[12];
    sprintf(_buf, "%ld", (long)v);
    return STR_LIT_RUNTIME(_buf);
}
static inline String tsc_i64_to_string(int64_t v) {
    static char _buf[24];
    sprintf(_buf, "%ld", (long)v);
    return STR_LIT_RUNTIME(_buf);
}
static inline String tsc_f64_to_string(double v) {
    static char _buf[32];
    sprintf(_buf, "%g", v);
    return STR_LIT_RUNTIME(_buf);
}

/* -------------------------------------------------------------------------
 * String queries — no heap, no malloc; safe for literal-only strings
 * ------------------------------------------------------------------------- */
static inline bool tsc_string_includes(String s, String sub) {
    if (sub.length == 0) return true;
    if (sub.length > s.length) return false;
    for (uint16_t i = 0; i <= s.length - sub.length; i++)
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

static inline int16_t tsc_string_index_of(String s, String sub) {
    if (sub.length == 0) return 0;
    if (sub.length > s.length) return -1;
    for (uint16_t i = 0; i <= s.length - sub.length; i++)
        if (memcmp(s.data + i, sub.data, sub.length) == 0) return (int16_t)i;
    return -1;
}

/* -------------------------------------------------------------------------
 * performance.now() — NES has no real-time clock; returns frame counter
 * Increment _tsc_frame each NMI to get approximate timing.
 * ------------------------------------------------------------------------- */
volatile uint16_t _tsc_frame = 0;

static inline double tsc_performance_now(void) {
    return (double)_tsc_frame * (1000.0 / 60.0); /* ~16.67ms per frame */
}

/* -------------------------------------------------------------------------
 * TSC_INIT — NES startup (PPU warm-up: wait 2 VBlanks)
 * NMI handler must be provided by the game (in platform profile crt0).
 * ------------------------------------------------------------------------- */
static inline void _tsc_init(void) {
    /* Wait for first VBlank */
    PPU_CTRL = 0x00;
    PPU_MASK = 0x00;
    while (!(PPU_STATUS & 0x80)) {}
    /* Wait for second VBlank (PPU fully warmed up) */
    while (!(PPU_STATUS & 0x80)) {}
}
#define TSC_INIT() _tsc_init()

/* -------------------------------------------------------------------------
 * Panic on unavailable desktop features
 * ------------------------------------------------------------------------- */
#define TSC_NES_NO_HEAP() tsc_panic(STR_LIT("heap not available on NES"))
