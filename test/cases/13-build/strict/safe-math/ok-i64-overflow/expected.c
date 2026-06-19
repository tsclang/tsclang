#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t a = 9223372036854775807LL;
    int64_t b = 1LL;
    int64_t z = 0;
    MathError _math_err_0 = {0};
    int64_t _math_1;
    if (__builtin_add_overflow((int64_t)(a), (int64_t)(b), &_math_1)) { _math_err_0.operation = "add"; goto _catch_0; }
    z = _math_1;
    goto _catch_end_0;
    _catch_0:
    z = 0;
    _catch_end_0:;
    printf("%lld\n", (long long)z);
    return 0;
}
