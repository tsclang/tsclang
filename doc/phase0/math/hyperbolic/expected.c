#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", sinh(0.0));
    printf("%g\n", cosh(0.0));
    printf("%g\n", tanh(0.0));
    printf("%g\n", asinh(0.0));
    printf("%g\n", acosh(1.0));
    printf("%g\n", atanh(0.0));
    return 0;
}
