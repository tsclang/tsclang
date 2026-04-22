/* std/hal.h — TSClang hardware abstraction layer stubs (desktop / no-op) */
#pragma once
#include <stdlib.h>
#include "hal_types.h"

static inline void tsc_gpio_mode(uint8_t pin, TscPinMode mode) { (void)pin; (void)mode; }
static inline void tsc_gpio_output(uint8_t pin) { (void)pin; }
static inline void tsc_gpio_input(uint8_t pin)  { (void)pin; }
static inline bool tsc_gpio_read(uint8_t pin)   { (void)pin; return false; }
static inline void tsc_gpio_write(uint8_t pin, bool val) { (void)pin; (void)val; }

static inline void tsc_i2c_begin(void) {}
static inline void tsc_i2c_write(uint8_t addr, const uint8_t *buf, size_t len) {
    (void)addr; (void)buf; (void)len;
}
/* tsc_i2c_read returns Array_u8 defined by codegen — use macro */
#define tsc_i2c_read(_addr, _n) ({ \
    (void)(_addr); \
    size_t _rn = (_n); \
    uint8_t *_rbuf = (uint8_t *)calloc(_rn, 1); \
    (Array_u8){ .data = _rbuf, .length = _rn, .capacity = _rn }; \
})

static inline void tsc_spi_begin(void) {}
static inline uint8_t tsc_spi_transfer(uint8_t byte) { (void)byte; return 0; }

static inline void   tsc_uart_init(uint32_t baud) { (void)baud; }
static inline void   tsc_uart_write(uint8_t byte)  { (void)byte; }
static inline bool   tsc_uart_available(void) { return false; }
static inline opt_u8 tsc_uart_read(void) { return (opt_u8){ false, 0 }; }
