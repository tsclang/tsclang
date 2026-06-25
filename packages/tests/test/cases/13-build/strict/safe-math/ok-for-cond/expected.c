#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 3;
    int32_t b = 2;
    int32_t sum = 0;
    MathError _math_err_0 = {0};
    for (double i = 0;;) {
        int32_t _math_1;
        if (__builtin_add_overflow((int32_t)(a), (int32_t)(b), &_math_1)) { _math_err_0.operation = "add"; goto _catch_0; }
        if (!(i < _math_1)) break;
        int32_t _math_2;
        if (__builtin_add_overflow((int32_t)(sum), (int32_t)(i), &_math_2)) { _math_err_0.operation = "add"; goto _catch_0; }
        sum = _math_2;
        i++;
    }
    goto _catch_end_0;
    _catch_0:
    sum = -1;
    _catch_end_0:;
    printf("%d\n", sum);
    return 0;
}
