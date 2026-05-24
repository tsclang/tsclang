#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", fabs(-5));
    printf("%g\n", fabs(3.14));
    printf("%g\n", fmin(1, 2));
    printf("%g\n", fmax(1, 2));
    return 0;
}
