#include "runtime.h"

int main(void) {
    TSC_INIT();
    int16_t a = 32767;
    int16_t b = 1;
    int16_t z = 0;
    MathError _math_err_0 = {0};
    int16_t _math_1;
    if (__builtin_add_overflow((int16_t)(a), (int16_t)(b), &_math_1)) { _math_err_0.operation = "add"; goto _catch_0; }
    z = _math_1;
    goto _catch_end_0;
    _catch_0:
    z = 0;
    _catch_end_0:;
    printf("%d\n", (int)z);
    return 0;
}
