#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t z = 2147483640;
    MathError _math_err_0 = {0};
    int32_t _math_1;
    if (__builtin_add_overflow((int32_t)(z), (int32_t)(10), &_math_1)) { _math_err_0.operation = "add"; goto _catch_0; }
    z = _math_1;
    goto _catch_end_0;
    _catch_0:
    z = 0;
    _catch_end_0:;
    printf("%d\n", z);
    return 0;
}
