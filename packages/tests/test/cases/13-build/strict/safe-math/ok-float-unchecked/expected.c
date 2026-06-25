#include "runtime.h"

int main(void) {
    TSC_INIT();
    double a = 1e308;
    double b = 1e308;
    double z = 0.0;
    MathError _math_err_0 = {0};
    z = a * b;
    goto _catch_end_0;
    _catch_0:
    z = -1.0;
    _catch_end_0:;
    printf("%s\n", tsc_dtoa((double)(z)));
    return 0;
}
