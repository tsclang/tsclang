#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t count = 0;
    int32_t a = 3;
    MathError _math_err_0 = {0};
    while (1) {
        int32_t _math_1;
        if (__builtin_sub_overflow((int32_t)(a), (int32_t)(1), &_math_1)) { _math_err_0.operation = "sub"; goto _catch_0; }
        if (!(_math_1 > 0)) break;
        int32_t _math_2;
        if (__builtin_sub_overflow((int32_t)(a), (int32_t)(1), &_math_2)) { _math_err_0.operation = "sub"; goto _catch_0; }
        a = _math_2;
        int32_t _math_3;
        if (__builtin_add_overflow((int32_t)(count), (int32_t)(1), &_math_3)) { _math_err_0.operation = "add"; goto _catch_0; }
        count = _math_3;
    }
    goto _catch_end_0;
    _catch_0:
    count = -1;
    _catch_end_0:;
    printf("%d\n", count);
    return 0;
}
