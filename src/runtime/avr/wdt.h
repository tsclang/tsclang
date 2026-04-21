/* avr/wdt.h — desktop stub for AVR watchdog timer */
#pragma once
static inline void wdt_reset(void) {}
static inline void wdt_enable(int timeout) { (void)timeout; }
static inline void wdt_disable(void) {}
