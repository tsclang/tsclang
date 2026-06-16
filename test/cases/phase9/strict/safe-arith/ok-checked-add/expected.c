#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 2147483640;
    int32_t b = 10;
    int32_t q = 0;
    MathError _math_err_0 = {0};
    int32_t _math_1;
    if (__builtin_add_overflow((int32_t)(a), (int32_t)(b), &_math_1)) { _math_err_0.operation = "add"; goto _catch_0; }
    q = _math_1;
    goto _catch_end_0;
    _catch_0:
    q = 0;
    _catch_end_0:;
    printf("%d\n", q);
    return 0;
}
