#include "runtime.h"

int main(void) {
    TSC_INIT();
    int8_t a = 127;
    int8_t b = 1;
    int8_t z = 0;
    MathError _math_err_0 = {0};
    int8_t _math_1;
    if (__builtin_add_overflow((int8_t)(a), (int8_t)(b), &_math_1)) { _math_err_0.operation = "add"; goto _catch_0; }
    z = _math_1;
    goto _catch_end_0;
    _catch_0:
    z = 0;
    _catch_end_0:;
    printf("%d\n", (int)z);
    return 0;
}
