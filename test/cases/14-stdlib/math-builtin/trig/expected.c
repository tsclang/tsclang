#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(sin(0)));
    printf("%g\n", (double)(cos(0)));
    printf("%g\n", (double)(tan(0)));
    printf("%g\n", (double)(asin(0)));
    printf("%g\n", (double)(acos(1)));
    printf("%g\n", (double)(atan(0)));
    printf("%g\n", (double)(atan2(1, 1)));
    return 0;
}
