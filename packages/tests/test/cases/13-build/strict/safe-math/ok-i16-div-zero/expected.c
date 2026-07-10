#include "runtime.h"

int main(void) {
    TSC_INIT();
    int16_t a = 100;
    int16_t b = 0;
    int16_t z = 0;
    MathError _math_err_0 = {0};
    int16_t _math_1 = b;
    if (_math_1 == 0) { _math_err_0.operation = "div"; goto _catch_0; }
    if (_math_1 == -1 && a == INT16_MIN) { _math_err_0.operation = "div"; goto _catch_0; }
    z = a / _math_1;
    goto _catch_end_0;
    _catch_0:
    z = -1;
    _catch_end_0:;
    printf("%d\n", (int)z);
    return 0;
}
