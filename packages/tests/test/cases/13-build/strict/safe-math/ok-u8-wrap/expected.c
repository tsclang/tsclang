#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint8_t a = 255U;
    uint8_t b = 1U;
    uint8_t z = 0;
    MathError _math_err_0 = {0};
    uint8_t _math_1;
    if (__builtin_add_overflow((uint8_t)(a), (uint8_t)(b), &_math_1)) { _math_err_0.operation = "add"; goto _catch_0; }
    z = _math_1;
    goto _catch_end_0;
    _catch_0:
    z = 0;
    _catch_end_0:;
    printf("%u\n", (unsigned)z);
    return 0;
}
