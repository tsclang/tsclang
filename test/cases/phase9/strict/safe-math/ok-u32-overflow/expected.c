#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint32_t a = 4294967295U;
    uint32_t b = 1U;
    uint32_t z = 0;
    MathError _math_err_0 = {0};
    uint32_t _math_1;
    if (__builtin_add_overflow((uint32_t)(a), (uint32_t)(b), &_math_1)) { _math_err_0.operation = "add"; goto _catch_0; }
    z = _math_1;
    goto _catch_end_0;
    _catch_0:
    z = 0;
    _catch_end_0:;
    printf("%u\n", z);
    return 0;
}
