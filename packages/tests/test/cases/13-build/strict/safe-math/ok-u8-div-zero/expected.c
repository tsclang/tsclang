#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint8_t a = 10U;
    uint8_t b = 0U;
    uint8_t z = 0;
    MathError _math_err_0 = {0};
    uint8_t _math_1 = b;
    if (_math_1 == 0) { _math_err_0.operation = "div"; goto _catch_0; }
    z = a / _math_1;
    goto _catch_end_0;
    _catch_0:
    z = 0;
    _catch_end_0:;
    printf("%u\n", (unsigned)z);
    return 0;
}
