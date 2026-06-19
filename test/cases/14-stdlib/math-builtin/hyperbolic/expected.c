#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(sinh(0.0)));
    printf("%g\n", (double)(cosh(0.0)));
    printf("%g\n", (double)(tanh(0.0)));
    printf("%g\n", (double)(asinh(0.0)));
    printf("%g\n", (double)(acosh(1.0)));
    printf("%g\n", (double)(atanh(0.0)));
    return 0;
}
