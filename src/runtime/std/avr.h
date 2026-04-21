/* std/avr.h — TSClang AVR-specific stubs (compile-only for [F] tests) */
#pragma once
#include <stdint.h>

static inline uint16_t tsc_adc_read(uint8_t channel) { (void)channel; return 0; }
static inline void     tsc_pwm_set_duty(uint8_t channel, uint8_t duty) {
    (void)channel; (void)duty;
}
