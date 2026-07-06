#include "runtime.h"

typedef struct { bool has_value; d8_t value; } opt_d8;

int main(void) {
    TSC_INIT();
    d32_t a = 10000;
    opt_d8 _checked_0;
    _checked_0.has_value = (a >= ((INT8_MIN) * 100) && a <= ((INT8_MAX) * 100));
    _checked_0.value = _checked_0.has_value ? (d8_t)((a) / 100) : (d8_t)0;
    opt_d8 b = _checked_0;
    return 0;
}
