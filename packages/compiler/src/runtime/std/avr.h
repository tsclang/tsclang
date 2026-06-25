/* std/avr.h — TSClang AVR-specific stubs (desktop / no-op) */
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include "avr_types.h"

static inline uint16_t tsc_adc_read(uint8_t channel) { (void)channel; return 0; }
static inline void     tsc_pwm_set_duty(uint8_t channel, uint8_t duty) {
    (void)channel; (void)duty;
}

static inline void tsc_avr_pin_mode(uint8_t pin, uint8_t mode) { (void)pin; (void)mode; }
static inline void tsc_avr_digital_write(uint8_t pin, bool val) { (void)pin; (void)val; }
static inline bool tsc_avr_digital_read(uint8_t pin) { (void)pin; return false; }

static inline void tsc_avr_delay(uint32_t ms) { (void)ms; }
static inline void tsc_avr_delay_us(uint32_t us) { (void)us; }

static inline void tsc_avr_serial_begin(uint32_t baud) { (void)baud; }
static inline void tsc_avr_serial_write(const uint8_t *data, size_t len) {
    (void)data; (void)len;
}
static inline uint8_t tsc_avr_serial_read(void) { return 0; }
static inline bool    tsc_avr_serial_available(void) { return false; }

static inline void tsc_avr_analog_write(uint8_t pin, uint8_t val) { (void)pin; (void)val; }

static inline void tsc_avr_interrupt_enable(void)  {}
static inline void tsc_avr_interrupt_disable(void) {}
