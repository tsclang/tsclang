#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = -2147483648;
    int32_t b = -1;
    int32_t z = 0;
    MathError _math_err_0 = {0};
    int32_t _math_1 = b;
    if (_math_1 == 0) { _math_err_0.operation = "div"; goto _catch_0; }
    if (_math_1 == -1 && a == INT32_MIN) { _math_err_0.operation = "div"; goto _catch_0; }
    z = a / _math_1;
    goto _catch_end_0;
    _catch_0:
    z = 0;
    _catch_end_0:;
    printf("%d\n", z);
    return 0;
}
