#include "runtime.h"

typedef struct { bool has_value; d8_t value; } opt_d8;

int main(void) {
    TSC_INIT();
    int32_t big = 200;
    opt_d8 _checked_0;
    _checked_0.has_value = (big >= ((INT8_MIN) / 100) && big <= ((INT8_MAX) / 100));
    _checked_0.value = _checked_0.has_value ? (d8_t)((big) * 100) : (d8_t)0;
    opt_d8 r = _checked_0;
    if (r.has_value) {
        d8_t v = r.value;
    }
    return 0;
}
