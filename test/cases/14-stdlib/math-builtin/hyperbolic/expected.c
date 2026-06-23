#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(sinh(0.0))));
    printf("%s\n", tsc_dtoa((double)(cosh(0.0))));
    printf("%s\n", tsc_dtoa((double)(tanh(0.0))));
    printf("%s\n", tsc_dtoa((double)(asinh(0.0))));
    printf("%s\n", tsc_dtoa((double)(acosh(1.0))));
    printf("%s\n", tsc_dtoa((double)(atanh(0.0))));
    return 0;
}
