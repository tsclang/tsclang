#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", floor(2.7));
    printf("%g\n", ceil(2.1));
    printf("%g\n", round(2.5));
    printf("%g\n", round(2.4));
    printf("%g\n", trunc(2.9));
    printf("%g\n", trunc(-2.9));
    return 0;
}
