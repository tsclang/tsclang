/* std/hal_types.h — shared types for HAL (included by both stubs and platform headers) */
#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef enum {
    TSC_PINMODE_INPUT       = 0,
    TSC_PINMODE_OUTPUT      = 1,
    TSC_PINMODE_INPUTPULLUP = 2
} TscPinMode;
