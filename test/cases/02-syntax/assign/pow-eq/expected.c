#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    double x = 2.0;
    x = pow(x, 8.0);
    printf("%s\n", tsc_dtoa((double)(x)));
    return 0;
}
