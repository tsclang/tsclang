/* std/avr_types.h — shared types for AVR stdlib */
#pragma once

typedef enum {
    TSC_SLEEP_IDLE        = 0,
    TSC_SLEEP_ADC         = 1,
    TSC_SLEEP_PWR_DOWN    = 2,
    TSC_SLEEP_PWR_SAVE    = 3,
    TSC_SLEEP_STANDBY     = 4,
    TSC_SLEEP_EXT_STANDBY = 5
} TscSleepMode;
