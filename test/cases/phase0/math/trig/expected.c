#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", sin(0));
    printf("%g\n", cos(0));
    printf("%g\n", tan(0));
    printf("%g\n", asin(0));
    printf("%g\n", acos(1));
    printf("%g\n", atan(0));
    printf("%g\n", atan2(1, 1));
    return 0;
}
